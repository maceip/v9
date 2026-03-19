/**
 * http/https — Node.js-compatible HTTP client via browser fetch().
 *
 * ClientRequest (Writable) accumulates body, fires fetch() on end().
 * IncomingMessage (Readable) wraps the Response, streams body chunks.
 */

import { EventEmitter } from './eventemitter.js';
import { Readable, Writable } from './streams.js';

const _encoder = new TextEncoder();
const _decoder = new TextDecoder('utf-8');

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
        // Build a Response-like object
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) v.forEach(val => headers.append(k, val));
          else if (v !== undefined) headers.set(k, v);
        }

        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          const response = new Response(body, {
            status: res.statusCode,
            statusText: res.statusMessage,
            headers,
          });
          resolve(response);
        });
        res.on('error', reject);
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

    // Lowercase all header keys (Node.js convention)
    response.headers.forEach((value, key) => {
      const lk = key.toLowerCase();
      this.headers[lk] = value;
      this.rawHeaders.push(key, value);
    });

    this._response = response;
    this._started = false;
  }

  _read() {
    if (this._started) return;
    this._started = true;

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
      const reader = body.getReader();
      const pump = () => {
        reader.read().then(({ done, value }) => {
          if (done) {
            this.push(null);
            return;
          }
          this.push(new Uint8Array(value));
          pump();
        }).catch((err) => {
          this.destroy(err);
        });
      };
      pump();
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
}

// ─── ClientRequest ──────────────────────────────────────────────────

class ClientRequest extends EventEmitter {
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

    this._headers = {};
    this._headerNames = {}; // lowercased → original case
    this._bodyChunks = [];
    this._ended = false;
    this._abortController = new AbortController();
    this._timeout = null;
    this._destroyed = false;

    // Apply headers from options
    if (this._options.headers) {
      for (const [k, v] of Object.entries(this._options.headers)) {
        this.setHeader(k, v);
      }
    }
  }

  setHeader(name, value) {
    const lk = name.toLowerCase();
    this._headers[lk] = value;
    this._headerNames[lk] = name;
  }

  getHeader(name) {
    return this._headers[name.toLowerCase()];
  }

  removeHeader(name) {
    const lk = name.toLowerCase();
    delete this._headers[lk];
    delete this._headerNames[lk];
  }

  write(chunk, encoding, callback) {
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }
    if (typeof chunk === 'string') {
      this._bodyChunks.push(_encoder.encode(chunk));
    } else if (chunk) {
      this._bodyChunks.push(new Uint8Array(chunk));
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

    if (callback) this.once('response', callback);

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
    if (this._bodyChunks.length > 0 && method !== 'GET' && method !== 'HEAD') {
      const totalLen = this._bodyChunks.reduce((s, c) => s + c.byteLength, 0);
      const combined = new Uint8Array(totalLen);
      let offset = 0;
      for (const c of this._bodyChunks) {
        combined.set(c, offset);
        offset += c.byteLength;
      }
      body = combined;
    }

    // Build headers (exclude content-length — fetch handles it)
    const headers = {};
    for (const [lk, val] of Object.entries(this._headers)) {
      if (lk === 'content-length') continue;
      headers[lk] = String(val);
    }

    // Fire fetch
    const fetchOpts = {
      method,
      headers,
      signal: this._abortController.signal,
      redirect: 'follow',
    };
    if (body) fetchOpts.body = body;

    _proxyFetch(url, fetchOpts)
      .then((response) => {
        const msg = new IncomingMessage(response);
        this.emit('response', msg);
      })
      .catch((err) => {
        if (!this._destroyed) {
          this.emit('error', err);
        }
      });
  }

  abort() {
    this._destroyed = true;
    this._abortController.abort();
  }

  destroy(err) {
    this._destroyed = true;
    this._abortController.abort();
    if (err) this.emit('error', err);
    return this;
  }

  setTimeout(ms, callback) {
    if (callback) this.once('timeout', callback);
    this._timeout = setTimeout(() => {
      this.emit('timeout');
    }, ms);
    return this;
  }

  get on() {
    return super.on.bind(this);
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

export const http = {
  request: httpRequest,
  get: httpGet,
  Agent: class Agent {},
  globalAgent: {},
  ClientRequest,
  IncomingMessage,
  METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
  STATUS_CODES: {
    200: 'OK', 201: 'Created', 204: 'No Content',
    301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
    404: 'Not Found', 405: 'Method Not Allowed',
    500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable',
  },
};

// ─── https module ───────────────────────────────────────────────────

const httpsRequest = _request('https:');
const httpsGet = _get(httpsRequest);

export const https = {
  request: httpsRequest,
  get: httpsGet,
  Agent: class Agent {},
  globalAgent: {},
  ClientRequest,
  IncomingMessage,
};

export default { http, https };
