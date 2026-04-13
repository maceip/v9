/**
 * guard.js — Anti-abuse policy for the Cloudflare Worker Wisp server.
 *
 * Same intent as cmd/wisp-server-node/guard.js but adapted for the Workers
 * runtime: no node:net, no node:dns. DNS pre-resolution is done via DNS-
 * over-HTTPS against Cloudflare's 1.1.1.1/dns-query endpoint.
 *
 * Hard rules:
 *   1. Destination IP blocklist — RFC 1918, loopback, link-local, metadata,
 *      multicast, IPv6 ULA
 *   2. Destination port blocklist — SMTP 25/465/587 and other abuse ports
 *   3. Hostname pre-resolve — defeats DNS rebinding by resolving ourselves
 *      and rejecting if ANY returned IP is blocked
 *
 * Soft limits (via env bindings):
 *   - MAX_STREAMS_PER_SESSION
 *   - ORIGIN_ALLOWLIST
 *   - EXTRA_BLOCKED_PORTS
 *
 * Note: CF Workers don't have a true per-IP session count because each
 * Worker invocation is ephemeral. For cross-invocation rate limiting use
 * CF Workers' native rate-limiting bindings (wrangler.toml: [rate_limit]).
 */

// ─── IPv4 blocklist ──────────────────────────────────────────────────

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

const FORBIDDEN_IPV4 = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '127.0.0.0/8',
  '169.254.0.0/16',   // link-local — metadata service
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
  '255.255.255.255/32',
];

const FORBIDDEN_IPV6_PREFIXES = [
  '::', '::1', '::ffff:',
  'fc', 'fd',
  'fe8', 'fe9', 'fea', 'feb',  // fe80::/10
  'ff',                          // multicast
];

function isIpv4(s) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(s);
}

function isIpv6(s) {
  return s.includes(':');
}

export function isBlockedIp(ip) {
  if (!ip) return true;

  if (isIpv4(ip)) {
    for (const cidr of FORBIDDEN_IPV4) {
      if (ipv4InCidr(ip, cidr)) return true;
    }
    return false;
  }

  if (isIpv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower.startsWith('::ffff:')) {
      const v4 = lower.slice(7);
      if (isIpv4(v4)) return isBlockedIp(v4);
    }
    if (lower === '::' || lower === '::0') return true;
    if (lower === '::1') return true;
    for (const prefix of FORBIDDEN_IPV6_PREFIXES) {
      if (lower.startsWith(prefix)) return true;
    }
    return false;
  }

  return true; // fail closed on unparseable
}

// ─── Port blocklist ──────────────────────────────────────────────────

const DEFAULT_BLOCKED_PORTS = new Set([25, 465, 587, 23, 6667, 6697]);

export function getBlockedPorts(env) {
  const s = new Set(DEFAULT_BLOCKED_PORTS);
  const extra = env?.EXTRA_BLOCKED_PORTS;
  if (extra) {
    for (const p of String(extra).split(',')) {
      const n = Number(String(p).trim());
      if (Number.isInteger(n) && n > 0 && n < 65536) s.add(n);
    }
  }
  return s;
}

export function isBlockedPort(port, env) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) return true;
  return getBlockedPorts(env).has(p);
}

// ─── DNS over HTTPS ──────────────────────────────────────────────────
// Cloudflare Workers can't do native DNS, but they can fetch DoH.

async function dohResolve(hostname, type = 'A') {
  // JSON API format (https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)
  const url = `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/dns-json' },
  });
  if (!res.ok) throw new Error(`DoH ${type} ${res.status}`);
  const data = await res.json();
  if (data.Status !== 0) throw new Error(`DoH rcode ${data.Status}`);
  if (!data.Answer) return [];
  return data.Answer
    .filter(a => a.type === (type === 'A' ? 1 : 28))
    .map(a => a.data);
}

/**
 * Resolve a hostname via DoH and check all returned IPs.
 * Returns a usable IP or throws.
 */
export async function resolveAndCheck(host) {
  if (!host || typeof host !== 'string') {
    throw new GuardError('invalid_host', 'invalid hostname');
  }
  if (host.length > 255) {
    throw new GuardError('host_too_long', 'hostname too long');
  }

  // IP literal?
  if (isIpv4(host) || isIpv6(host)) {
    if (isBlockedIp(host)) {
      throw new GuardError('blocked_ip', `destination ${host} is in a blocked range`);
    }
    return host;
  }

  // DoH lookup (A and AAAA in parallel)
  let a = [];
  let aaaa = [];
  try {
    [a, aaaa] = await Promise.all([
      dohResolve(host, 'A').catch(() => []),
      dohResolve(host, 'AAAA').catch(() => []),
    ]);
  } catch (err) {
    throw new GuardError('dns_failure', `DNS resolution failed for ${host}`);
  }

  const addrs = [...a, ...aaaa];
  if (addrs.length === 0) {
    throw new GuardError('dns_empty', `DNS returned no addresses for ${host}`);
  }

  for (const addr of addrs) {
    if (isBlockedIp(addr)) {
      throw new GuardError('blocked_ip',
        `destination ${host} resolves to blocked IP ${addr}`);
    }
  }

  // Prefer IPv4
  return a[0] || aaaa[0];
}

export function checkPort(port, env) {
  if (isBlockedPort(port, env)) {
    throw new GuardError('blocked_port', `destination port ${port} is blocked`);
  }
}

// ─── Origin check ────────────────────────────────────────────────────

export function isAllowedOrigin(origin, env) {
  if (!origin) return true;

  const raw = env?.ORIGIN_ALLOWLIST || 'https://maceip.github.io';
  const allowlist = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (allowlist.includes('*')) return true;

  try {
    const u = new URL(origin);
    const host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    if (/^127\./.test(host)) return true;
  } catch { /* malformed */ }

  return allowlist.includes(origin);
}

// ─── Limits ──────────────────────────────────────────────────────────

export function getLimits(env) {
  return {
    maxStreamsPerSession: intEnv(env?.MAX_STREAMS_PER_SESSION, 32),
  };
}

function intEnv(raw, def) {
  if (raw == null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return def;
  return Math.floor(n);
}

// ─── Error ───────────────────────────────────────────────────────────

export class GuardError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GuardError';
    this.code = code;
  }
}
