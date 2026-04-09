/**
 * wolfssl-tls.js — TLS layer over gvisor raw TCP using wolfSSL compiled to Wasm.
 *
 * Provides WolfTlsSocket (Duplex stream) that wraps a GvisorSocket with
 * wolfSSL encryption. The Wasm module handles all TLS framing, handshake,
 * and crypto; this module shuttles bytes between JS and Wasm ring buffers.
 *
 * Usage:
 *   import { createTlsConnection } from './wolfssl-tls.js';
 *   const sock = createTlsConnection({ host: 'example.com', port: 443 });
 *   sock.on('secureConnect', () => { sock.write('GET / ...'); });
 *   sock.on('data', chunk => console.log(chunk));
 */

import { Duplex } from './streams.js';
import { GvisorSocket, getGvisorStack } from './gvisor-net.js';

let _wasm = null;
let _api = null;
let _initPromise = null;

const PULL_BUF_SIZE = 16384;

/** Lazy-load and init the wolfSSL Wasm module. */
async function _ensureWasm() {
  if (_api) return _api;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    // Dynamic import — wolfssl.js is the Emscripten loader
    const wasmUrl = new URL('./wolfssl.wasm', import.meta.url).href;
    const loaderUrl = new URL('./wolfssl.js', import.meta.url).href;

    // Emscripten MODULARIZE output: import returns a factory function
    const module = await import(loaderUrl);
    const factory = module.default || module;
    _wasm = await factory({ locateFile: () => wasmUrl });

    _api = {
      init:        _wasm.cwrap('wssl_init', 'number', []),
      create:      _wasm.cwrap('wssl_new', 'number', ['string']),
      handshake:   _wasm.cwrap('wssl_handshake', 'number', ['number']),
      write:       _wasm.cwrap('wssl_write', 'number', ['number', 'number', 'number']),
      read:        _wasm.cwrap('wssl_read', 'number', ['number', 'number', 'number']),
      shutdown:    _wasm.cwrap('wssl_shutdown', 'number', ['number']),
      free:        _wasm.cwrap('wssl_free', null, ['number']),
      pushRecv:    _wasm.cwrap('wssl_push_recv', 'number', ['number', 'number', 'number']),
      pullSend:    _wasm.cwrap('wssl_pull_send', 'number', ['number', 'number', 'number']),
      sendPending: _wasm.cwrap('wssl_send_pending', 'number', ['number']),
      malloc:      _wasm._malloc,
      free_:       _wasm._free,
      HEAPU8:      _wasm.HEAPU8,
    };

    const ret = _api.init();
    if (ret !== 0) throw new Error(`wolfSSL init failed: ${ret}`);
    return _api;
  })();
  return _initPromise;
}

/**
 * WolfTlsSocket — Duplex stream wrapping a GvisorSocket with wolfSSL TLS.
 *
 * Data flow:
 *   app.write(plain) → wolfSSL encrypt → send_buf → TCP socket
 *   TCP socket → recv_buf → wolfSSL decrypt → app 'data' event
 */
export class WolfTlsSocket extends Duplex {
  constructor(opts) {
    super(opts);
    this._hostname = opts.host || opts.hostname || opts.servername || '';
    this._port = opts.port;
    this._tcp = null;
    this._sessionId = -1;
    this._handshakeDone = false;
    this._destroyed = false;
    this._pullBuf = 0; // Wasm heap pointer for pulling send data
    this._pushBuf = 0; // Wasm heap pointer for pushing recv data

    this.encrypted = true;
    this.authorized = false; // cert verification disabled for now
    this.connecting = true;
    this.pending = true;

    this._start(opts);
  }

  get remoteAddress() { return this._tcp?.remoteAddress; }
  get remotePort() { return this._tcp?.remotePort; }
  get remoteFamily() { return 'IPv4'; }
  get localAddress() { return this._tcp?.localAddress; }
  get localPort() { return this._tcp?.localPort; }

  async _start(opts) {
    try {
      const api = await _ensureWasm();

      // Allocate Wasm heap buffers for I/O exchange
      this._pullBuf = api.malloc(PULL_BUF_SIZE);
      this._pushBuf = api.malloc(PULL_BUF_SIZE);

      // Create wolfSSL session with SNI
      this._sessionId = api.create(this._hostname);
      if (this._sessionId < 0) {
        throw new Error(`wolfSSL session creation failed: ${this._sessionId}`);
      }

      // Open raw TCP via gvisor
      this._tcp = new GvisorSocket(null);
      this._tcp.on('error', (err) => this._onTcpError(err));
      this._tcp.on('close', () => this._onTcpClose());

      // When TCP data arrives, push it into wolfSSL's recv buffer
      this._tcp.on('data', (chunk) => this._onTcpData(chunk));

      // When TCP connects, start TLS handshake
      this._tcp.on('connect', () => this._driveHandshake());

      this._tcp.connect(this._port, this._hostname);
    } catch (err) {
      this._emitError(err);
    }
  }

  _onTcpData(chunk) {
    if (this._destroyed || this._sessionId < 0) return;
    const api = _api;
    const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk.buffer || chunk);

    // Push received TCP bytes into wolfSSL recv ring buffer
    const heapBuf = this._pushBuf;
    for (let off = 0; off < u8.length; off += PULL_BUF_SIZE) {
      const n = Math.min(PULL_BUF_SIZE, u8.length - off);
      _wasm.HEAPU8.set(u8.subarray(off, off + n), heapBuf);
      api.pushRecv(this._sessionId, heapBuf, n);
    }

    if (!this._handshakeDone) {
      this._driveHandshake();
    } else {
      this._driveRead();
    }
  }

  _driveHandshake() {
    const api = _api;
    const ret = api.handshake(this._sessionId);

    // Flush any TLS records wolfSSL wants to send (ClientHello, etc.)
    this._flushSend();

    if (ret === 0) {
      // Handshake complete
      this._handshakeDone = true;
      this.connecting = false;
      this.pending = false;
      this.authorized = true; // VERIFY_NONE for now
      queueMicrotask(() => {
        this.emit('secureConnect');
        this.emit('connect');
        this.emit('ready');
      });
      // There might already be app data buffered
      this._driveRead();
    } else if (ret === 1) {
      // Need more I/O — wait for more TCP data
    } else {
      this._emitError(new Error(`TLS handshake failed: ${ret}`));
    }
  }

  _driveRead() {
    if (this._destroyed || this._sessionId < 0 || !this._handshakeDone) return;
    const api = _api;

    while (true) {
      const n = api.read(this._sessionId, this._pullBuf, PULL_BUF_SIZE);
      if (n > 0) {
        const data = new Uint8Array(_wasm.HEAPU8.buffer, this._pullBuf, n).slice();
        this.push(data);
      } else if (n === 0) {
        break; // WANT_READ — no more decrypted data available
      } else if (n === -2) {
        // Peer closed TLS
        this.push(null);
        break;
      } else {
        this._emitError(new Error(`TLS read error: ${n}`));
        break;
      }
    }
  }

  /** Flush wolfSSL send buffer → TCP socket. */
  _flushSend() {
    if (!this._tcp || this._sessionId < 0) return;
    const api = _api;

    while (api.sendPending(this._sessionId) > 0) {
      const n = api.pullSend(this._sessionId, this._pullBuf, PULL_BUF_SIZE);
      if (n <= 0) break;
      const data = new Uint8Array(_wasm.HEAPU8.buffer, this._pullBuf, n).slice();
      this._tcp.write(data);
    }
  }

  // ─── Duplex interface ──────────────────────────────────────────
  _read(_size) {
    // Data is pushed via _driveRead
  }

  _write(chunk, encoding, callback) {
    if (this._destroyed || this._sessionId < 0) {
      callback(new Error('TLS socket closed'));
      return;
    }
    if (!this._handshakeDone) {
      // Queue writes until handshake completes
      this.once('secureConnect', () => this._write(chunk, encoding, callback));
      return;
    }
    const api = _api;
    if (typeof chunk === 'string') chunk = new TextEncoder().encode(chunk);
    else if (!(chunk instanceof Uint8Array)) chunk = new Uint8Array(chunk.buffer || chunk);

    // Encrypt via wolfSSL
    _wasm.HEAPU8.set(chunk, this._pushBuf);
    const ret = api.write(this._sessionId, this._pushBuf, chunk.length);
    this._flushSend();

    if (ret > 0) {
      callback();
    } else {
      callback(new Error(`TLS write error: ${ret}`));
    }
  }

  _final(callback) {
    if (this._sessionId >= 0 && _api) {
      _api.shutdown(this._sessionId);
      this._flushSend();
    }
    this._tcp?.end();
    callback();
  }

  destroy(err) {
    if (this._destroyed) return this;
    this._destroyed = true;
    this.connecting = false;
    this.pending = false;
    if (this._sessionId >= 0 && _api) {
      _api.free_(this._pullBuf);
      _api.free_(this._pushBuf);
      _api.free(this._sessionId);
      this._sessionId = -1;
    }
    this._tcp?.destroy();
    queueMicrotask(() => {
      if (err && this.listenerCount('error') > 0) this.emit('error', err);
      this.emit('close', !!err);
    });
    return this;
  }

  setKeepAlive() { return this; }
  setNoDelay() { return this; }
  setTimeout(ms, cb) { if (cb) this.once('timeout', cb); return this; }
  ref() { return this; }
  unref() { return this; }

  _onTcpError(err) {
    if (!this._destroyed) this._emitError(err);
  }

  _onTcpClose() {
    if (!this._destroyed) {
      this.push(null);
      queueMicrotask(() => this.emit('close', false));
    }
  }

  _emitError(err) {
    this._destroyed = true;
    queueMicrotask(() => {
      if (this.listenerCount('error') > 0) this.emit('error', err);
      this.emit('close', true);
    });
  }
}

/**
 * Create a TLS connection via wolfSSL over gvisor TCP.
 * Drop-in for tls.connect().
 */
export function createTlsConnection(opts, cb) {
  const sock = new WolfTlsSocket(opts);
  if (cb) sock.once('secureConnect', cb);
  return sock;
}
