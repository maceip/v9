/**
 * guard.js — Anti-abuse policy for the hosted Wisp server.
 *
 * This module is the security boundary. Everything here runs on every
 * TCP stream request, before any bytes cross the server to the destination.
 *
 * Hard rules (NOT configurable at runtime, only at deploy time via env):
 *
 *   1. Destination IP blocklist — RFC 1918 private, loopback, link-local,
 *      multicast, unspecified, IPv6 ULA, and most importantly the
 *      169.254.169.254 cloud metadata service. Blocking these prevents
 *      the server from being used to pivot into the cloud VPC or probe
 *      internal services.
 *
 *   2. Destination port blocklist — SMTP (25, 465, 587) is blocked by
 *      default because it's the #1 open-relay abuse vector. IRC (6667)
 *      and Telnet (23) are also blocked by default since they're
 *      common abuse channels.
 *
 *   3. Hostname pre-resolve — we resolve the hostname ourselves, check
 *      the resolved IP against the blocklist, THEN connect. Otherwise
 *      an attacker could bypass the blocklist by using a DNS name that
 *      resolves to a private IP (DNS rebinding).
 *
 * Soft limits (configurable via env vars):
 *
 *   - WISP_MAX_STREAMS_PER_SESSION  (default 32)
 *   - WISP_MAX_SESSIONS_PER_IP      (default 10)
 *   - WISP_BANDWIDTH_BPS            (default 10 MB/s per session, 0 = unlimited)
 *   - WISP_STREAM_IDLE_MS           (default 60000, 0 = unlimited)
 *   - WISP_STREAM_MAX_LIFETIME_MS   (default 1800000 = 30 min, 0 = unlimited)
 *   - WISP_ORIGIN_ALLOWLIST         (comma-separated origins, default allows localhost + common Pages origin)
 *   - WISP_EXTRA_BLOCKED_PORTS      (comma-separated)
 *   - WISP_DISABLE_PRIVATE_IP_BLOCK (set to 1 ONLY for private testing — NOT for public deployment)
 */

import { isIP } from 'node:net';
import { promises as dns } from 'node:dns';

// ─── Destination IP blocklist ─────────────────────────────────────────

/**
 * CIDR check for IPv4. Accepts a dotted-quad and a CIDR like '10.0.0.0/8'.
 */
function ipv4InCidr(ip, cidr) {
  const [base, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const ipNum = ipv4ToInt(ip);
  const baseNum = ipv4ToInt(base);
  if (ipNum == null || baseNum == null) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : ((0xffffffff << (32 - bits)) >>> 0);
  return (ipNum & mask) === (baseNum & mask);
}

function ipv4ToInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n * 256) + v;
  }
  return n >>> 0;
}

// Full list of forbidden IPv4 CIDRs.
const FORBIDDEN_IPV4 = [
  '0.0.0.0/8',        // current network (unspecified)
  '10.0.0.0/8',       // RFC 1918 private
  '127.0.0.0/8',      // loopback
  '169.254.0.0/16',   // link-local (includes AWS/Azure/GCP metadata 169.254.169.254)
  '172.16.0.0/12',    // RFC 1918 private
  '192.0.0.0/24',     // IETF special
  '192.0.2.0/24',     // TEST-NET-1
  '192.168.0.0/16',   // RFC 1918 private
  '198.18.0.0/15',    // benchmarking
  '198.51.100.0/24',  // TEST-NET-2
  '203.0.113.0/24',   // TEST-NET-3
  '224.0.0.0/4',      // multicast
  '240.0.0.0/4',      // reserved
  '255.255.255.255/32', // broadcast
];

// IPv6: simpler check because most ranges we care about have short prefixes.
// We don't need a full v6 CIDR parser; match known prefixes by string.
const FORBIDDEN_IPV6_PREFIXES = [
  '::',          // unspecified (::, ::0)
  '::1',         // loopback
  '::ffff:',     // v4-mapped — check the underlying v4
  'fc', 'fd',    // ULA fc00::/7
  'fe80:', 'fe81:', 'fe82:', 'fe83:', 'fe84:', 'fe85:', 'fe86:', 'fe87:',
  'fe88:', 'fe89:', 'fe8a:', 'fe8b:', 'fe8c:', 'fe8d:', 'fe8e:', 'fe8f:',
  'fe90:', 'fe91:', 'fe92:', 'fe93:', 'fe94:', 'fe95:', 'fe96:', 'fe97:',
  'fe98:', 'fe99:', 'fe9a:', 'fe9b:', 'fe9c:', 'fe9d:', 'fe9e:', 'fe9f:',
  'fea', 'feb',  // link-local fe80::/10 expands to fe80-febf
  'ff',          // multicast ff00::/8
];

/**
 * True if the given IP literal is in a blocked range. Works for both v4 and v6.
 * @param {string} ip - IP literal (e.g. "10.0.0.1" or "::1")
 */
export function isBlockedIp(ip) {
  if (process.env.WISP_DISABLE_PRIVATE_IP_BLOCK === '1') return false;

  const family = isIP(ip);
  if (family === 0) return true; // unparseable → block

  if (family === 4) {
    for (const cidr of FORBIDDEN_IPV4) {
      if (ipv4InCidr(ip, cidr)) return true;
    }
    return false;
  }

  // IPv6
  const lower = ip.toLowerCase();
  // Check v4-mapped (::ffff:a.b.c.d)
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7);
    if (isIP(v4) === 4) return isBlockedIp(v4);
  }
  if (lower === '::' || lower === '::0' || lower === '0:0:0:0:0:0:0:0') return true;
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  for (const prefix of FORBIDDEN_IPV6_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}

// ─── Port blocklist ───────────────────────────────────────────────────

const DEFAULT_BLOCKED_PORTS = new Set([
  25,    // SMTP (open-relay spam)
  465,   // SMTP over SSL
  587,   // SMTP submission
  23,    // Telnet (abuse vector)
  6667,  // IRC (abuse vector)
  6697,  // IRC-TLS
]);

function getBlockedPorts() {
  const extra = process.env.WISP_EXTRA_BLOCKED_PORTS;
  if (!extra) return DEFAULT_BLOCKED_PORTS;
  const s = new Set(DEFAULT_BLOCKED_PORTS);
  for (const part of String(extra).split(',')) {
    const n = Number(String(part).trim());
    if (Number.isInteger(n) && n > 0 && n < 65536) s.add(n);
  }
  return s;
}

export function isBlockedPort(port) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) return true;
  return getBlockedPorts().has(p);
}

// ─── Hostname resolution + destination check ─────────────────────────

/**
 * Resolve a hostname and check that the resulting IP is not blocked.
 * If the input is already an IP literal, check it directly.
 *
 * Returns a resolved IP on success, or throws with a reason.
 *
 * This is the canonical entry point: the server MUST call this before
 * calling connect() on any user-supplied hostname. Otherwise an attacker
 * could use a DNS name that resolves to 169.254.169.254.
 *
 * @param {string} host
 * @returns {Promise<string>} — the resolved IP address to actually connect to
 */
export async function resolveAndCheck(host) {
  if (!host || typeof host !== 'string') {
    throw new GuardError('invalid_host', 'invalid hostname');
  }
  if (host.length > 255) {
    throw new GuardError('host_too_long', 'hostname exceeds 255 chars');
  }

  // Direct IP literal
  const fam = isIP(host);
  if (fam === 4 || fam === 6) {
    if (isBlockedIp(host)) {
      throw new GuardError('blocked_ip', `destination IP ${host} is in a blocked range`);
    }
    return host;
  }

  // DNS name — resolve and check each returned address
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true });
  } catch (err) {
    throw new GuardError('dns_failure', `DNS lookup failed for ${host}: ${err.code || err.message}`);
  }
  if (!addrs || addrs.length === 0) {
    throw new GuardError('dns_empty', `DNS returned no addresses for ${host}`);
  }

  // Block the connection if ANY returned address is in a blocked range —
  // this prevents DNS-based rebinding/split-horizon tricks. If the user
  // needs to reach a hostname that legitimately resolves to both public
  // and private IPs, they shouldn't be using a public proxy for that.
  for (const a of addrs) {
    if (isBlockedIp(a.address)) {
      throw new GuardError('blocked_ip',
        `destination ${host} resolves to blocked IP ${a.address}`);
    }
  }

  // Return the first address. Prefer IPv4 if both families are present
  // since many servers misconfigure IPv6 — purely a reliability preference.
  const v4 = addrs.find(a => a.family === 4);
  return (v4 || addrs[0]).address;
}

/**
 * Check destination port. Call this before resolveAndCheck() (or alongside it).
 */
export function checkPort(port) {
  if (isBlockedPort(port)) {
    throw new GuardError('blocked_port', `destination port ${port} is blocked`);
  }
}

// ─── Origin check ─────────────────────────────────────────────────────

function getOriginAllowlist() {
  const raw = process.env.WISP_ORIGIN_ALLOWLIST;
  if (raw) {
    return String(raw).split(',').map(s => s.trim()).filter(Boolean);
  }
  // Sensible defaults for v9: the public Pages site + localhost dev.
  return [
    'https://maceip.github.io',
  ];
}

/**
 * True if the given Origin header is allowed to open a WebSocket session.
 * Localhost/loopback/127.* origins are allowed unconditionally (dev).
 * Null/missing origin is allowed (some clients don't set it).
 */
export function isAllowedOrigin(origin) {
  if (!origin) return true; // clients that don't send Origin — not blocked
  const allowlist = getOriginAllowlist();
  if (allowlist.includes('*')) return true;

  // Always allow localhost/loopback origins
  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    if (/^127\./.test(host)) return true;
  } catch { /* malformed origin */ }

  return allowlist.includes(origin);
}

// ─── Soft limits (configuration) ──────────────────────────────────────

export function getLimits() {
  return {
    maxStreamsPerSession: intEnv('WISP_MAX_STREAMS_PER_SESSION', 32),
    maxSessionsPerIp:     intEnv('WISP_MAX_SESSIONS_PER_IP', 10),
    bandwidthBps:         intEnv('WISP_BANDWIDTH_BPS', 10 * 1024 * 1024),
    streamIdleMs:         intEnv('WISP_STREAM_IDLE_MS', 60_000),
    streamMaxLifetimeMs:  intEnv('WISP_STREAM_MAX_LIFETIME_MS', 30 * 60 * 1000),
  };
}

function intEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return defaultValue;
  return Math.floor(n);
}

// ─── Per-IP session tracker ──────────────────────────────────────────
// Used to enforce maxSessionsPerIp. Not persisted; lives in-process.

const _sessionsByIp = new Map(); // ip -> Set of session ids

export function tryAddSession(ip, sessionId) {
  const limits = getLimits();
  if (limits.maxSessionsPerIp === 0) return true;
  let set = _sessionsByIp.get(ip);
  if (!set) {
    set = new Set();
    _sessionsByIp.set(ip, set);
  }
  if (set.size >= limits.maxSessionsPerIp) return false;
  set.add(sessionId);
  return true;
}

export function removeSession(ip, sessionId) {
  const set = _sessionsByIp.get(ip);
  if (!set) return;
  set.delete(sessionId);
  if (set.size === 0) _sessionsByIp.delete(ip);
}

// ─── Error type ──────────────────────────────────────────────────────

export class GuardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GuardError';
    this.code = code;
  }
}

// ─── Exports for tests ───────────────────────────────────────────────

export { FORBIDDEN_IPV4, FORBIDDEN_IPV6_PREFIXES, DEFAULT_BLOCKED_PORTS };
