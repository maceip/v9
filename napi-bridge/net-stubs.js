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

function createBrowserNetError(mod, method) {
  const err = new Error(`${mod}.${method}() is not available in the browser environment`);
  err.code = 'ENOTSUP';
  return err;
}

// ─── net ────────────────────────────────────────────────────────────

class Socket extends EventEmitter {
  constructor() {
    super();
    this.writable = false;
    this.readable = false;
  }
  connect(...args) {
    const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    queueMicrotask(() => {
      const err = createBrowserNetError('net.Socket', 'connect');
      this.emit('error', err);
      if (callback) callback(err);
    });
    return this;
  }
  write(chunk, encoding, callback) {
    if (typeof encoding === 'function') callback = encoding;
    queueMicrotask(() => {
      const err = createBrowserNetError('net.Socket', 'write');
      this.emit('error', err);
      if (callback) callback(err);
    });
    return false;
  }
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
  listen(...args) {
    const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    queueMicrotask(() => {
      const err = createBrowserNetError('net.Server', 'listen');
      this.emit('error', err);
      if (callback) callback(err);
    });
    return this;
  }
  close() { return this; }
  address() { return null; }
}

export const net = {
  createConnection(...args) {
    const socket = new Socket();
    return socket.connect(...args);
  },
  createServer(connectionListener) {
    const server = new Server();
    if (typeof connectionListener === 'function') {
      server.on('connection', connectionListener);
    }
    return server;
  },
  connect(...args) {
    const socket = new Socket();
    return socket.connect(...args);
  },
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
  connect(...args) {
    const socket = new Socket();
    queueMicrotask(() => {
      const err = createBrowserNetError('tls', 'connect');
      socket.emit('error', err);
      const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
      if (callback) callback(err);
    });
    return socket;
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
  lookup(hostname, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    const family = options?.family || 4;
    const normalized = String(hostname || '');
    let address = '127.0.0.1';
    if (normalized && net.isIP(normalized)) {
      address = normalized;
    } else if (normalized && normalized !== 'localhost') {
      address = family === 6 ? '::1' : '127.0.0.1';
    }
    if (callback) {
      queueMicrotask(() => callback(null, address, family));
      return;
    }
    return Promise.resolve({ address, family });
  },
  resolve(hostname, rrtype, callback) {
    if (typeof rrtype === 'function') {
      callback = rrtype;
      rrtype = 'A';
    }
    const records = rrtype === 'AAAA' ? ['::1'] : ['127.0.0.1'];
    if (callback) {
      queueMicrotask(() => callback(null, records));
      return;
    }
    return Promise.resolve(records);
  },
  resolve4(hostname, callback) {
    if (callback) {
      queueMicrotask(() => callback(null, ['127.0.0.1']));
      return;
    }
    return Promise.resolve(['127.0.0.1']);
  },
  resolve6(hostname, callback) {
    if (callback) {
      queueMicrotask(() => callback(null, ['::1']));
      return;
    }
    return Promise.resolve(['::1']);
  },
  reverse: notAvailable('dns', 'reverse'),
  getServers() { return []; },
  setServers() {},
  lookupService(address, port, callback) {
    if (callback) {
      queueMicrotask(() => callback(null, 'localhost', String(port || '0')));
      return;
    }
    return Promise.resolve({ hostname: 'localhost', service: String(port || '0') });
  },
  Resolver: class Resolver {
    lookup(...args) { return dns.lookup(...args); }
    resolve(...args) { return dns.resolve(...args); }
    resolve4(...args) { return dns.resolve4(...args); }
    resolve6(...args) { return dns.resolve6(...args); }
    reverse(...args) { return dns.reverse(...args); }
    setServers() {}
    getServers() { return []; }
  },
  promises: {
    lookup(hostname, options) { return dns.lookup(hostname, options); },
    resolve(hostname, rrtype) { return dns.resolve(hostname, rrtype); },
    resolve4(hostname) { return dns.resolve4(hostname); },
    resolve6(hostname) { return dns.resolve6(hostname); },
    reverse: notAvailable('dns.promises', 'reverse'),
    getServers() { return []; },
    setServers() {},
    lookupService(address, port) { return dns.lookupService(address, port); },
    Resolver: class Resolver {
      lookup(...args) { return dns.lookup(...args); }
      resolve(...args) { return dns.resolve(...args); }
      resolve4(...args) { return dns.resolve4(...args); }
      resolve6(...args) { return dns.resolve6(...args); }
      reverse(...args) { return dns.reverse(...args); }
      setServers() {}
      getServers() { return []; }
    },
  },
};

export default { net, tls, dns };
