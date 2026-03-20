/**
 * Node.js Global Polyfills for Browser Runtime
 *
 * This file MUST load before any module imports. It sets up the global
 * environment that Node.js code expects: process, Buffer, setImmediate,
 * hrtime, console.Console, setTimeout.unref, and CORS proxy intercept.
 *
 * Without this file, all 4 CLIs (Claude Code, Cody, Cline, Gemini CLI)
 * break on first import. Do NOT delete or inline this — keep it as a
 * standalone file that's loaded via <script> in index.html.
 *
 * Load order: node-polyfills.js → import map → terminal.js → modules
 */

(function() {
  'use strict';

  // ─── process ──────────────────────────────────────────────────────
  // Minimal process object for code that accesses process without importing.
  // The full processBridge replaces this once browser-builtins.js loads.

  if (typeof globalThis.process === 'undefined') {
    const _env = {};
    const _cwd = '/';
    globalThis.process = {
      env: _env,
      argv: ['/usr/bin/node', '/app/index.js'],
      platform: 'linux',
      arch: 'wasm32',
      version: 'v20.0.0',
      versions: { node: '20.0.0' },
      pid: 1,
      ppid: 0,
      exitCode: 0,
      cwd: () => _cwd,
      chdir: () => {},
      exit: (code) => { console.warn('[process.exit] Code:', code); },
      nextTick: (fn, ...args) => Promise.resolve().then(() => fn(...args)),
      stdout: { write: (s) => { if (globalThis._xtermWrite) globalThis._xtermWrite(s); else console.log(s); return true; }, columns: 80, rows: 24, isTTY: true, on: () => globalThis.process.stdout, once: () => globalThis.process.stdout, emit: () => false, fd: 1 },
      stderr: { write: (s) => { if (globalThis._xtermWrite) globalThis._xtermWrite(s); else console.error(s); return true; }, columns: 80, rows: 24, isTTY: true, on: () => globalThis.process.stderr, once: () => globalThis.process.stderr, emit: () => false, fd: 2 },
      stdin: { on: () => globalThis.process.stdin, once: () => globalThis.process.stdin, resume: () => {}, pause: () => {}, setEncoding: () => {}, isTTY: true, fd: 0 },
      hrtime: Object.assign(
        function hrtime(prev) {
          const now = performance.now();
          const sec = Math.floor(now / 1000);
          const nsec = Math.floor((now % 1000) * 1e6);
          if (prev) {
            let ds = sec - prev[0];
            let dn = nsec - prev[1];
            if (dn < 0) { ds--; dn += 1e9; }
            return [ds, dn];
          }
          return [sec, nsec];
        },
        { bigint: () => BigInt(Math.floor(performance.now() * 1e6)) }
      ),
      memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }),
      cpuUsage: () => ({ user: 0, system: 0 }),
      uptime: () => performance.now() / 1000,
      on: () => globalThis.process,
      once: () => globalThis.process,
      off: () => globalThis.process,
      emit: () => false,
      removeListener: () => globalThis.process,
      removeAllListeners: () => globalThis.process,
      listeners: () => [],
      listenerCount: () => 0,
      binding: () => ({}),
      umask: () => 0o022,
      getuid: () => 1000,
      getgid: () => 1000,
      kill: () => {},
      features: { inspector: false, debug: false, uv: false, ipv6: false, tls_alpn: false, tls_sni: false, tls_ocsp: false, tls: false },
      config: { variables: {} },
      title: 'browser',
      execPath: '/usr/bin/node',
      execArgv: [],
    };
  }

  // ─── Buffer ───────────────────────────────────────────────────────
  // Minimal Buffer polyfill. The full implementation comes from browser-builtins.js.

  if (typeof globalThis.Buffer === 'undefined') {
    const _encoder = new TextEncoder();
    const _decoder = new TextDecoder();

    class Buffer extends Uint8Array {
      static from(data, encoding) {
        if (typeof data === 'string') {
          if (encoding === 'base64') {
            const bin = atob(data);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return Object.setPrototypeOf(arr, Buffer.prototype);
          }
          if (encoding === 'hex') {
            const arr = new Uint8Array(data.length / 2);
            for (let i = 0; i < arr.length; i++) arr[i] = parseInt(data.substr(i * 2, 2), 16);
            return Object.setPrototypeOf(arr, Buffer.prototype);
          }
          return Object.setPrototypeOf(_encoder.encode(data), Buffer.prototype);
        }
        if (data instanceof ArrayBuffer) return Object.setPrototypeOf(new Uint8Array(data), Buffer.prototype);
        if (ArrayBuffer.isView(data)) return Object.setPrototypeOf(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), Buffer.prototype);
        if (Array.isArray(data)) return Object.setPrototypeOf(new Uint8Array(data), Buffer.prototype);
        return Object.setPrototypeOf(new Uint8Array(0), Buffer.prototype);
      }
      static alloc(size, fill) {
        const buf = Object.setPrototypeOf(new Uint8Array(size), Buffer.prototype);
        if (fill !== undefined) buf.fill(typeof fill === 'string' ? fill.charCodeAt(0) : fill);
        return buf;
      }
      static allocUnsafe(size) { return Buffer.alloc(size); }
      static concat(list, totalLength) {
        if (totalLength === undefined) totalLength = list.reduce((s, b) => s + b.length, 0);
        const out = Buffer.alloc(totalLength);
        let offset = 0;
        for (const b of list) { out.set(b, offset); offset += b.length; }
        return out;
      }
      static isBuffer(obj) { return obj instanceof Buffer || (obj instanceof Uint8Array && obj._isBuffer); }
      static byteLength(str, encoding) {
        if (typeof str !== 'string') return str.length || str.byteLength || 0;
        return _encoder.encode(str).length;
      }
      static isEncoding() { return true; }
      toString(encoding) {
        if (encoding === 'base64') {
          let bin = '';
          for (let i = 0; i < this.length; i++) bin += String.fromCharCode(this[i]);
          return btoa(bin);
        }
        if (encoding === 'hex') {
          let hex = '';
          for (let i = 0; i < this.length; i++) hex += this[i].toString(16).padStart(2, '0');
          return hex;
        }
        return _decoder.decode(this);
      }
      write(str, offset, length, encoding) {
        const bytes = _encoder.encode(str);
        const count = Math.min(bytes.length, (length || this.length) - (offset || 0));
        this.set(bytes.subarray(0, count), offset || 0);
        return count;
      }
      copy(target, targetStart, sourceStart, sourceEnd) {
        targetStart = targetStart || 0;
        sourceStart = sourceStart || 0;
        sourceEnd = sourceEnd || this.length;
        const bytes = this.subarray(sourceStart, sourceEnd);
        target.set(bytes, targetStart);
        return bytes.length;
      }
      equals(other) {
        if (this.length !== other.length) return false;
        for (let i = 0; i < this.length; i++) if (this[i] !== other[i]) return false;
        return true;
      }
      slice(start, end) { return Object.setPrototypeOf(super.slice(start, end), Buffer.prototype); }
      subarray(start, end) { return Object.setPrototypeOf(super.subarray(start, end), Buffer.prototype); }
      toJSON() { return { type: 'Buffer', data: Array.from(this) }; }
      readUInt8(offset) { return this[offset]; }
      readUInt16LE(offset) { return this[offset] | (this[offset + 1] << 8); }
      readUInt32LE(offset) { return new DataView(this.buffer, this.byteOffset).getUint32(offset, true); }
      readInt32LE(offset) { return new DataView(this.buffer, this.byteOffset).getInt32(offset, true); }
      writeUInt8(value, offset) { this[offset] = value; return offset + 1; }
      writeUInt16LE(value, offset) { this[offset] = value & 0xff; this[offset + 1] = (value >> 8) & 0xff; return offset + 2; }
      writeUInt32LE(value, offset) { new DataView(this.buffer, this.byteOffset).setUint32(offset, value, true); return offset + 4; }
      writeInt32LE(value, offset) { new DataView(this.buffer, this.byteOffset).setInt32(offset, value, true); return offset + 4; }
    }
    Buffer.prototype._isBuffer = true;
    globalThis.Buffer = Buffer;
  }

  // ─── setImmediate / clearImmediate ────────────────────────────────

  if (typeof globalThis.setImmediate === 'undefined') {
    let _immId = 0;
    const _immMap = new Map();
    globalThis.setImmediate = function setImmediate(fn, ...args) {
      const id = ++_immId;
      const handle = Promise.resolve().then(() => {
        if (_immMap.has(id)) {
          _immMap.delete(id);
          fn(...args);
        }
      });
      _immMap.set(id, handle);
      return id;
    };
    globalThis.clearImmediate = function clearImmediate(id) {
      _immMap.delete(id);
    };
  }

  // ─── setTimeout/setInterval .unref() / .ref() ────────────────────
  // Node.js timers return objects with .unref()/.ref(). Browser returns numbers.
  // Patch to add no-op unref/ref when needed.

  const _origSetTimeout = globalThis.setTimeout;
  const _origSetInterval = globalThis.setInterval;

  globalThis.setTimeout = function patchedSetTimeout(fn, ms, ...args) {
    const id = _origSetTimeout.call(globalThis, fn, ms, ...args);
    if (typeof id === 'number') {
      // Return an object that acts like a number but has .unref()/.ref()
      const wrapper = {
        _id: id,
        ref() { return wrapper; },
        unref() { return wrapper; },
        hasRef() { return true; },
        refresh() { return wrapper; },
        [Symbol.toPrimitive]() { return id; },
      };
      return wrapper;
    }
    return id;
  };

  globalThis.setInterval = function patchedSetInterval(fn, ms, ...args) {
    const id = _origSetInterval.call(globalThis, fn, ms, ...args);
    if (typeof id === 'number') {
      const wrapper = {
        _id: id,
        ref() { return wrapper; },
        unref() { return wrapper; },
        hasRef() { return true; },
        refresh() { return wrapper; },
        [Symbol.toPrimitive]() { return id; },
      };
      return wrapper;
    }
    return id;
  };

  // Patch clearTimeout/clearInterval to accept wrapper objects
  const _origClearTimeout = globalThis.clearTimeout;
  const _origClearInterval = globalThis.clearInterval;
  globalThis.clearTimeout = function(id) {
    return _origClearTimeout.call(globalThis, typeof id === 'object' && id !== null ? id._id : id);
  };
  globalThis.clearInterval = function(id) {
    return _origClearInterval.call(globalThis, typeof id === 'object' && id !== null ? id._id : id);
  };

  // ─── console.Console ──────────────────────────────────────────────
  // Node.js console module exports a Console constructor.

  if (!globalThis.console.Console) {
    globalThis.console.Console = class Console {
      constructor(opts) {
        const out = opts?.stdout || { write: (s) => console.log(s) };
        const err = opts?.stderr || { write: (s) => console.error(s) };
        this.log = (...a) => out.write(a.map(String).join(' ') + '\n');
        this.error = (...a) => err.write(a.map(String).join(' ') + '\n');
        this.warn = this.error;
        this.info = this.log;
        this.debug = this.log;
        this.trace = this.log;
        this.dir = this.log;
        this.time = () => {};
        this.timeEnd = () => {};
        this.timeLog = () => {};
        this.assert = (v, ...a) => { if (!v) this.error('Assertion failed:', ...a); };
        this.count = () => {};
        this.countReset = () => {};
        this.group = () => {};
        this.groupEnd = () => {};
        this.table = this.log;
        this.clear = () => {};
      }
    };
  }

  // ─── CORS Proxy Intercept ─────────────────────────────────────────
  // Intercept fetch to api.anthropic.com and route through CORS proxy.
  // The proxy URL is set via ?proxy=<url> query param or auto-detected.

  const _origFetch = globalThis.fetch;
  const _proxyUrl = (() => {
    try {
      const params = new URLSearchParams(globalThis.location?.search || '');
      return params.get('proxy') || '';
    } catch { return ''; }
  })();

  if (_proxyUrl) {
    globalThis.fetch = function patchedFetch(input, init) {
      let url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));

      // Route Anthropic API calls through CORS proxy
      if (url.includes('api.anthropic.com')) {
        const target = new URL(url);
        const proxy = new URL(_proxyUrl);
        target.hostname = proxy.hostname;
        target.port = proxy.port;
        target.protocol = proxy.protocol;
        url = target.toString();

        if (typeof input === 'string') {
          return _origFetch.call(globalThis, url, init);
        }
        return _origFetch.call(globalThis, new Request(url, input), init);
      }

      return _origFetch.call(globalThis, input, init);
    };
    // Preserve fetch properties
    Object.setPrototypeOf(globalThis.fetch, _origFetch);
  }

  // ─── queueMicrotask fallback ──────────────────────────────────────

  if (typeof globalThis.queueMicrotask === 'undefined') {
    globalThis.queueMicrotask = (fn) => Promise.resolve().then(fn);
  }

  // ─── structuredClone fallback ─────────────────────────────────────

  if (typeof globalThis.structuredClone === 'undefined') {
    globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
  }

})();
