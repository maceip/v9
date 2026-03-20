/**
 * http/https — Node.js-compatible HTTP client via browser fetch().
 *
 * ClientRequest (Writable-like) accumulates body, fires fetch() on end().
 * IncomingMessage (Readable) wraps the Response, streams body chunks.
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

        // Bug #10: Stream the response instead of buffering everything
        // Create a ReadableStream that pipes from the Node.js response
        const readable = new ReadableStream({
          start(controller) {
            res.on('data', (chunk) => {
              controller.enqueue(new Uint8Array(chunk));
            });
            res.on('end', () => {
              controller.close();
            });
            res.on('error', (err) => {
              controller.error(err);
            });
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

      if (opts?.body) {
        req.write(opts.body);
      }
      req.end();
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
// Bug #16: Extend Writable so ClientRequest supports pipe-into and emits 'finish'

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
    this._ended = false;
    this._abortController = new AbortController();
    this._timeoutTimer = null;
    this._destroyed = false;
    this._aborted = false;

    // Apply headers from options
    if (this._options.headers) {
      for (const [k, v] of Object.entries(this._options.headers)) {
        this.setHeader(k, v);
      }
    }
  }

  // Override Writable._write to accumulate body chunks
  _write(chunk, encoding, callback) {
    if (typeof chunk === 'string') {
      this._bodyChunks.push(_encoder.encode(chunk));
    } else if (chunk) {
      this._bodyChunks.push((chunk instanceof Uint8Array) ? chunk : new Uint8Array(chunk));
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

  // Legacy write() — also accepted directly (in addition to Writable.write)
  write(chunk, encoding, callback) {
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }
    if (typeof chunk === 'string') {
      this._bodyChunks.push(_encoder.encode(chunk));
    } else if (chunk) {
      this._bodyChunks.push((chunk instanceof Uint8Array) ? chunk : new Uint8Array(chunk));
    }
    if (callback) callback();
    return true;
  }

  end(chunk, encoding, callback) {
    if (typeof chunk === 'function') {
      callback = chunk;
      chunk = null;
    } else if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }

    if (chunk) {
      this.write(chunk, encoding);
    }

    if (this._ended) return;
    this._ended = true;

    // Bug #7: end() callback fires when request is finished writing, not on response
    // Fire callback and 'finish' event after body is sent, before waiting for response
    const endCallback = callback;

    // Build fetch URL
    const opts = this._options;
    const protocol = opts.protocol || 'http:';
    const hostname = opts.hostname || opts.host || 'localhost';
    const port = opts.port;
    const path = opts.path || '/';
    let url;

    if (opts.href && (opts.href.startsWith('http://') || opts.href.startsWith('https://'))) {
      url = opts.href;
    } else {
      const portSuffix = port && port !== '80' && port !== '443' ? `:${port}` : '';
      url = `${protocol}//${hostname}${portSuffix}${path}`;
    }

    // Build body
    let body = null;
    const method = (opts.method || 'GET').toUpperCase();
    const fetchExtra = {}; // extra fetch options (e.g., duplex)
    if (this._bodyChunks.length > 0 && method !== 'GET' && method !== 'HEAD') {
      if (this._bodyChunks.length === 1) {
        // Single chunk — zero-copy, pass directly
        body = this._bodyChunks[0];
      } else {
        // Multiple chunks — concatenate into one buffer
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

    // Build headers (exclude content-length — fetch handles it)
    const headers = {};
    for (const [lk, val] of Object.entries(this._reqHeaders)) {
      if (lk === 'content-length') continue;
      headers[lk] = String(val);
    }

    // Fire 'finish' and end callback NOW (body is ready to send)
    if (endCallback) endCallback();
    this.emit('finish');

    // Fire fetch
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
  globalAgent: new (class extends EventEmitter { constructor() { super(); this.maxSockets = Infinity; this.maxFreeSockets = 256; this.keepAlive = false; this.maxCachedSessions = 100; this.requests = {}; this.sockets = {}; this.freeSockets = {}; } destroy() {} getName() { return 'localhost'; } })(),
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
  globalAgent: new (class extends EventEmitter { constructor() { super(); this.maxSockets = Infinity; this.maxFreeSockets = 256; this.keepAlive = false; this.maxCachedSessions = 100; this.requests = {}; this.sockets = {}; this.freeSockets = {}; } destroy() {} getName() { return 'localhost'; } })(),
  ClientRequest,
  IncomingMessage,
  ServerResponse: class ServerResponse {},
};

export default { http, https };
