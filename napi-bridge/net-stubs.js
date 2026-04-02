/**
 * Stub modules for net, tls, dns — load without error; throw on raw socket use.
 *
 * Public `node:net` inspection types (`BlockList`, `SocketAddress`, dual-stack
 * toggles, `Stream` alias) are implemented for apps that block-check IPs without
 * opening TCP. `connect` / `createServer`+`listen` still fail in-tab unless an
 * embedder tunnel is registered — see transport-policy.mjs + docs/TRANSPORT.md
 * (optional hook __NODE_TAB_WISP_TCP_CONNECT or external Wisp client).
 */

import { EventEmitter } from './eventemitter.js';
import { getRawSocketTransportMode } from './transport-policy.mjs';

function notAvailable(mod, method) {
  return function () {
    throw new Error(`${mod}.${method}() is not available in the browser environment`);
  };
}

function _rawSocketUnavailable(modDotMethod) {
  const mode = getRawSocketTransportMode();
  if (mode === 'embedder') {
    throw new Error(
      `${modDotMethod}: provide tcp via globalThis.__NODE_TAB_WISP_TCP_CONNECT (see docs/TRANSPORT.md).`,
    );
  }
  if (mode === 'wisp-expected') {
    throw new Error(
      `${modDotMethod}: NODEJS_WISP_WS_URL is set but this build does not bundle a Wisp client (AGPL). ` +
        'Register globalThis.__NODE_TAB_WISP_TCP_CONNECT or clear NODEJS_WISP_WS_URL. See docs/TRANSPORT.md.',
    );
  }
  throw new Error(`${modDotMethod} is not available in the browser environment`);
}

function _invalidIp(address) {
  const err = new TypeError(`Invalid IP address: ${address}`);
  err.code = 'ERR_INVALID_IP_ADDRESS';
  return err;
}

/** @param {string} s @returns {number | null} */
function _ipv4ToInt(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s).trim());
  if (!m) return null;
  const p = m.slice(1).map((x) => Number(x));
  if (p.some((n) => n > 255 || n < 0)) return null;
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

function _isIP(input) {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(input)) return 4;
  if (String(input).includes(':')) return 6;
  return 0;
}

function _normIpType(type, address) {
  if (type === 'ipv4' || type === 'ipv6') return type;
  if (type !== undefined && type !== null) {
    throw new TypeError(`Invalid address type: ${type}`);
  }
  const s = String(address);
  if (s.includes(':')) return 'ipv6';
  return 'ipv4';
}

/** @param {Uint8Array} a @param {Uint8Array} b @returns {number} */
function _u8cmp16(a, b) {
  for (let i = 0; i < 16; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

/** @param {Uint8Array} addr @param {Uint8Array} net @param {number} prefix */
function _ipv6PrefixMatch(addr, net, prefix) {
  let bits = prefix;
  for (let i = 0; i < 16 && bits > 0; i++) {
    if (bits >= 8) {
      if (addr[i] !== net[i]) return false;
      bits -= 8;
    } else {
      const mask = (0xff << (8 - bits)) & 0xff;
      if ((addr[i] & mask) !== (net[i] & mask)) return false;
      break;
    }
  }
  return true;
}

/** Parse IPv6 to 16 bytes (incl. :: compression, IPv4 tail, ::ffff:x.x.x.x tail). */
function _parseIPv6(input) {
  let s = String(input).toLowerCase().trim();
  let tailV4 = null;
  const m4 = /:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (m4) {
    tailV4 = _ipv4ToInt(m4[1]);
    if (tailV4 === null) return null;
    s = s.slice(0, m4.index);
  }
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':').filter((x) => x.length > 0) : [];
  const tail = parts.length > 1 && parts[1] ? parts[1].split(':').filter((x) => x.length > 0) : [];
  if (tailV4 !== null) {
    tail.push(((tailV4 >>> 16) & 0xffff).toString(16));
    tail.push((tailV4 & 0xffff).toString(16));
  }
  const miss = 8 - head.length - tail.length;
  if (parts.length === 1 && miss !== 0) return null;
  if (parts.length === 2 && miss < 0) return null;
  const mid = parts.length === 2 ? Array(miss).fill('0') : [];
  const all = [...head, ...mid, ...tail];
  if (all.length !== 8) return null;
  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const v = parseInt(all[i], 16);
    if (!Number.isFinite(v) || v < 0 || v > 0xffff) return null;
    out[i * 2] = v >>> 8;
    out[i * 2 + 1] = v & 0xff;
  }
  return out;
}

function _ipv6CanonicalKey(input) {
  const b = typeof input === 'string' ? _parseIPv6(input) : input;
  if (!b) return null;
  return Array.from({ length: 8 }, (_, i) => ((b[i * 2] << 8) | b[i * 2 + 1]).toString(16)).join(':');
}

function _maskIpv6Network(bytes, prefix) {
  const out = new Uint8Array(bytes);
  let b = prefix;
  for (let i = 0; i < 16; i++) {
    if (b <= 0) {
      out[i] = 0;
      continue;
    }
    if (b >= 8) {
      b -= 8;
      continue;
    }
    const mask = (0xff << (8 - b)) & 0xff;
    out[i] &= mask;
    b = 0;
    for (let j = i + 1; j < 16; j++) out[j] = 0;
    break;
  }
  return out;
}

/**
 * `net.BlockList` — enough for apps that build a list and call `check()` (security / fast-path).
 * Does not provide raw sockets; see TRANSPORT.md for TCP/TLS.
 */
class BlockList {
  constructor() {
    /** @type {Array<{ kind: 'addr4'|'range4'|'subnet4', a?: number, b?: number, net?: number, prefix?: number, mask?: number }|{ kind: 'range6'; lo: Uint8Array; hi: Uint8Array }|{ kind: 'subnet6'; net: Uint8Array|string; prefix: number }>} */
    this._rules = [];
    /** @type {Set<string>} canonical IPv6 keys */
    this._addr6 = new Set();
  }

  addAddress(address, type) {
    const t = _normIpType(type, address);
    if (t === 'ipv6') {
      const k = _ipv6CanonicalKey(address);
      if (k === null) throw _invalidIp(address);
      this._addr6.add(k);
      return;
    }
    const n = _ipv4ToInt(address);
    if (n === null) throw _invalidIp(address);
    this._rules.push({ kind: 'addr4', a: n });
  }

  addRange(start, end, type) {
    const t = _normIpType(type, start);
    if (t === 'ipv6') {
      let a = _parseIPv6(start);
      let b = _parseIPv6(end);
      if (!a) throw _invalidIp(start);
      if (!b) throw _invalidIp(end);
      if (_u8cmp16(a, b) > 0) {
        const t2 = a;
        a = b;
        b = t2;
      }
      this._rules.push({ kind: 'range6', lo: a, hi: b });
      return;
    }
    const a = _ipv4ToInt(start);
    const b = _ipv4ToInt(end);
    if (a === null) throw _invalidIp(start);
    if (b === null) throw _invalidIp(end);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    this._rules.push({ kind: 'range4', a: lo, b: hi });
  }

  addSubnet(network, prefix, type) {
    const t = _normIpType(type, network);
    if (t === 'ipv6') {
      const p = Number(prefix);
      if (!Number.isInteger(p) || p < 0 || p > 128) {
        throw new RangeError('Invalid prefix for IPv6 subnet');
      }
      const base = _parseIPv6(network);
      if (!base) throw _invalidIp(network);
      const net = _maskIpv6Network(base, p);
      this._rules.push({ kind: 'subnet6', net, prefix: p });
      return;
    }
    const p = Number(prefix);
    if (!Number.isInteger(p) || p < 0 || p > 32) {
      throw new RangeError('Invalid prefix for IPv4 subnet');
    }
    const base = _ipv4ToInt(network);
    if (base === null) throw _invalidIp(network);
    const mask = p === 0 ? 0 : (~0 << (32 - p)) >>> 0;
    this._rules.push({ kind: 'subnet4', net: base & mask, prefix: p, mask });
  }

  check(address, type) {
    const t = _normIpType(type, address);
    if (t === 'ipv6') {
      const key = _ipv6CanonicalKey(address);
      if (key === null) throw _invalidIp(address);
      if (this._addr6.has(key)) return true;
      const bytes = _parseIPv6(address);
      if (!bytes) throw _invalidIp(address);
      for (const r of this._rules) {
        if (r.kind === 'range6') {
          if (_u8cmp16(bytes, r.lo) >= 0 && _u8cmp16(bytes, r.hi) <= 0) return true;
        }
        if (r.kind === 'subnet6' && _ipv6PrefixMatch(bytes, r.net, r.prefix)) return true;
      }
      return false;
    }
    const ip = _ipv4ToInt(address);
    if (ip === null) throw _invalidIp(address);
    for (const r of this._rules) {
      if (r.kind === 'addr4' && r.a === ip) return true;
      if (r.kind === 'range4' && ip >= r.a && ip <= r.b) return true;
      if (r.kind === 'subnet4' && (ip & r.mask) === r.net) return true;
    }
    return false;
  }
}

/**
 * Minimal `net.SocketAddress` for code that constructs addresses without opening sockets.
 */
class SocketAddress {
  constructor(opts = {}) {
    if (typeof opts === 'string') {
      this.address = opts;
      this.port = arguments[1] ?? 0;
      this.family = _isIP(opts) === 6 ? 'ipv6' : 'ipv4';
      this.flowlabel = 0;
    } else {
      this.address = opts.address ?? opts.host ?? '127.0.0.1';
      this.port = opts.port ?? 0;
      this.family = opts.family === 'ipv6' || _isIP(this.address) === 6 ? 'ipv6' : 'ipv4';
    }
    this.flowlabel = opts.flowlabel ?? 0;
  }
}

let _defaultAutoSelectFamily = true;
let _defaultAutoSelectFamilyAttemptTimeout = 250;

// ─── net ────────────────────────────────────────────────────────────

class Socket extends EventEmitter {
  constructor() {
    super();
    this.writable = false;
    this.readable = false;
  }
  connect() { throw new Error('net.Socket.connect() is not available in the browser environment'); }
  write() { throw new Error('net.Socket.write() is not available in the browser environment'); }
  end() { return this; }
  destroy() { return this; }
  setEncoding() { return this; }
  setKeepAlive() { return this; }
  setNoDelay() { return this; }
  setTimeout() { return this; }
  ref() { return this; }
  unref() { return this; }
}

class Server extends EventEmitter {
  constructor() { super(); }
  listen() { throw new Error('net.Server.listen() is not available in the browser environment'); }
  close() { return this; }
  address() { return null; }
}

export const net = {
  createConnection(...args) {
    return net.connect(...args);
  },
  createServer: notAvailable('net', 'createServer'),
  connect(..._args) {
    _rawSocketUnavailable('net.connect');
  },
  Socket,
  Server,
  BlockList,
  SocketAddress,
  Stream: Socket,
  getDefaultAutoSelectFamily() {
    return _defaultAutoSelectFamily;
  },
  setDefaultAutoSelectFamily(value) {
    _defaultAutoSelectFamily = Boolean(value);
  },
  getDefaultAutoSelectFamilyAttemptTimeout() {
    return _defaultAutoSelectFamilyAttemptTimeout;
  },
  setDefaultAutoSelectFamilyAttemptTimeout(value) {
    _defaultAutoSelectFamilyAttemptTimeout = Number(value);
  },
  isIP: _isIP,
  isIPv4(input) { return _isIP(input) === 4; },
  isIPv6(input) { return _isIP(input) === 6; },
};

// ─── tls ────────────────────────────────────────────────────────────

export const tls = {
  connect(..._args) {
    _rawSocketUnavailable('tls.connect');
  },
  createServer: notAvailable('tls', 'createServer'),
  createSecureContext(opts) { return { context: {}, ca: opts?.ca || [], cert: opts?.cert || null, key: opts?.key || null }; },
  getCiphers() { return ['TLS_AES_256_GCM_SHA384']; },
  TLSSocket: Socket,
  rootCertificates: [],
  DEFAULT_MIN_VERSION: 'TLSv1.2',
  DEFAULT_MAX_VERSION: 'TLSv1.3',
  DEFAULT_ECDH_CURVE: 'auto',
  CLIENT_RENEG_LIMIT: 3,
  CLIENT_RENEG_WINDOW: 600,
};

// ─── dns ────────────────────────────────────────────────────────────

export const dns = {
  lookup: notAvailable('dns', 'lookup'),
  resolve: notAvailable('dns', 'resolve'),
  resolve4: notAvailable('dns', 'resolve4'),
  resolve6: notAvailable('dns', 'resolve6'),
  reverse: notAvailable('dns', 'reverse'),
  promises: {
    lookup: notAvailable('dns.promises', 'lookup'),
    resolve: notAvailable('dns.promises', 'resolve'),
    resolve4: notAvailable('dns.promises', 'resolve4'),
    resolve6: notAvailable('dns.promises', 'resolve6'),
  },
};

export default { net, tls, dns };
