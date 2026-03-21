/**
 * Stub modules for net, tls, dns — load without error, throw on use.
 *
 * The Anthropic SDK or its dependencies may import these modules even
 * though they don't use them directly in browser environments.
 */

import { EventEmitter } from './eventemitter.js';

function notAvailable(mod, method) {
  return function () {
    throw new Error(`${mod}.${method}() is not available in the browser environment`);
  };
}

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
  createConnection: notAvailable('net', 'createConnection'),
  createServer: notAvailable('net', 'createServer'),
  connect: notAvailable('net', 'connect'),
  Socket,
  Server,
  isIP(input) {
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(input)) return 4;
    if (input.includes(':')) return 6;
    return 0;
  },
  isIPv4(input) { return net.isIP(input) === 4; },
  isIPv6(input) { return net.isIP(input) === 6; },
};

// ─── tls ────────────────────────────────────────────────────────────

export const tls = {
  connect: notAvailable('tls', 'connect'),
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
