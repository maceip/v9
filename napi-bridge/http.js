/**
 * http/https — Node.js-compatible HTTP client via browser fetch().
 *
 * ClientRequest (Writable) accumulates body, fires fetch() on end().
 * IncomingMessage (Readable) wraps the Response, streams body chunks.
 *
 * Backpressure: ClientRequest relies on Writable.write() + _write() for
 * proper flow control. When streaming upload is supported (Chromium 105+),
 * large request bodies auto-upgrade to ReadableStream with pull-based
 * backpressure, avoiding full buffering and concatenation.
 */

import { EventEmitter } from './eventemitter.js';
import { Readable, Writable } from './streams.js';
import { browserHttpFetch } from './transport-policy.mjs';
import { isGvisorAvailable, GvisorSocket, GvisorServer as _GvisorTcpServer } from './gvisor-net.js';

const _encoder = new TextEncoder();
const _decoder = new TextDecoder('utf-8');

const _FORBIDDEN_BROWSER_HEADERS = new Set([
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

function _isForbiddenBrowserHeader(name) {
  const lower = String(name || '').toLowerCase();
  return _FORBIDDEN_BROWSER_HEADERS.has(lower) || lower.startsWith('sec-') || lower.startsWith('proxy-');
}

// Detect streaming upload support (Chromium 105+: ReadableStream body + duplex: 'half')
let _supportsStreamingUpload = null;
function _canStreamUpload() {
  if (_supportsStreamingUpload !== null) return _supportsStreamingUpload;
  try {
    // Feature-detect: Request constructor accepts ReadableStream body + duplex
    _supportsStreamingUpload = typeof ReadableStream === 'function'
      && typeof Request === 'function'
      && (() => { new Request('http://x', { body: new ReadableStream(), method: 'POST', duplex: 'half' }); return true; })();
  } catch {
    _supportsStreamingUpload = false;
  }
  return _supportsStreamingUpload;
}

// ─── Proxy-aware fetch for Node.js ──────────────────────────────────
// Node.js fetch() doesn't auto-use HTTP_PROXY env vars.
// When running in Node.js with a proxy, use native http/https + CONNECT tunnel.

const _isNode = typeof globalThis.process?.versions?.node === 'string';
/** Polyfills set process.versions.node in-tab; use DOM presence for real browser fetch path. */
const _hasBrowsingContext = typeof globalThis.document !== 'undefined';

async function _proxyFetch(url, opts) {
  // Tab / browser: transport policy (native fetch TLS, optional NODEJS_IN_TAB_FETCH_PROXY).
  // See transport-policy.mjs — not the Node CONNECT path below.
  if (_hasBrowsingContext) return browserHttpFetch(url, opts);

  const proxyUrl = globalThis.process?.env?.https_proxy
    || globalThis.process?.env?.HTTPS_PROXY
    || globalThis.process?.env?.http_proxy
    || globalThis.process?.env?.HTTP_PROXY;

  if (!proxyUrl) return fetch(url, opts);

  // Use native Node.js http/https with CONNECT tunnel through proxy
  const nodeHttp = await import('node:http');
  const nodeHttps = await import('node:https');
  const target = new URL(url);
  const proxy = new URL(proxyUrl);

  return new Promise((resolve, reject) => {
    if (opts?.signal?.aborted) {
      reject(new DOMException('The operation was aborted', 'AbortError'));
      return;
    }

    const connectOpts = {
      hostname: proxy.hostname,
      port: proxy.port,
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || (target.protocol === 'https:' ? 443 : 80)}`,
      headers: { Host: `${target.hostname}:${target.port || (target.protocol === 'https:' ? 443 : 80)}` },
    };

    if (proxy.username) {
      const auth = decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password);
      connectOpts.headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(auth).toString('base64');
    }

    const connectReq = nodeHttp.default.request(connectOpts);

    if (opts?.signal) {
      opts.signal.addEventListener('abort', () => connectReq.destroy(), { once: true });
    }

    connectReq.on('connect', (_res, socket) => {
      // Bug #9: Check proxy response status before proceeding
      if (_res.statusCode !== 200) {
        reject(new Error(`CONNECT tunnel failed: ${_res.statusCode} ${_res.statusMessage}`));
        socket.destroy();
        return;
      }

      const reqMod = target.protocol === 'https:' ? nodeHttps.default : nodeHttp.default;
      const reqOpts = {
        hostname: target.hostname,
        path: target.pathname + target.search,
        method: opts?.method || 'GET',
        headers: opts?.headers || {},
        socket,
        agent: false,
      };

      const req = reqMod.request(reqOpts, (res) => {
        // Build a Response-like object with streaming support
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) v.forEach(val => headers.append(k, val));
          else if (v !== undefined) headers.set(k, v);
        }

        // Backpressure-aware streaming: pause Node.js source when downstream is full
        const readable = new ReadableStream({
          start(controller) {
            res.on('data', (chunk) => {
              controller.enqueue(new Uint8Array(chunk));
              // Pause the Node.js source when ReadableStream buffer is full
              if (controller.desiredSize !== null && controller.desiredSize <= 0) {
                res.pause();
              }
            });
            res.on('end', () => {
              controller.close();
            });
            res.on('error', (err) => {
              controller.error(err);
            });
          },
          pull() {
            // Consumer is ready for more data — resume the Node.js source
            res.resume();
          },
          cancel() {
            res.destroy();
          },
        });

        const response = new Response(readable, {
          status: res.statusCode,
          statusText: res.statusMessage,
          headers,
        });
        resolve(response);
      });

      req.on('error', reject);

      // Handle streaming body (ReadableStream) or buffered body
      if (opts?.body instanceof ReadableStream) {
        const reader = opts.body.getReader();
        (async function pump() {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) { req.end(); return; }
              req.write(value);
            }
          } catch (err) {
            req.destroy(err);
          }
        })();
      } else {
        if (opts?.body) {
          req.write(opts.body);
        }
        req.end();
      }
    });

    connectReq.on('error', reject);
    connectReq.end();
  });
}

// ─── URL parsing helper ─────────────────────────────────────────────

function _parseUrl(input, defaults) {
  if (typeof input === 'string') {
    try {
      const u = new URL(input);
      return {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? '443' : '80'),
        path: u.pathname + u.search,
        href: u.href,
      };
    } catch {
      // Relative URL — apply defaults
      return {
        protocol: defaults?.protocol || 'http:',
        hostname: defaults?.hostname || 'localhost',
        port: defaults?.port || '80',
        path: input,
        href: input,
      };
    }
  }
  if (input instanceof URL) {
    return {
      protocol: input.protocol,
      hostname: input.hostname,
      port: input.port || (input.protocol === 'https:' ? '443' : '80'),
      path: input.pathname + input.search,
      href: input.href,
    };
  }
  return null;
}

// ─── IncomingMessage ────────────────────────────────────────────────

class IncomingMessage extends Readable {
  constructor(response) {
    super();
    this.statusCode = response.status;
    this.statusMessage = response.statusText || '';
    this.headers = {};
    this.rawHeaders = [];

    // Bug #8: Handle multi-value headers correctly
    // set-cookie must be an array; other duplicate headers joined with ', '
    response.headers.forEach((value, key) => {
      const lk = key.toLowerCase();
      this.rawHeaders.push(key, value);
      if (lk === 'set-cookie') {
        if (!this.headers[lk]) {
          this.headers[lk] = [value];
        } else {
          this.headers[lk].push(value);
        }
      } else if (this.headers[lk] !== undefined) {
        this.headers[lk] += ', ' + value;
      } else {
        this.headers[lk] = value;
      }
    });

    this._response = response;
    this._reader = null;
    this._reading = false;
  }

  _read() {
    // Bug #2: Respect backpressure — only pump when _read() is called
    if (this._reading) return;
    this._reading = true;

    const body = this._response.body;
    if (!body) {
      // No body (e.g., 204) — try arrayBuffer fallback
      this._response.arrayBuffer().then((buf) => {
        if (buf.byteLength > 0) this.push(new Uint8Array(buf));
        this.push(null);
      }).catch(() => this.push(null));
      return;
    }

    // If body is a ReadableStream (browser or native fetch)
    if (typeof body.getReader === 'function') {
      if (!this._reader) {
        this._reader = body.getReader();
      }
      this._pumpReader();
    } else {
      // Buffer/non-streaming body — push all at once
      this._response.arrayBuffer().then((buf) => {
        if (buf.byteLength > 0) this.push(new Uint8Array(buf));
        this.push(null);
      }).catch((err) => {
        this.destroy(err);
      });
    }
  }

  _pumpReader() {
    this._reader.read().then(({ done, value }) => {
      if (done) {
        this.push(null);
        return;
      }
      // Avoid copying if value is already a Uint8Array (the common case for
      // fetch() ReadableStream chunks). Only wrap if it's an ArrayBuffer or
      // a different typed array view.
      const chunk = (value instanceof Uint8Array) ? value : new Uint8Array(value);
      // Respect backpressure: if push() returns false, stop until next _read()
      const ok = this.push(chunk);
      if (ok) {
        this._pumpReader();
      } else {
        this._reading = false;
        // Next _read() call will resume pumping
      }
    }).catch((err) => {
      this.destroy(err);
    });
  }
}

// ─── Server-side request/response (localhost OAuth / MCP redirect capture) ─
// Modeled after claude-js auth-code-listener.ts + oauthPort.ts: createServer(),
// server.on('request'), listen(port[, host], cb), address(), res.writeHead/end.

class ServerIncomingMessage extends Readable {
  /**
   * @param {object} [opts]
   * @param {string} [opts.method]
   * @param {string} [opts.url]
   * @param {string} [opts.host] — fallback Host if not in headers
   * @param {Record<string, string|string[]>|null} [opts.headers] — merged into .headers (lowercased keys)
   * @param {Uint8Array|null} [opts.body] — optional request body (buffered)
   */
  constructor({ method = 'GET', url = '/', host = 'localhost', headers: inboundHeaders = null, body: bodyU8 = null } = {}) {
    super({ read() {} });
    this.httpVersion = '1.1';
    this.httpVersionMajor = 1;
    this.httpVersionMinor = 1;
    this.method = method;
    this.url = url;
    this.headers = Object.create(null);
    this.rawHeaders = [];
    this.trailers = {};
    const sock = { remoteAddress: '127.0.0.1', remotePort: 1, writable: false, readable: false };
    this.socket = sock;
    this.connection = sock;

    const applyHeader = (name, value) => {
      if (value == null) return;
      const v = Array.isArray(value) ? value.join(', ') : String(value);
      this.rawHeaders.push(name, v);
      this.headers[String(name).toLowerCase()] = v;
    };

    if (inboundHeaders && typeof inboundHeaders === 'object') {
      for (const [k, v] of Object.entries(inboundHeaders)) {
        applyHeader(k, v);
      }
    }
    if (!this.headers.host) {
      applyHeader('host', String(host));
    }

    if (bodyU8 && bodyU8.byteLength) {
      this.complete = false;
      this.push(bodyU8);
      this.push(null);
      this.complete = true;
    } else {
      this.complete = true;
      this.push(null);
    }
  }
}

class OutgoingMessage extends Writable {
  constructor() {
    super({ decodeStrings: false });
    this._headers = Object.create(null);
    this._headersLower = Object.create(null);
    this._headersExplicit = false;
    this.statusCode = 200;
    this.statusMessage = '';
    this.finished = false;
    this._headersSent = false;
    /** @type {Uint8Array[]} — buffered entity body for ServerResponse */
    this._bodyChunks = [];

    Object.defineProperty(this, 'headersSent', {
      configurable: true,
      enumerable: true,
      get: () => this._headersSent,
    });
    Object.defineProperty(this, 'writableEnded', {
      configurable: true,
      enumerable: true,
      get: () => this.finished,
    });
  }

  setHeader(name, value) {
    if (this._headersSent) {
      throw new Error('Cannot set headers after they are sent to the client');
    }
    const key = String(name);
    const lower = key.toLowerCase();
    this._headersLower[lower] = key;
    this._headers[key] = value;
    return this;
  }

  getHeader(name) {
    const orig = this._headersLower[String(name).toLowerCase()];
    return orig !== undefined ? this._headers[orig] : undefined;
  }

  getHeaders() {
    return { ...this._headers };
  }

  removeHeader(name) {
    const lower = String(name).toLowerCase();
    const orig = this._headersLower[lower];
    if (orig !== undefined) {
      delete this._headers[orig];
      delete this._headersLower[lower];
    }
    return this;
  }

  hasHeader(name) {
    return this._headersLower[String(name).toLowerCase()] !== undefined;
  }

  writeHead(statusCode, statusMessage, headers) {
    if (this._headersSent) {
      throw new Error('Cannot write headers after they are sent to the client');
    }
    if (typeof statusMessage === 'object' && statusMessage !== null && !Array.isArray(statusMessage)) {
      headers = statusMessage;
      statusMessage = undefined;
    }
    this.statusCode = statusCode;
    if (typeof statusMessage === 'string') {
      this.statusMessage = statusMessage;
    }
    if (headers && typeof headers === 'object') {
      for (const [k, v] of Object.entries(headers)) {
        this.setHeader(k, v);
      }
    }
    this._headersSent = true;
    this._headersExplicit = true;
    return this;
  }

  flushHeaders() {
    if (!this._headersSent) {
      this.writeHead(this.statusCode, this.statusMessage || undefined);
    }
  }

  _write(chunk, encoding, callback) {
    if (!this._headersSent) {
      this.writeHead(this.statusCode, this.statusMessage || undefined);
    }
    if (chunk != null && chunk !== '') {
      if (typeof chunk === 'string') {
        chunk = _encoder.encode(chunk);
      } else if (!(chunk instanceof Uint8Array)) {
        chunk = new Uint8Array(chunk);
      }
      this._bodyChunks.push(chunk);
    }
    callback();
  }

  end(...args) {
    if (!this._headersSent) {
      this.writeHead(this.statusCode, this.statusMessage || undefined);
    }
    const ret = super.end(...args);
    this.finished = true;
    return ret;
  }
}

class ServerResponse extends OutgoingMessage {}

// ─── ClientRequest ──────────────────────────────────────────────────
// Extends Writable so ClientRequest supports pipe-into and emits 'finish'.
// Backpressure is honored via Writable.write() + _write(); the custom
// write() override that bypassed flow control has been removed.

class ClientRequest extends Writable {
  constructor(url, options, callback) {
    super();

    // Parse arguments: request(url, opts, cb) or request(opts, cb)
    if (typeof url === 'string' || url instanceof URL) {
      const parsed = _parseUrl(url);
      this._options = { ...parsed, ...(options || {}) };
      if (typeof options === 'function') {
        callback = options;
        this._options = { ...parsed };
      }
    } else if (typeof url === 'object') {
      callback = options;
      this._options = { ...url };
    }

    if (callback) {
      this.once('response', callback);
    }

    this._reqHeaders = {};
    this._headerNames = {}; // lowercased → original case
    this._bodyChunks = [];
    this._bodyLength = 0;
    this._ended = false;
    this._abortController = new AbortController();
    this._timeoutTimer = null;
    this._destroyed = false;
    this._aborted = false;

    // Streaming upload state (activated when body exceeds highWaterMark)
    this._fetchStarted = false;
    this._streamController = null;
    this._drainCallback = null;

    // Apply headers from options
    if (this._options.headers) {
      for (const [k, v] of Object.entries(this._options.headers)) {
        this.setHeader(k, v);
      }
    }
  }

  // Writable._write: accumulate body chunks with proper backpressure.
  // When streaming upload is supported and body exceeds highWaterMark,
  // auto-upgrades to ReadableStream body with pull-based backpressure.
  _write(chunk, encoding, callback) {
    if (typeof chunk === 'string') {
      chunk = _encoder.encode(chunk);
    } else if (chunk && !(chunk instanceof Uint8Array)) {
      chunk = new Uint8Array(chunk);
    }
    if (!chunk) {
      callback();
      return;
    }

    // If already in streaming mode, enqueue directly to upload stream
    if (this._streamController) {
      try {
        this._streamController.enqueue(chunk);
      } catch (err) {
        callback(err);
        return;
      }
      // Respect ReadableStream backpressure via desiredSize
      if (this._streamController.desiredSize !== null && this._streamController.desiredSize <= 0) {
        // Defer callback until pull() fires — this keeps Writable.writing=true
        // and causes subsequent writes to queue, providing backpressure to the source
        this._drainCallback = callback;
        return;
      }
      callback();
      return;
    }

    // Buffered mode: accumulate chunk
    this._bodyChunks.push(chunk);
    this._bodyLength += chunk.byteLength;

    // Auto-upgrade to streaming when buffered data exceeds highWaterMark
    const method = (this._options.method || 'GET').toUpperCase();
    if (this._bodyLength > this._writableState.highWaterMark
        && _canStreamUpload()
        && method !== 'GET' && method !== 'HEAD'
        && !this._fetchStarted) {
      this._startStreamingFetch();
      // Drain all buffered chunks into the stream
      for (const c of this._bodyChunks) {
        this._streamController.enqueue(c);
      }
      this._bodyChunks = [];
      this._bodyLength = 0;
    }

    callback();
  }

  setHeader(name, value) {
    const lk = name.toLowerCase();
    this._reqHeaders[lk] = value;
    this._headerNames[lk] = name;
  }

  getHeader(name) {
    return this._reqHeaders[name.toLowerCase()];
  }

  removeHeader(name) {
    const lk = name.toLowerCase();
    delete this._reqHeaders[lk];
    delete this._headerNames[lk];
  }

  // Explicitly send headers and start the fetch with a streaming body.
  // Useful for progressive uploads — call before write() to enable streaming
  // from the first byte. Otherwise, streaming auto-activates when buffered
  // data exceeds highWaterMark.
  flushHeaders() {
    const method = (this._options.method || 'GET').toUpperCase();
    if (!this._fetchStarted && _canStreamUpload() && method !== 'GET' && method !== 'HEAD') {
      this._startStreamingFetch();
    }
  }

  _buildUrl() {
    const opts = this._options;
    const protocol = opts.protocol || 'http:';
    const hostname = opts.hostname || opts.host || 'localhost';
    const port = opts.port;
    const path = opts.path || '/';

    if (opts.href && (opts.href.startsWith('http://') || opts.href.startsWith('https://'))) {
      return opts.href;
    }
    const portSuffix = port && port !== '80' && port !== '443' ? `:${port}` : '';
    return `${protocol}//${hostname}${portSuffix}${path}`;
  }

  _buildHeaders() {
    const headers = {};
    for (const [lk, val] of Object.entries(this._reqHeaders)) {
      if (_isForbiddenBrowserHeader(lk)) continue;
      headers[lk] = String(val);
    }
    return headers;
  }

  /** Build headers without stripping forbidden ones — for gvisor TCP path. */
  _buildAllHeaders() {
    const headers = {};
    for (const [lk, val] of Object.entries(this._reqHeaders)) {
      headers[this._headerNames[lk] || lk] = String(val);
    }
    return headers;
  }

  /**
   * Send HTTP/1.1 request over gvisor raw TCP socket.
   * All headers survive — no browser forbidden-header stripping.
   */
  _doGvisorRequest(body) {
    const opts = this._options;
    const method = (opts.method || 'GET').toUpperCase();
    const path = opts.path || '/';
    const hostname = opts.hostname || opts.host || 'localhost';
    const port = parseInt(opts.port || (opts.protocol === 'https:' ? 443 : 80), 10);
    const headers = this._buildAllHeaders();

    // Ensure Host header
    if (!headers['Host'] && !headers['host']) {
      headers['Host'] = port === 80 || port === 443 ? hostname : `${hostname}:${port}`;
    }

    // Set Content-Length for body
    if (body && !headers['Content-Length'] && !headers['content-length']) {
      headers['Content-Length'] = String(body.byteLength);
    }

    // Build raw HTTP/1.1 request
    let head = `${method} ${path} HTTP/1.1\r\n`;
    for (const [k, v] of Object.entries(headers)) head += `${k}: ${v}\r\n`;
    head += 'Connection: close\r\n\r\n';

    const sock = new GvisorSocket(null);
    sock.connect(port, hostname, () => {
      sock.write(head);
      if (body && body.byteLength) sock.write(body);
    });

    // Parse HTTP response from raw TCP stream
    let respBuf = new Uint8Array(0);
    let headersParsed = false;
    let respHeaders = {};
    let respRawHeaders = [];
    let statusCode = 0;
    let statusMessage = '';
    let incomingMsg = null;

    sock.on('data', (chunk) => {
      const c = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk.buffer || chunk);
      const nb = new Uint8Array(respBuf.length + c.length);
      nb.set(respBuf); nb.set(c, respBuf.length);
      respBuf = nb;

      if (!headersParsed) {
        const str = _decoder.decode(respBuf);
        const idx = str.indexOf('\r\n\r\n');
        if (idx === -1) return;
        headersParsed = true;

        const headerStr = str.slice(0, idx);
        const bodyStart = respBuf.slice(_encoder.encode(str.slice(0, idx + 4)).length);
        const lines = headerStr.split('\r\n');
        const statusLine = lines[0].match(/^HTTP\/[\d.]+ (\d+)\s*(.*)/);
        statusCode = statusLine ? parseInt(statusLine[1], 10) : 502;
        statusMessage = statusLine ? statusLine[2] : '';

        for (let i = 1; i < lines.length; i++) {
          const colon = lines[i].indexOf(':');
          if (colon <= 0) continue;
          const key = lines[i].slice(0, colon).trim();
          const val = lines[i].slice(colon + 1).trim();
          const lk = key.toLowerCase();
          respRawHeaders.push(key, val);
          if (lk === 'set-cookie') {
            if (!respHeaders[lk]) respHeaders[lk] = [val];
            else respHeaders[lk].push(val);
          } else if (respHeaders[lk] !== undefined) {
            respHeaders[lk] += ', ' + val;
          } else {
            respHeaders[lk] = val;
          }
        }

        // Create IncomingMessage-like Readable
        incomingMsg = new Readable({ read() {} });
        incomingMsg.statusCode = statusCode;
        incomingMsg.statusMessage = statusMessage;
        incomingMsg.headers = respHeaders;
        incomingMsg.rawHeaders = respRawHeaders;
        incomingMsg.socket = sock;
        incomingMsg.httpVersion = '1.1';
        incomingMsg.httpVersionMajor = 1;
        incomingMsg.httpVersionMinor = 1;
        incomingMsg.complete = false;

        this._clearTimeoutTimer();
        this.emit('response', incomingMsg);

        if (bodyStart.length) incomingMsg.push(bodyStart);
      } else if (incomingMsg) {
        incomingMsg.push(c);
      }
    });

    sock.on('end', () => {
      if (incomingMsg) { incomingMsg.complete = true; incomingMsg.push(null); }
    });
    sock.on('close', () => {
      if (incomingMsg && !incomingMsg.complete) { incomingMsg.complete = true; incomingMsg.push(null); }
    });
    sock.on('error', (err) => {
      this._clearTimeoutTimer();
      if (!this._destroyed) this.emit('error', err);
    });

    this.socket = sock;
  }

  // Start a streaming fetch with ReadableStream body.
  // Subsequent _write() calls enqueue directly into the stream.
  // end() closes the stream.
  _startStreamingFetch() {
    this._fetchStarted = true;
    const self = this;

    const stream = new ReadableStream({
      start(controller) {
        self._streamController = controller;
      },
      pull() {
        // Consumer is ready for more data — unblock any backpressured _write
        if (self._drainCallback) {
          const cb = self._drainCallback;
          self._drainCallback = null;
          cb();
        }
      },
      cancel() {
        self.destroy();
      },
    }, { highWaterMark: 65536, size(chunk) { return chunk.byteLength; } });

    const url = this._buildUrl();
    const headers = this._buildHeaders();
    const method = (this._options.method || 'GET').toUpperCase();

    _proxyFetch(url, {
      method,
      headers,
      body: stream,
      duplex: 'half',
      signal: this._abortController.signal,
      redirect: 'follow',
    })
      .then((response) => {
        this._clearTimeoutTimer();
        const msg = new IncomingMessage(response);
        this.emit('response', msg);
      })
      .catch((err) => {
        this._clearTimeoutTimer();
        if (!this._destroyed) {
          this.emit('error', err);
        }
      });
  }

  end(chunk, encoding, callback) {
    if (typeof chunk === 'function') {
      callback = chunk;
      chunk = null;
    } else if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }

    // Process final chunk directly (avoid going through Writable.write
    // after we set ended state)
    if (chunk) {
      if (typeof chunk === 'string') {
        chunk = _encoder.encode(chunk);
      } else if (!(chunk instanceof Uint8Array)) {
        chunk = new Uint8Array(chunk);
      }

      if (this._streamController) {
        // Streaming mode: enqueue the final chunk
        this._streamController.enqueue(chunk);
      } else {
        this._bodyChunks.push(chunk);
        this._bodyLength += chunk.byteLength;
      }
    }

    if (this._ended) return;
    this._ended = true;

    // Update Writable state to prevent further writes
    const wState = this._writableState;
    wState.ended = true;
    wState.finished = true;

    // Bug #7: end() callback fires when request is finished writing, not on response
    if (callback) callback();
    this.emit('finish');

    if (this._fetchStarted) {
      // Streaming mode: close the upload stream to signal body completion
      if (this._streamController) {
        this._streamController.close();
      }
    } else {
      // Buffered mode: build body
      const method = (this._options.method || 'GET').toUpperCase();
      let body = null;

      if (this._bodyChunks.length > 0 && method !== 'GET' && method !== 'HEAD') {
        if (this._bodyChunks.length === 1) {
          body = this._bodyChunks[0];
        } else {
          const totalLen = this._bodyChunks.reduce((s, c) => s + c.byteLength, 0);
          const combined = new Uint8Array(totalLen);
          let offset = 0;
          for (const c of this._bodyChunks) {
            combined.set(c, offset);
            offset += c.byteLength;
          }
          body = combined;
        }
      }

      // ── Route decision: gvisor TCP (all headers) → fetch (forbidden-stripped) ──
      if (_hasBrowsingContext && isGvisorAvailable()) {
        this._doGvisorRequest(body);
        return;
      }

      // Fallback: browser fetch (headers stripped) or Node-native fetch
      const fetchExtra = {};
      if (body && this._bodyChunks.length > 1 && _canStreamUpload()) {
        const chunks = this._bodyChunks;
        body = new ReadableStream({
          start(controller) {
            for (const c of chunks) controller.enqueue(c);
            controller.close();
          },
        });
        fetchExtra.duplex = 'half';
      }

      const url = this._buildUrl();
      const headers = this._buildHeaders();

      const fetchOpts = {
        method,
        headers,
        signal: this._abortController.signal,
        redirect: 'follow',
        ...fetchExtra,
      };
      if (body) fetchOpts.body = body;

      _proxyFetch(url, fetchOpts)
        .then((response) => {
          // Bug #3: Clear timeout timer on successful response
          this._clearTimeoutTimer();
          const msg = new IncomingMessage(response);
          this.emit('response', msg);
        })
        .catch((err) => {
          // Bug #3: Clear timeout timer on error too
          this._clearTimeoutTimer();
          if (!this._destroyed) {
            this.emit('error', err);
          }
        });
    }
  }

  abort() {
    // Bug #6: Emit 'abort' event before setting _destroyed
    this.emit('abort');
    this._aborted = true;
    this._destroyed = true;
    this._clearTimeoutTimer();
    this._abortController.abort();
  }

  destroy(err) {
    this._destroyed = true;
    this._clearTimeoutTimer();
    this._abortController.abort();
    if (err) this.emit('error', err);
    return this;
  }

  setTimeout(ms, callback) {
    if (callback) this.once('timeout', callback);
    // Bug #3: Clear any previous timer before setting a new one
    this._clearTimeoutTimer();
    this._timeoutTimer = setTimeout(() => {
      this._timeoutTimer = null;
      this.emit('timeout');
    }, ms);
    return this;
  }

  _clearTimeoutTimer() {
    if (this._timeoutTimer !== null) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }
  }
}

// ─── Module factories ───────────────────────────────────────────────

function _request(defaultProtocol) {
  return function request(url, options, callback) {
    if (typeof url === 'object' && !(url instanceof URL)) {
      // request(options, callback)
      if (!url.protocol) url.protocol = defaultProtocol;
      return new ClientRequest(url, options, callback);
    }
    const req = new ClientRequest(url, options, callback);
    if (!req._options.protocol) req._options.protocol = defaultProtocol;
    return req;
  };
}

function _get(requestFn) {
  return function get(url, options, callback) {
    const req = requestFn(url, options, callback);
    req.end();
    return req;
  };
}

// ─── Browser-local HTTP server registry ─────────────────────────────
// In the browser runtime we cannot bind a real TCP listener, so createServer()
// registers a localhost-shaped server object in a global registry. Generic
// browser "open external URL" helpers can deliver localhost callback URLs back
// into these registered servers.

function getBrowserLocalServerRegistry() {
  if (!globalThis.__browserRuntimeLocalHttpServers) {
    globalThis.__browserRuntimeLocalHttpServers = {};
  }
  return globalThis.__browserRuntimeLocalHttpServers;
}

function _inTabHttpRelayEnabled() {
  const v = globalThis.process?.env?.NODEJS_IN_TAB_HTTP_RELAY;
  if (v == null || v === '') return false;
  const s = String(v).toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

function _inTabPublicHttpBase() {
  const env = globalThis.process?.env || {};
  if (env.NODEJS_IN_TAB_HTTP_PUBLIC_BASE) {
    return String(env.NODEJS_IN_TAB_HTTP_PUBLIC_BASE).replace(/\/$/, '');
  }
  if (typeof globalThis.location?.origin === 'string') {
    return globalThis.location.origin;
  }
  return 'http://localhost:8080';
}

function _inTabRelayWebSocketUrl(session, port) {
  const env = globalThis.process?.env || {};
  if (env.NODEJS_IN_TAB_HTTP_RELAY_WS) {
    const u = new URL(String(env.NODEJS_IN_TAB_HTTP_RELAY_WS));
    u.searchParams.set('session', session);
    u.searchParams.set('port', String(port));
    return u.toString();
  }
  const loc = globalThis.location;
  if (!loc?.host) return null;
  const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${loc.host}/__in-tab-http-ws?session=${encodeURIComponent(session)}&port=${encodeURIComponent(String(port))}`;
}

function _u8ToBase64(u8) {
  if (!u8.byteLength) return '';
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

class FakeServer extends EventEmitter {
  constructor(requestHandler) {
    super();
    this._handler = requestHandler;
    this._port = 0;
    this._listening = false;
    this._hostname = 'localhost';
    /** @type {string|null} — set when NODEJS_IN_TAB_HTTP_RELAY is enabled */
    this.publicUrl = null;
    /** @type {string|null} */
    this.relaySession = null;
    /** @type {WebSocket|null} */
    this._relayWs = null;
  }

  listen(port, host, callback, backlog) {
    if (port && typeof port === 'object' && typeof port.port === 'number') {
      const opts = port;
      const cb = typeof host === 'function' ? host : callback;
      return this.listen(opts.port, opts.host || opts.hostname, cb);
    }
    if (typeof host === 'function') {
      callback = host;
      host = undefined;
    }
    if (typeof port === 'function') {
      callback = port;
      port = 0;
    }
    if (typeof backlog === 'function' && callback === undefined) {
      callback = backlog;
    }
    if (host) {
      this._hostname = host;
    }
    if (port) {
      this._port = port;
    } else {
      const registry = getBrowserLocalServerRegistry();
      let candidate = 19836;
      while (registry[candidate]) candidate += 1;
      this._port = candidate;
    }
    this._listening = true;

    const registry = getBrowserLocalServerRegistry();
    registry[this._port] = this;

    this._maybeStartHttpRelay();
    this._maybeStartGvisorListener();

    queueMicrotask(() => {
      this.emit('listening');
      if (this.publicUrl) {
        this.emit('relay-ready', {
          publicUrl: this.publicUrl,
          session: this.relaySession,
          port: this._port,
        });
      }
      if (typeof callback === 'function') callback();
    });
    return this;
  }

  _maybeStartHttpRelay() {
    this.publicUrl = null;
    this.relaySession = null;
    if (this._relayWs) {
      try { this._relayWs.close(); } catch { /* ignore */ }
      this._relayWs = null;
    }
    if (!(_inTabHttpRelayEnabled() && _hasBrowsingContext)) {
      return;
    }
    let session = globalThis.process?.env?.NODEJS_IN_TAB_HTTP_RELAY_SESSION;
    if (!session || !String(session).trim()) {
      session = globalThis.crypto?.randomUUID?.() || `s${Date.now().toString(36)}`;
    }
    this.relaySession = String(session);
    const base = _inTabPublicHttpBase();
    this.publicUrl = `${base}/__in-tab-http/${encodeURIComponent(this.relaySession)}/${this._port}/`;

    const wsUrl = _inTabRelayWebSocketUrl(this.relaySession, this._port);
    if (!wsUrl) {
      return;
    }
    const NativeWS = globalThis.__browserRuntimeNativeWebSocket || globalThis.WebSocket;
    if (typeof NativeWS !== 'function') {
      return;
    }

    try {
      const ws = new NativeWS(wsUrl);
      this._relayWs = ws;
      ws.onmessage = (ev) => {
        let msg;
        try {
          const text = typeof ev.data === 'string' ? ev.data : _decoder.decode(ev.data);
          msg = JSON.parse(text);
        } catch {
          return;
        }
        if (msg.type !== 'request' || !msg.id) return;
        queueMicrotask(() => {
          this._handleRelayHttpRequest(msg).catch((err) => {
            this._sendRelayHttpResponse(msg.id, { ok: false, error: String(err?.message || err) });
          });
        });
      };
      ws.onclose = () => {
        if (this._relayWs === ws) this._relayWs = null;
      };
    } catch {
      this._relayWs = null;
    }
  }

  /** @type {import('./gvisor-net.js').GvisorServer|null} */
  _gvisorTcp = null;

  _maybeStartGvisorListener() {
    if (!isGvisorAvailable()) return;
    try {
      this._gvisorTcp = new _GvisorTcpServer();
      this._gvisorTcp.on('connection', (socket) => this._handleGvisorTcpConn(socket));
      this._gvisorTcp.listen(this._port);
    } catch {
      // Clean up: remove from stack listeners so orphaned entries don't swallow connections
      if (this._gvisorTcp) {
        try { this._gvisorTcp.close(); } catch {}
        this._gvisorTcp = null;
      }
    }
  }

  _handleGvisorTcpConn(socket) {
    let buf = new Uint8Array(0);
    const onData = (chunk) => {
      const c = chunk instanceof Uint8Array ? chunk
        : (chunk instanceof ArrayBuffer ? new Uint8Array(chunk)
        : _encoder.encode(String(chunk)));
      const nb = new Uint8Array(buf.length + c.length);
      nb.set(buf); nb.set(c, buf.length);
      buf = nb;

      const str = _decoder.decode(buf);
      const idx = str.indexOf('\r\n\r\n');
      if (idx === -1) return;

      socket.removeListener('data', onData);
      const lines = str.slice(0, idx).split('\r\n');
      const parts = lines[0].split(' ');
      const method = parts[0];
      const url = parts[1] || '/';
      const headers = {};
      for (let i = 1; i < lines.length; i++) {
        const colon = lines[i].indexOf(':');
        if (colon > 0) {
          headers[lines[i].slice(0, colon).toLowerCase().trim()] = lines[i].slice(colon + 1).trim();
        }
      }

      const bodyStr = str.slice(idx + 4);
      let bodyU8 = null;
      if (bodyStr.length) bodyU8 = _encoder.encode(bodyStr);

      const req = new ServerIncomingMessage({
        method, url, host: headers.host || `localhost:${this._port}`, headers, body: bodyU8,
      });
      const res = new ServerResponse();

      res.once('finish', () => {
        const chunks = res._bodyChunks || [];
        let body = new Uint8Array(0);
        if (chunks.length === 1) body = chunks[0];
        else if (chunks.length > 1) {
          const total = chunks.reduce((s, c) => s + c.byteLength, 0);
          body = new Uint8Array(total);
          let o = 0;
          for (const c of chunks) { body.set(c, o); o += c.byteLength; }
        }
        const hdr = { ...res.getHeaders() };
        if (!hdr['content-length']) hdr['content-length'] = String(body.byteLength);
        let head = `HTTP/1.1 ${res.statusCode} ${res.statusMessage || 'OK'}\r\n`;
        for (const [k, v] of Object.entries(hdr)) head += `${k}: ${v}\r\n`;
        head += '\r\n';
        socket.write(head);
        if (body.byteLength) socket.write(body);
        socket.end();
      });

      if (this._handler) this._handler(req, res);
      this.emit('request', req, res);
    };
    socket.on('data', onData);
  }

  _sendRelayHttpResponse(id, fields) {
    const socket = this._relayWs;
    if (!socket || socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify({ v: 1, type: 'response', id, ...fields }));
    } catch { /* ignore */ }
  }

  async _handleRelayHttpRequest(msg) {
    const headers = msg.headers && typeof msg.headers === 'object' ? msg.headers : {};
    const host = headers.host || `${this._hostname}:${this._port}`;
    let bodyU8 = null;
    if (msg.body64 && typeof msg.body64 === 'string') {
      try {
        const bin = atob(msg.body64);
        bodyU8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bodyU8[i] = bin.charCodeAt(i);
      } catch {
        bodyU8 = null;
      }
    }
    const req = new ServerIncomingMessage({
      method: msg.method || 'GET',
      url: msg.url || '/',
      host,
      headers,
      body: bodyU8 && bodyU8.byteLength ? bodyU8 : null,
    });
    const res = new ServerResponse();
    const done = new Promise((resolve) => {
      res.once('finish', resolve);
    });
    try {
      if (this._handler) {
        this._handler(req, res);
      }
      this.emit('request', req, res);
    } catch (err) {
      this._sendRelayHttpResponse(msg.id, { ok: false, error: String(err?.message || err) });
      return;
    }
    await done;
    const chunks = res._bodyChunks || [];
    let bodyOut = new Uint8Array(0);
    if (chunks.length === 1) bodyOut = chunks[0];
    else if (chunks.length > 1) {
      const total = chunks.reduce((s, c) => s + c.byteLength, 0);
      bodyOut = new Uint8Array(total);
      let o = 0;
      for (const c of chunks) {
        bodyOut.set(c, o);
        o += c.byteLength;
      }
    }
    const outHeaders = { ...res.getHeaders() };
    this._sendRelayHttpResponse(msg.id, {
      ok: true,
      statusCode: res.statusCode,
      statusMessage: res.statusMessage,
      headers: outHeaders,
      body64: bodyOut.byteLength ? _u8ToBase64(bodyOut) : undefined,
    });
  }

  address() {
    return {
      address: '127.0.0.1',
      family: 'IPv4',
      port: this._port,
    };
  }

  close(cb) {
    this._listening = false;
    const registry = getBrowserLocalServerRegistry();
    delete registry[this._port];
    if (this._gvisorTcp) {
      try { this._gvisorTcp.close(); } catch { /* ignore */ }
      this._gvisorTcp = null;
    }
    if (typeof cb === 'function') queueMicrotask(cb);
    queueMicrotask(() => this.emit('close'));
    return this;
  }

  ref() { return this; }
  unref() { return this; }

  /**
   * Invoked by browser integration when a redirect to this fake localhost
   * port is received (OAuth code capture).
   */
  _handleRedirect(url) {
    const parsed = new URL(url);
    const hostHeader = `${this._hostname}:${this._port}`;
    const req = new ServerIncomingMessage({
      method: 'GET',
      url: parsed.pathname + parsed.search,
      host: hostHeader,
    });
    const res = new ServerResponse();

    if (this._handler) {
      this._handler(req, res);
    }
    this.emit('request', req, res);
  }
}

// ─── http module ────────────────────────────────────────────────────

const httpRequest = _request('http:');
const httpGet = _get(httpRequest);

// Bug #17: Complete STATUS_CODES table
export const http = {
  request: httpRequest,
  get: httpGet,
  WebSocket: globalThis.WebSocket,
  MessageEvent: globalThis.MessageEvent,
  CloseEvent: globalThis.CloseEvent,
  createServer(handler) {
    return new FakeServer(handler);
  },
  Server: FakeServer,
  Agent: class Agent extends EventEmitter { constructor(opts) { super(); this.options = opts || {}; this.maxSockets = this.options.maxSockets || Infinity; this.maxFreeSockets = this.options.maxFreeSockets || 256; this.maxTotalSockets = this.options.maxTotalSockets || Infinity; this.keepAlive = this.options.keepAlive || false; this.maxCachedSessions = this.options.maxCachedSessions || 100; this.requests = {}; this.sockets = {}; this.freeSockets = {}; this.totalSocketCount = 0; } destroy() {} getName() { return 'localhost'; } createConnection() {} addRequest() {} },
  globalAgent: new (class extends EventEmitter { constructor() { super(); this.options = { ca: [], keepAlive: false }; this.maxSockets = Infinity; this.maxFreeSockets = 256; this.maxTotalSockets = Infinity; this.keepAlive = false; this.maxCachedSessions = 100; this.requests = {}; this.sockets = {}; this.freeSockets = {}; this.totalSocketCount = 0; } destroy() {} getName() { return 'localhost'; } createConnection() {} addRequest() {} })(),
  ClientRequest,
  IncomingMessage,
  OutgoingMessage,
  ServerResponse,
  maxHeaderSize: 16384,
  validateHeaderName(name) {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new TypeError('Header name must be a non-empty string');
    }
  },
  validateHeaderValue(_name, value) {
    if (value === undefined || value === null) {
      throw new TypeError('Header value must be defined');
    }
  },
  setMaxIdleHTTPParsers() {},
  METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS',
    'CONNECT', 'TRACE'],
  STATUS_CODES: {
    100: 'Continue', 101: 'Switching Protocols', 102: 'Processing',
    200: 'OK', 201: 'Created', 202: 'Accepted', 203: 'Non-Authoritative Information',
    204: 'No Content', 205: 'Reset Content', 206: 'Partial Content',
    300: 'Multiple Choices', 301: 'Moved Permanently', 302: 'Found',
    303: 'See Other', 304: 'Not Modified', 307: 'Temporary Redirect',
    308: 'Permanent Redirect',
    400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required',
    403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed',
    406: 'Not Acceptable', 407: 'Proxy Authentication Required',
    408: 'Request Timeout', 409: 'Conflict', 410: 'Gone',
    411: 'Length Required', 412: 'Precondition Failed',
    413: 'Payload Too Large', 414: 'URI Too Long',
    415: 'Unsupported Media Type', 416: 'Range Not Satisfiable',
    417: 'Expectation Failed', 418: "I'm a Teapot",
    422: 'Unprocessable Entity', 425: 'Too Early',
    426: 'Upgrade Required', 428: 'Precondition Required',
    429: 'Too Many Requests', 431: 'Request Header Fields Too Large',
    451: 'Unavailable For Legal Reasons',
    500: 'Internal Server Error', 501: 'Not Implemented',
    502: 'Bad Gateway', 503: 'Service Unavailable',
    504: 'Gateway Timeout', 505: 'HTTP Version Not Supported',
    507: 'Insufficient Storage', 511: 'Network Authentication Required',
  },
};

// ─── https module ───────────────────────────────────────────────────

const httpsRequest = _request('https:');
const httpsGet = _get(httpsRequest);

export const https = {
  request: httpsRequest,
  get: httpsGet,
  WebSocket: globalThis.WebSocket,
  MessageEvent: globalThis.MessageEvent,
  CloseEvent: globalThis.CloseEvent,
  createServer(handler) {
    return new FakeServer(handler);
  },
  Server: FakeServer,
  Agent: class Agent extends EventEmitter { constructor(opts) { super(); this.options = opts || {}; this.maxSockets = this.options.maxSockets || Infinity; this.maxFreeSockets = this.options.maxFreeSockets || 256; this.maxTotalSockets = this.options.maxTotalSockets || Infinity; this.keepAlive = this.options.keepAlive || false; this.maxCachedSessions = this.options.maxCachedSessions || 100; this.requests = {}; this.sockets = {}; this.freeSockets = {}; this.totalSocketCount = 0; } destroy() {} getName() { return 'localhost'; } createConnection() {} addRequest() {} },
  globalAgent: new (class extends EventEmitter { constructor() { super(); this.options = { ca: [], keepAlive: false }; this.maxSockets = Infinity; this.maxFreeSockets = 256; this.maxTotalSockets = Infinity; this.keepAlive = false; this.maxCachedSessions = 100; this.requests = {}; this.sockets = {}; this.freeSockets = {}; this.totalSocketCount = 0; } destroy() {} getName() { return 'localhost'; } createConnection() {} addRequest() {} })(),
  ClientRequest,
  IncomingMessage,
  OutgoingMessage,
  ServerResponse,
  maxHeaderSize: 16384,
  validateHeaderName: http.validateHeaderName,
  validateHeaderValue: http.validateHeaderValue,
  setMaxIdleHTTPParsers: http.setMaxIdleHTTPParsers,
};

export default { http, https };
