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

const _encoder = new TextEncoder();
const _decoder = new TextDecoder('utf-8');

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

async function _proxyFetch(url, opts) {
  if (!_isNode) return fetch(url, opts);

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
      // Exclude content-length — fetch handles it
      if (lk === 'content-length') continue;
      headers[lk] = String(val);
    }
    return headers;
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
      // Buffered mode: build body and fire fetch
      const method = (this._options.method || 'GET').toUpperCase();
      let body = null;
      const fetchExtra = {};

      if (this._bodyChunks.length > 0 && method !== 'GET' && method !== 'HEAD') {
        if (this._bodyChunks.length === 1) {
          // Single chunk — zero-copy, pass directly
          body = this._bodyChunks[0];
        } else if (_canStreamUpload()) {
          // Multiple chunks + streaming supported — yield chunks via ReadableStream
          // to avoid concatenation copy
          const chunks = this._bodyChunks;
          body = new ReadableStream({
            start(controller) {
              for (const c of chunks) controller.enqueue(c);
              controller.close();
            },
          });
          fetchExtra.duplex = 'half';
        } else {
          // Fallback: concatenate into one buffer
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

// ─── http module ────────────────────────────────────────────────────

const httpRequest = _request('http:');
const httpGet = _get(httpRequest);

// Bug #17: Complete STATUS_CODES table
export const http = {
  request: httpRequest,
  get: httpGet,
  createServer() {
    throw new Error('http.createServer() is not available in browser — use a service worker or external proxy');
  },
  Agent: class Agent extends EventEmitter { constructor(opts) { super(); this.options = opts || {}; this.maxSockets = this.options.maxSockets || Infinity; this.maxFreeSockets = this.options.maxFreeSockets || 256; this.maxTotalSockets = this.options.maxTotalSockets || Infinity; this.keepAlive = this.options.keepAlive || false; this.maxCachedSessions = this.options.maxCachedSessions || 100; this.requests = {}; this.sockets = {}; this.freeSockets = {}; this.totalSocketCount = 0; } destroy() {} getName() { return 'localhost'; } createConnection() {} addRequest() {} },
  globalAgent: new (class extends EventEmitter { constructor() { super(); this.options = { ca: [], keepAlive: false }; this.maxSockets = Infinity; this.maxFreeSockets = 256; this.maxTotalSockets = Infinity; this.keepAlive = false; this.maxCachedSessions = 100; this.requests = {}; this.sockets = {}; this.freeSockets = {}; this.totalSocketCount = 0; } destroy() {} getName() { return 'localhost'; } createConnection() {} addRequest() {} })(),
  ClientRequest,
  IncomingMessage,
  ServerResponse: class ServerResponse {},
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
  createServer() {
    throw new Error('https.createServer() is not available in browser');
  },
  Agent: class Agent extends EventEmitter { constructor(opts) { super(); this.options = opts || {}; this.maxSockets = this.options.maxSockets || Infinity; this.maxFreeSockets = this.options.maxFreeSockets || 256; this.maxTotalSockets = this.options.maxTotalSockets || Infinity; this.keepAlive = this.options.keepAlive || false; this.maxCachedSessions = this.options.maxCachedSessions || 100; this.requests = {}; this.sockets = {}; this.freeSockets = {}; this.totalSocketCount = 0; } destroy() {} getName() { return 'localhost'; } createConnection() {} addRequest() {} },
  globalAgent: new (class extends EventEmitter { constructor() { super(); this.options = { ca: [], keepAlive: false }; this.maxSockets = Infinity; this.maxFreeSockets = 256; this.maxTotalSockets = Infinity; this.keepAlive = false; this.maxCachedSessions = 100; this.requests = {}; this.sockets = {}; this.freeSockets = {}; this.totalSocketCount = 0; } destroy() {} getName() { return 'localhost'; } createConnection() {} addRequest() {} })(),
  ClientRequest,
  IncomingMessage,
  ServerResponse: class ServerResponse {},
};

export default { http, https };
