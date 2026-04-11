/**
 * Node.js Global Polyfills for Browser Runtime
 *
 * This file MUST load before any module imports. It sets up the global
 * environment that Node.js code expects: process, Buffer, setImmediate,
 * hrtime, console.Console, setTimeout.unref, and CORS proxy intercept.
 *
 * Many bundled Node CLIs expect these globals before any ESM import.
 * Keep this as a standalone file loaded via <script> before the import map.
 *
 * Load order: node-polyfills.js → import map → terminal.js → modules
 */

(function() {
  'use strict';

  const FORBIDDEN_BROWSER_HEADERS = new Set([
    'accept-charset',
    'accept-encoding',
    'access-control-request-headers',
    'access-control-request-method',
    'connection',
    'content-length',
    'cookie',
    'cookie2',
    'date',
    'dnt',
    'expect',
    'host',
    'keep-alive',
    'origin',
    'permissions-policy',
    'proxy-authorization',
    'referer',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'user-agent',
    'via',
  ]);

  function isForbiddenBrowserHeader(name) {
    const lower = String(name || '').toLowerCase();
    return FORBIDDEN_BROWSER_HEADERS.has(lower) || lower.startsWith('sec-') || lower.startsWith('proxy-');
  }

  function filterBrowserRequestHeaders(headersLike) {
    const out = {};
    if (!headersLike) return out;
    const entries = typeof headersLike.entries === 'function'
      ? Array.from(headersLike.entries())
      : Object.entries(headersLike);
    for (const [key, value] of entries) {
      if (isForbiddenBrowserHeader(key)) continue;
      out[key] = value;
    }
    return out;
  }

  function encodeProxyHeaders(headersLike) {
    try {
      const json = JSON.stringify(filterBrowserRequestHeaders(headersLike));
      return btoa(unescape(encodeURIComponent(json)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    } catch {
      return '';
    }
  }

  // ─── global ─────────────────────────────────────────────────────
  // Node.js uses `global` as the global object; browsers use `globalThis`.
  if (typeof globalThis.global === 'undefined') {
    globalThis.global = globalThis;
  }

  // ─── Bun-style MACRO globals (some pre-bundled CLIs expect these) ─
  // ESM chunks may evaluate before the CLI entry's inline polyfills run.
  if (typeof globalThis.MACRO === 'undefined') {
    globalThis.MACRO = {
      VERSION: '0.0.0-browser',
      BUILD_TIME: new Date().toISOString(),
      FEEDBACK_CHANNEL: '',
      ISSUES_EXPLAINER: '',
      NATIVE_PACKAGE_URL: '',
      PACKAGE_URL: '',
      VERSION_CHANGELOG: '',
    };
  }
  if (typeof globalThis.BUILD_TARGET === 'undefined') {
    globalThis.BUILD_TARGET = 'browser';
  }
  if (typeof globalThis.BUILD_ENV === 'undefined') {
    globalThis.BUILD_ENV = 'production';
  }
  if (typeof globalThis.INTERFACE_TYPE === 'undefined') {
    globalThis.INTERFACE_TYPE = 'browser';
  }

  // ─── Error logging for debugging ───────────────────────────────
  // Log all errors to localStorage for post-mortem inspection
  globalThis.__v9_errors = [];
  globalThis.addEventListener('error', (evt) => {
    const msg = evt.error?.message || String(evt.message);
    globalThis.__v9_errors.push({type: 'error', msg: msg.substring(0, 200), stack: evt.error?.stack?.substring(0, 300)});
    try { localStorage.setItem('__v9_errors', JSON.stringify(globalThis.__v9_errors.slice(-10))); } catch(e) {}
    // Suppress known exit-related errors
    if (msg === 'unreachable' || evt.error?.code === 'PROCESS_EXIT') {
      evt.preventDefault();
    }
  });
  globalThis.addEventListener('unhandledrejection', (evt) => {
    const msg = evt.reason?.message || String(evt.reason);
    globalThis.__v9_errors.push({type: 'rejection', msg: msg.substring(0, 200), stack: evt.reason?.stack?.substring(0, 300)});
    try { localStorage.setItem('__v9_errors', JSON.stringify(globalThis.__v9_errors.slice(-10))); } catch(e) {}
    if (msg === 'unreachable' || evt.reason?.code === 'PROCESS_EXIT') {
      evt.preventDefault();
    }
  });

  // ─── require shim ──────────────────────────────────────────────
  // Emscripten's generated JS checks process.versions.node and calls
  // require('node:worker_threads') and require('node:fs').
  // Provide a minimal shim so the IIFE doesn't crash.
  if (typeof globalThis.require === 'undefined') {
    globalThis.require = function(name) {
      if (name === 'node:worker_threads' || name === 'worker_threads') {
        return {
          isMainThread: true,
          workerData: null,
          threadId: 0,
          parentPort: null,
          Worker: globalThis.Worker || class {},
          MessageChannel: globalThis.MessageChannel || class {},
          MessagePort: globalThis.MessagePort || class {},
          BroadcastChannel: globalThis.BroadcastChannel || class {},
        };
      }
      if (name === 'node:fs' || name === 'fs') {
        return {
          readFileSync: () => new Uint8Array(0),
          existsSync: () => false,
          readdirSync: () => [],
        };
      }
      return {};
    };
  }

  // ─── __filename / __dirname ────────────────────────────────────
  // Emscripten's Node.js path uses these globals.
  if (typeof globalThis.__filename === 'undefined') {
    globalThis.__filename = '/app/index.js';
  }
  if (typeof globalThis.__dirname === 'undefined') {
    globalThis.__dirname = '/app';
  }

  // ─── process ──────────────────────────────────────────────────────
  // Minimal process object for code that accesses process without importing.
  // The full processBridge replaces this once browser-builtins.js loads.

  if (typeof globalThis.process === 'undefined') {
    const _env = {
      // Example: route vendor APIs through local dev proxy when needed
      ANTHROPIC_BASE_URL: 'http://localhost:8081',
    };
    // Enable HTTP relay on GitHub Pages — tunnels real TCP listeners
    // through a WebSocket so localhost:<port> actually works in-tab.
    try {
      const host = globalThis.location?.hostname || '';
      if (host.endsWith('.github.io') || _env.NODEJS_IN_TAB_HTTP_RELAY) {
        _env.NODEJS_IN_TAB_HTTP_RELAY = '1';
        if (!_env.NODEJS_IN_TAB_HTTP_RELAY_WS) {
          _env.NODEJS_IN_TAB_HTTP_RELAY_WS = 'wss://relay.stare.network/__in-tab-http-ws';
        }
      }
    } catch { /* ignore */ }

    // Auto-detect v9-net — enables gvisor TCP networking.
    // Override with ?gvisor=ws://host:port query param.
    // Set env var OPTIMISTICALLY so modules see it at import time.
    // If the probe fails, clear it (but by then modules already loaded
    // and will get gvisor — if v9-net isn't running, connect() will
    // fail gracefully with WS error).
    try {
      const params = new URLSearchParams(globalThis.location?.search || '');
      const wsUrl = params.get('gvisor') || 'ws://localhost:8765';
      console.log('[v9-net:probe] setting NODEJS_GVISOR_WS_URL=' + wsUrl);
      // Set immediately — modules check this synchronously at import time
      _env.NODEJS_GVISOR_WS_URL = wsUrl;
      // Also set on globalThis.process.env directly in case it's a different object
      if (globalThis.process && globalThis.process.env && globalThis.process.env !== _env) {
        globalThis.process.env.NODEJS_GVISOR_WS_URL = wsUrl;
      }
      console.log('[v9-net:probe] env set on _env and process.env');
      // Keep relay vars intact until probe succeeds — modules may need them
      // if v9-net turns out to not be running
      const probeUrl = new URL(wsUrl);
      probeUrl.pathname = '/__v9net/forward';
      console.log('[v9-net:probe] connecting to ' + probeUrl.toString());
      const probe = new WebSocket(probeUrl.toString());
      probe.onopen = () => {
        probe.close();
        // v9-net confirmed running — disable relay, gvisor handles everything
        delete _env.NODEJS_IN_TAB_HTTP_RELAY;
        delete _env.NODEJS_IN_TAB_HTTP_RELAY_WS;
        if (globalThis.process?.env) {
          delete globalThis.process.env.NODEJS_IN_TAB_HTTP_RELAY;
          delete globalThis.process.env.NODEJS_IN_TAB_HTTP_RELAY_WS;
        }
        console.log('[v9-net:probe] SUCCESS — v9-net is running, TCP networking enabled, relay disabled');
      };
      probe.onerror = (e) => {
        // v9-net not running. Leave NODEJS_GVISOR_WS_URL set —
        // gvisor-net.js handles connection failures gracefully with
        // timeouts and error events. Deleting the env var here causes
        // a race condition where modules may or may not see it depending
        // on how fast the WS refusal comes back.
        console.warn('[v9-net:probe] FAILED — v9-net not reachable. Networking will fall back gracefully.', e);
      };
    } catch { /* ignore */ }

    const _cwd = '/';
    // Minimal EventEmitter for signal handling (signal-exit library needs this)
    const _listeners = {};
    const _on = (evt, fn) => { (_listeners[evt] = _listeners[evt] || []).push(fn); return globalThis.process; };
    const _off = (evt, fn) => { const a = _listeners[evt]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } return globalThis.process; };
    const _emit = (evt, ...args) => { const a = _listeners[evt]; if (a) a.slice().forEach(fn => fn(...args)); return !!a; };

    globalThis.process = {
      env: _env,
      argv: ['/usr/bin/node', '/app/bundle.js'],
      platform: 'linux',
      arch: 'x64',  // Report x64 to prevent "Unsupported architecture" from CLIs
      version: 'v22.0.0',
      versions: { node: '22.0.0' },
      pid: 1,
      ppid: 0,
      // exitCode must remain undefined for the CLI's `process.exitCode !== void 0` check.
      // signal-exit sets it to 128+N (e.g. 129 for SIGHUP). We block those writes
      // because there are no real OS signals in the browser.
      get exitCode() { return this._exitCode; },
      set exitCode(v) {
        // Block signal-exit's synthetic signal codes (128+N)
        if (typeof v === 'number' && v >= 128) return;
        this._exitCode = v;
      },
      _exitCode: undefined,
      cwd: () => _cwd,
      chdir: () => {},
      on: _on,
      addListener: _on,
      once: (evt, fn) => { const w = (...a) => { _off(evt, w); fn(...a); }; return _on(evt, w); },
      off: _off,
      removeListener: _off,
      removeAllListeners: (evt) => { if (evt) delete _listeners[evt]; else Object.keys(_listeners).forEach(k => delete _listeners[k]); return globalThis.process; },
      emit: _emit,
      listeners: (evt) => (_listeners[evt] || []).slice(),
      listenerCount: (evt) => (_listeners[evt] || []).length,
      rawListeners: (evt) => (_listeners[evt] || []).slice(),
      exit: (code) => {
        // Do NOT set process.exitCode here — some CLIs treat a preset exitCode
        // as "already exiting" and skip init.
        globalThis.__exitTraces = globalThis.__exitTraces || [];
        globalThis.__exitTraces.push({ code, stack: new Error().stack });
        const err = new Error(`process.exit(${code})`);
        err.code = 'PROCESS_EXIT';
        err.exitCode = code ?? 0;
        throw err;
      },
      kill: (pid, signal) => {
        // No-op — can't kill processes in browser
      },
      reallyExit: (code) => {
        // No-op — signal-exit saves and replaces this
      },
      nextTick: (fn, ...args) => Promise.resolve().then(() => fn(...args)),
      stdout: {
        write: (chunk, encoding, callback) => {
          if (typeof encoding === 'function') { callback = encoding; encoding = undefined; }
          const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
          if (globalThis._xtermWrite) globalThis._xtermWrite(str);
          else console.log(str);
          if (callback) callback();
          return true;
        },
        columns: 80, rows: 24, isTTY: true, fd: 1,
        getColorDepth: () => 8, hasColors: (n) => (n || 1) <= 256,
        getWindowSize: () => [80, 24],
        cursorTo: () => true, clearLine: () => true, moveCursor: () => true,
        on: () => globalThis.process.stdout, once: () => globalThis.process.stdout,
        removeListener: () => globalThis.process.stdout,
        emit: () => false,
      },
      stderr: {
        write: (chunk, encoding, callback) => {
          if (typeof encoding === 'function') { callback = encoding; encoding = undefined; }
          const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
          if (globalThis._xtermWrite) globalThis._xtermWrite(str);
          else console.error(str);
          if (callback) callback();
          return true;
        },
        columns: 80, rows: 24, isTTY: true, fd: 2,
        getColorDepth: () => 8, hasColors: (n) => (n || 1) <= 256,
        getWindowSize: () => [80, 24],
        on: () => globalThis.process.stderr, once: () => globalThis.process.stderr,
        removeListener: () => globalThis.process.stderr,
        emit: () => false,
      },
      stdin: {
        on: () => globalThis.process.stdin, once: () => globalThis.process.stdin,
        removeListener: () => globalThis.process.stdin,
        resume: () => {}, pause: () => {}, setEncoding: () => {},
        setRawMode: () => globalThis.process.stdin,
        ref: () => globalThis.process.stdin, unref: () => globalThis.process.stdin,
        read: () => null,
        isTTY: true, fd: 0, readable: true,
      },
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
    const _nativeLog = globalThis.console.log.bind(globalThis.console);
    const _nativeError = globalThis.console.error.bind(globalThis.console);
    globalThis.console.Console = class Console {
      constructor(opts) {
        const out = opts?.stdout || { write: (s) => _nativeLog(s) };
        const err = opts?.stderr || { write: (s) => _nativeError(s) };
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
  // Intercept fetch to api.anthropic.com / platform.claude.com and route through
  // a same-origin or first-party CORS proxy (e.g. web/cors-proxy-worker.js).
  //
  // Resolution order: ?proxy= → __V9_ANTHROPIC_FETCH_PROXY__ or
  // __V9_PAGES_ANTHROPIC_PROXY__ → on loopback hosts only, http://localhost:8081.
  // On github.io and other non-loopback hosts, no default — omit ?proxy= to use
  // direct fetch (will fail CORS until a proxy URL is configured).

  const _origFetch = globalThis.fetch;
  const _proxyUrl = (() => {
    try {
      const params = new URLSearchParams(globalThis.location?.search || '');
      const q = params.get('proxy');
      if (q) return q;
    } catch { /* ignore */ }
    for (const key of ['__V9_ANTHROPIC_FETCH_PROXY__', '__V9_PAGES_ANTHROPIC_PROXY__']) {
      const v = globalThis[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    try {
      const host = globalThis.location?.hostname || '';
      const loopback =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '[::1]' ||
        host === '::1';
      if (loopback) return 'http://localhost:8081';
    } catch { /* ignore */ }
    return '';
  })();

  if (_proxyUrl) {
    globalThis.fetch = function patchedFetch(input, init) {
      let url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
      const sanitizedInit = init ? { ...init, headers: filterBrowserRequestHeaders(init.headers || {}) } : init;

      // Route Anthropic API calls through CORS proxy
      if (url.includes('api.anthropic.com') || url.includes('platform.claude.com')) {
        const target = new URL(url);
        const origHost = target.hostname;
        const proxy = new URL(_proxyUrl);
        target.hostname = proxy.hostname;
        target.port = proxy.port;
        target.protocol = proxy.protocol;
        url = target.toString();

        // Tell the proxy which host to forward to
        const proxyInit = {
          ...sanitizedInit,
          headers: { ...filterBrowserRequestHeaders(init?.headers || {}), 'X-Proxy-Host': origHost },
        };

        // redirect_uri stays as localhost in both auth request and token
        // exchange — no rewrite needed since the auth proxy intercepts
        // the localhost redirect server-side.

        if (typeof input === 'string') {
          return _origFetch.call(globalThis, url, proxyInit);
        }
        return _origFetch.call(
          globalThis,
          new Request(url, { ...input, headers: { ...filterBrowserRequestHeaders(input.headers), 'X-Proxy-Host': origHost } }),
          sanitizedInit
        );
      }

      if (typeof input === 'string') {
        return _origFetch.call(globalThis, input, sanitizedInit);
      }
      if (input instanceof Request) {
        return _origFetch.call(
          globalThis,
          new Request(input, { headers: filterBrowserRequestHeaders(input.headers) }),
          sanitizedInit
        );
      }
      return _origFetch.call(globalThis, input, sanitizedInit);
    };
    // Preserve fetch properties
    Object.setPrototypeOf(globalThis.fetch, _origFetch);

    // Also intercept XMLHttpRequest for telemetry/metrics
    const _origXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      if (typeof url === 'string' && (url.includes('api.anthropic.com') || url.includes('platform.claude.com'))) {
        const target = new URL(url);
        const origHost = target.hostname;
        const proxy = new URL(_proxyUrl);
        target.hostname = proxy.hostname;
        target.port = proxy.port;
        target.protocol = proxy.protocol;
        url = target.toString();
        this.__proxyHost = origHost;
      }
      return _origXHROpen.call(this, method, url, ...rest);
    };
    const _origXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
      if (this.__proxyHost) {
        _origXHRSetRequestHeader.call(this, 'X-Proxy-Host', this.__proxyHost);
      }
      return _origXHRSend.call(this, body);
    };
    const _origXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
      if (isForbiddenBrowserHeader(name)) {
        return;
      }
      return _origXHRSetRequestHeader.call(this, name, value);
    };

    if (!globalThis.__browserRuntimeNativeWebSocket) {
      globalThis.__browserRuntimeNativeWebSocket = globalThis.WebSocket;
    }

    const NativeWebSocket = globalThis.__browserRuntimeNativeWebSocket;
    globalThis.WebSocket = class BrowserRuntimeWebSocket extends NativeWebSocket {
      constructor(url, protocolsOrOptions) {
        const rawUrl = typeof url === 'string' ? url : String(url);
        const hasProxyTarget = /^wss?:\/\//i.test(rawUrl);
        const isObjectOptions =
          protocolsOrOptions &&
          typeof protocolsOrOptions === 'object' &&
          !Array.isArray(protocolsOrOptions);

        if (!hasProxyTarget || !isObjectOptions) {
          super(url, protocolsOrOptions);
          return;
        }

        const options = protocolsOrOptions || {};
        const proxy = new URL(_proxyUrl);
        proxy.protocol = proxy.protocol === 'https:' ? 'wss:' : 'ws:';
        proxy.pathname = '/__ws';
        proxy.searchParams.set('url', rawUrl);

        const encodedHeaders = encodeProxyHeaders(options.headers);
        if (encodedHeaders) {
          proxy.searchParams.set('headers', encodedHeaders);
        }

        const protocols = Array.isArray(options.protocols)
          ? options.protocols
          : (typeof options.protocol === 'string' ? [options.protocol] : []);
        for (const protocol of protocols) {
          proxy.searchParams.append('protocol', protocol);
        }

        super(proxy.toString(), protocols);
      }
    };
  }

  // ─── External URL open + localhost callback capture ──────────────
  // Generic browser-runtime support for Node apps that launch an
  // external browser and expect a localhost redirect back.

  function getBrowserLocalServerRegistry() {
    if (!globalThis.__browserRuntimeLocalHttpServers) {
      globalThis.__browserRuntimeLocalHttpServers = {};
    }
    return globalThis.__browserRuntimeLocalHttpServers;
  }

  function buildOAuthBridgeUrl(localRedirectUrl) {
    try {
      const local = new URL(localRedirectUrl);
      const baseHref = globalThis.location?.href || 'http://localhost:8080/web/index.html';
      const bridge = new URL('oauth-bridge.html', new URL('./', baseHref));
      bridge.searchParams.set('edge_callback_origin', globalThis.location?.origin || bridge.origin);
      bridge.searchParams.set('edge_callback_port', local.port || '80');
      bridge.searchParams.set('edge_callback_path', local.pathname || '/');
      if (local.search) bridge.searchParams.set('edge_callback_search', local.search.slice(1));
      return bridge.toString();
    } catch {
      return null;
    }
  }

  function maybeRewriteOAuthUrl(url) {
    // Don't rewrite redirect_uri (server only accepts localhost).
    // Store callback info in sessionStorage so oauth-bridge.html can
    // deliver the auth code when the V9 OAuth Bridge extension
    // redirects the failed localhost callback to the bridge page.
    try {
      const parsed = new URL(url);
      const redirectUri = parsed.searchParams.get('redirect_uri');
      if (!redirectUri) return url;
      const local = new URL(redirectUri);
      const isLoopback = local.hostname === 'localhost' || local.hostname === '127.0.0.1';
      if (!isLoopback) return url;
      const port = local.port || '80';
      if (!getBrowserLocalServerRegistry()[port]) return url;
      localStorage.setItem('__v9_oauth_callback', JSON.stringify({
        origin: globalThis.location?.origin,
        port,
        path: local.pathname || '/callback',
      }));
    } catch { /* ignore */ }
    return url;
  }

  if (!globalThis.__browserRuntimeOAuthBridgeInstalled) {
    function _handleOAuthCallback(data) {
      if (!data || data.type !== 'edge-oauth-callback') return;
      const port = String(data.port || '');
      if (!port) return;
      const registry = getBrowserLocalServerRegistry();
      const server = registry[port];
      if (!server) return;
      const target = new URL(`http://localhost:${port}${data.path || '/callback'}`);
      if (data.search) target.search = data.search.startsWith('?') ? data.search : `?${data.search}`;
      server._handleRedirect?.(target.toString());
    }
    // Primary: postMessage from popup with window.opener intact
    globalThis.addEventListener('message', (event) => {
      if (event.origin !== globalThis.location?.origin) return;
      _handleOAuthCallback(event.data);
      try { event.source?.close?.(); } catch {}
    });
    // Fallback: BroadcastChannel for when COOP severs window.opener
    try {
      const bc = new BroadcastChannel('v9-oauth-bridge');
      bc.onmessage = (event) => _handleOAuthCallback(event.data);
    } catch { /* BroadcastChannel not supported */ }
    globalThis.__browserRuntimeOAuthBridgeInstalled = true;
  }

  if (typeof globalThis.__browserRuntimeOpenExternalUrl !== 'function') {
    globalThis.__browserRuntimeOpenExternalUrl = function openExternalUrl(url, options = {}) {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        return Promise.resolve({ opened: false, reason: 'invalid-url' });
      }
      const rewrittenUrl = maybeRewriteOAuthUrl(url);
      const popup = globalThis.open?.(
        rewrittenUrl,
        options.target || '_blank',
        options.features || 'width=600,height=700,popup=yes'
      );
      if (!popup) {
        return Promise.resolve({ opened: false, reason: 'popup-blocked' });
      }

      return Promise.resolve({ opened: true });
    };
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
