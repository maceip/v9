/**
 * Browser-native implementations of Node.js built-in modules.
 *
 * EdgeJS compiles ~46 Node.js built-in modules to Wasm. Some of these
 * can be partially or fully replaced with browser-native APIs for
 * better performance and smaller Wasm size.
 *
 * This module provides the browser-side implementations that get
 * injected into EdgeJS's module resolution.
 */

import { EventEmitter } from './eventemitter.js';
import { Readable, Writable, Duplex, Transform, PassThrough, pipeline, finished } from './streams.js';
import util from './util.js';

/**
 * crypto — Web Crypto API bridge
 *
 * Node's crypto module uses OpenSSL compiled to Wasm.
 * For common operations, we can use the browser's Web Crypto API instead.
 */
export const cryptoBridge = {
  randomBytes(size) {
    const buf = new Uint8Array(size);
    crypto.getRandomValues(buf);
    return buf;
  },

  randomUUID() {
    return crypto.randomUUID();
  },

  async createHash(algorithm) {
    const algoMap = {
      'sha1': 'SHA-1',
      'sha256': 'SHA-256',
      'sha384': 'SHA-384',
      'sha512': 'SHA-512',
    };
    const webAlgo = algoMap[algorithm.toLowerCase()];
    if (!webAlgo) return null; // Fall back to Wasm OpenSSL

    let chunks = [];
    return {
      update(data) {
        if (typeof data === 'string') {
          data = new TextEncoder().encode(data);
        }
        chunks.push(data);
        return this;
      },
      async digest(encoding) {
        const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
        const combined = new Uint8Array(totalLen);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        const hashBuffer = await crypto.subtle.digest(webAlgo, combined);
        const hashArray = new Uint8Array(hashBuffer);

        if (encoding === 'hex') {
          return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        if (encoding === 'base64') {
          return btoa(String.fromCharCode(...hashArray));
        }
        return hashBuffer;
      }
    };
  },
};

/**
 * path — Pure JS (no Wasm needed)
 *
 * Node's path module is pure JS anyway, but EdgeJS compiles it.
 * We can provide it directly to avoid Wasm overhead.
 */
export const pathBridge = {
  sep: '/',
  delimiter: ':',

  join(...parts) {
    return this.normalize(parts.filter(Boolean).join('/'));
  },

  normalize(p) {
    const parts = p.split('/').filter(Boolean);
    const result = [];
    for (const part of parts) {
      if (part === '..') result.pop();
      else if (part !== '.') result.push(part);
    }
    return (p.startsWith('/') ? '/' : '') + result.join('/');
  },

  resolve(...parts) {
    let resolved = '';
    for (let i = parts.length - 1; i >= 0; i--) {
      resolved = parts[i] + '/' + resolved;
      if (parts[i].startsWith('/')) break;
    }
    // If no absolute anchor was found, prepend '/' (our cwd is always '/')
    if (!resolved.startsWith('/')) {
      resolved = '/' + resolved;
    }
    return this.normalize(resolved);
  },

  dirname(p) {
    const idx = p.lastIndexOf('/');
    return idx === -1 ? '.' : p.substring(0, idx) || '/';
  },

  basename(p, ext) {
    let base = p.substring(p.lastIndexOf('/') + 1);
    if (ext && base.endsWith(ext)) {
      base = base.substring(0, base.length - ext.length);
    }
    return base;
  },

  extname(p) {
    const base = this.basename(p);
    const idx = base.lastIndexOf('.');
    return idx <= 0 ? '' : base.substring(idx);
  },

  isAbsolute(p) {
    return p.startsWith('/');
  },

  relative(from, to) {
    const fromParts = this.resolve(from).split('/').filter(Boolean);
    const toParts = this.resolve(to).split('/').filter(Boolean);
    let common = 0;
    while (common < fromParts.length && common < toParts.length &&
           fromParts[common] === toParts[common]) {
      common++;
    }
    const ups = fromParts.length - common;
    return [...Array(ups).fill('..'), ...toParts.slice(common)].join('/');
  },

  parse(p) {
    return {
      root: p.startsWith('/') ? '/' : '',
      dir: this.dirname(p),
      base: this.basename(p),
      ext: this.extname(p),
      name: this.basename(p, this.extname(p)),
    };
  },

  format(obj) {
    const dir = obj.dir || obj.root || '';
    const base = obj.base || (obj.name || '') + (obj.ext || '');
    return dir ? dir + '/' + base : base;
  },
};

// path.posix is an alias to pathBridge itself (we only support POSIX paths)
pathBridge.posix = pathBridge;
// path.win32 stub — not supported but some code references it
pathBridge.win32 = pathBridge;

/**
 * url — URL API bridge
 *
 * Modern browsers have URL and URLSearchParams natively.
 */
export const urlBridge = {
  URL: globalThis.URL,
  URLSearchParams: globalThis.URLSearchParams,

  parse(urlString) {
    try {
      return new URL(urlString);
    } catch {
      return null;
    }
  },

  format(urlObj) {
    if (urlObj instanceof URL) return urlObj.toString();
    const { protocol, hostname, port, pathname, search, hash } = urlObj;
    let result = '';
    if (protocol) result += protocol + '//';
    if (hostname) result += hostname;
    if (port) result += ':' + port;
    result += pathname || '/';
    if (search) result += search;
    if (hash) result += hash;
    return result;
  },

  fileURLToPath(url) {
    let u;
    if (typeof url === 'string') {
      u = new URL(url);
    } else if (url instanceof URL) {
      u = url;
    } else {
      throw new TypeError('The "url" argument must be of type string or an instance of URL. Received ' + typeof url);
    }
    if (u.protocol !== 'file:') {
      throw new TypeError('The URL must be of scheme file');
    }
    if (u.hostname !== '' && u.hostname !== 'localhost') {
      throw new TypeError(`File URL host must be "localhost" or empty on the current platform`);
    }
    // Decode percent-encoded characters in the pathname
    return decodeURIComponent(u.pathname);
  },

  pathToFileURL(path) {
    if (typeof path !== 'string') {
      throw new TypeError('The "path" argument must be of type string. Received ' + typeof path);
    }
    // Resolve to absolute if needed
    let resolved = path;
    if (!path.startsWith('/')) {
      resolved = '/' + path;
    }
    // Encode special characters but preserve /
    const encoded = resolved.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return new URL('file://' + encoded);
  },
};

/**
 * process — Full process object with EventEmitter, streams, and correct nextTick.
 *
 * MUST NOT use queueMicrotask for nextTick — wrong ordering relative to Promises.
 * nextTick must fire BEFORE Promise.then callbacks.
 */

// Dedicated nextTick queue that drains before Promise microtasks.
// We use a MessageChannel trick: postMessage fires a macrotask, but we drain
// the nextTick queue at the START of each microtask checkpoint via a
// resolved-promise .then that we schedule FIRST.
const _nextTickQueue = [];
let _nextTickDraining = false;

function _drainNextTick() {
  _nextTickDraining = true;
  while (_nextTickQueue.length > 0) {
    const entry = _nextTickQueue.shift();
    entry.fn.apply(null, entry.args);
  }
  _nextTickDraining = false;
}

function _scheduleNextTickDrain() {
  // Resolved promise .then fires as a microtask — we schedule it once
  // so the queue drains before any later .then callbacks in user code.
  Promise.resolve().then(_drainNextTick);
}

// Build process as an EventEmitter
class Process extends EventEmitter {
  constructor() {
    super();

    this.platform = 'browser';
    this.arch = 'wasm32';
    this.version = 'v20.0.0-edgejs';
    this.versions = {
      node: '20.0.0',
      v8: 'browser-native',
      edgejs: '0.1.0',
    };
    // Proxy coerces all values to strings on set (Node.js contract)
    this.env = new Proxy({}, {
      set(target, key, value) {
        target[key] = String(value);
        return true;
      },
    });
    this.argv = ['node', 'script.js'];
    this.pid = 1;
    this.ppid = 0;
    this.title = 'edgejs';
    this.exitCode = 0;

    this._cwd = '/';

    // stdout — Writable stream that logs to console
    this.stdout = new Writable({
      write(chunk, encoding, callback) {
        const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        // Use process.stdout.write — console.log adds newline, we don't
        if (typeof globalThis.postMessage === 'function' && typeof globalThis.document === 'undefined') {
          // Worker context
          console.log(str);
        } else {
          console.log(str);
        }
        callback();
      },
    });
    this.stdout.isTTY = false;

    // stderr — Writable stream that logs to console.error
    this.stderr = new Writable({
      write(chunk, encoding, callback) {
        const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        console.error(str);
        callback();
      },
    });
    this.stderr.isTTY = false;

    // stdin — Readable stream (no data by default in browser)
    this.stdin = new Readable({
      read() {
        // No data available in browser environment
      },
    });
    this.stdin.isTTY = false;

    this.hrtime = Object.assign(
      function hrtime(prev) {
        const now = performance.now();
        const sec = Math.floor(now / 1000);
        const nsec = Math.round((now % 1000) * 1_000_000);
        if (prev) {
          let ds = sec - prev[0];
          let dns = nsec - prev[1];
          if (dns < 0) { ds--; dns += 1_000_000_000; }
          return [ds, dns];
        }
        return [sec, nsec];
      },
      {
        bigint() {
          return BigInt(Math.round(performance.now() * 1_000_000));
        },
      }
    );
  }

  cwd() {
    return this._cwd;
  }

  chdir(dir) {
    if (typeof dir !== 'string') {
      throw new TypeError('The "directory" argument must be of type string');
    }
    this._cwd = dir;
  }

  exit(code) {
    if (code !== undefined) this.exitCode = code;
    this.emit('exit', this.exitCode);
  }

  nextTick(fn, ...args) {
    if (typeof fn !== 'function') {
      throw new TypeError('Callback must be a function');
    }
    _nextTickQueue.push({ fn, args });
    if (!_nextTickDraining) {
      _scheduleNextTickDrain();
    }
  }

  emitWarning(warning, type, code) {
    if (typeof warning === 'string') {
      const err = new Error(warning);
      err.name = type || 'Warning';
      if (code) err.code = code;
      warning = err;
    }
    this.emit('warning', warning);
  }

  // Compatibility stubs
  umask() { return 0o022; }
  uptime() { return performance.now() / 1000; }
  memoryUsage() {
    return {
      rss: 0,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    };
  }
  cpuUsage() {
    return { user: 0, system: 0 };
  }
}

export const processBridge = new Process();

/**
 * Buffer — Uint8Array subclass for browser (Node.js compatible).
 *
 * MUST be instanceof Uint8Array.
 * MUST support all 7 encodings: utf8, base64, hex, ascii, latin1, binary, base64url.
 * MUST share memory for Buffer.from(arrayBuffer, offset, length) — NOT copy.
 * slice() MUST share memory (like subarray).
 */

const _encoder = new TextEncoder();
const _decoder = new TextDecoder('utf-8');

// Encoding helpers
function _encodeString(str, encoding) {
  switch (encoding) {
    case 'utf8': case 'utf-8': case undefined: case null:
      return _encoder.encode(str);
    case 'ascii':
    case 'latin1':
    case 'binary': {
      const buf = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i) & 0xff;
      return buf;
    }
    case 'base64': {
      const binary = atob(str);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
      return buf;
    }
    case 'base64url': {
      let s = str.replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      const binary = atob(s);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
      return buf;
    }
    case 'hex': {
      const len = str.length >>> 1;
      const buf = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        buf[i] = parseInt(str.substr(i * 2, 2), 16);
      }
      return buf;
    }
    default:
      return _encoder.encode(str);
  }
}

function _decodeBuffer(buf, encoding, start, end) {
  const view = buf.subarray(start || 0, end !== undefined ? end : buf.length);
  switch (encoding) {
    case 'utf8': case 'utf-8': case undefined: case null:
      return _decoder.decode(view);
    case 'ascii': {
      let s = '';
      for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i] & 0x7f);
      return s;
    }
    case 'latin1':
    case 'binary': {
      let s = '';
      for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i]);
      return s;
    }
    case 'base64': {
      let s = '';
      for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i]);
      return btoa(s);
    }
    case 'base64url': {
      let s = '';
      for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i]);
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    case 'hex': {
      let s = '';
      for (let i = 0; i < view.length; i++) s += view[i].toString(16).padStart(2, '0');
      return s;
    }
    default:
      return _decoder.decode(view);
  }
}

class Buffer extends Uint8Array {
  // Buffer.from() — CRITICAL: arrayBuffer variant MUST share memory
  static from(data, encodingOrOffset, length) {
    if (typeof data === 'string') {
      const encoded = _encodeString(data, encodingOrOffset);
      const buf = new Buffer(encoded.length);
      buf.set(encoded);
      return buf;
    }
    if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) {
      // SHARED MEMORY — view into the same ArrayBuffer, NOT a copy
      const offset = encodingOrOffset || 0;
      const len = length !== undefined ? length : data.byteLength - offset;
      return new Buffer(data, offset, len);
    }
    if (data instanceof Buffer) {
      // Buffer.from(buffer) creates a COPY
      const buf = new Buffer(data.length);
      buf.set(data);
      return buf;
    }
    if (ArrayBuffer.isView(data)) {
      const buf = new Buffer(data.byteLength);
      buf.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      return buf;
    }
    if (Array.isArray(data) || data instanceof Uint8Array) {
      const buf = new Buffer(data.length);
      for (let i = 0; i < data.length; i++) buf[i] = data[i] & 0xff;
      return buf;
    }
    throw new TypeError('The first argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.');
  }

  static alloc(size, fill, encoding) {
    const buf = new Buffer(size);
    if (fill !== undefined) {
      buf.fill(fill, 0, size, encoding);
    }
    return buf;
  }

  static allocUnsafe(size) {
    return new Buffer(size);
  }

  static concat(list, totalLength) {
    if (totalLength === undefined) {
      totalLength = list.reduce((sum, buf) => sum + buf.length, 0);
    }
    const result = Buffer.alloc(totalLength);
    let offset = 0;
    for (const buf of list) {
      const len = Math.min(buf.length, totalLength - offset);
      result.set(buf.subarray(0, len), offset);
      offset += len;
      if (offset >= totalLength) break;
    }
    return result;
  }

  static isBuffer(obj) {
    return obj instanceof Buffer;
  }

  static isEncoding(encoding) {
    return ['utf8', 'utf-8', 'ascii', 'latin1', 'binary', 'base64', 'base64url', 'hex'].includes(
      String(encoding).toLowerCase()
    );
  }

  static byteLength(string, encoding) {
    if (typeof string !== 'string') {
      if (ArrayBuffer.isView(string) || string instanceof ArrayBuffer) {
        return string.byteLength;
      }
      string = String(string);
    }
    return _encodeString(string, encoding).length;
  }

  static compare(a, b) {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    if (a.length < b.length) return -1;
    if (a.length > b.length) return 1;
    return 0;
  }

  toString(encoding, start, end) {
    return _decodeBuffer(this, encoding, start, end);
  }

  // slice() MUST share memory — return a Buffer view into the same ArrayBuffer
  slice(start, end) {
    const s = start || 0;
    const e = end !== undefined ? end : this.length;
    // Use the same underlying ArrayBuffer — shared memory
    return new Buffer(this.buffer, this.byteOffset + s, e - s);
  }

  // subarray also shares memory (inherited from Uint8Array but must return Buffer)
  subarray(start, end) {
    return this.slice(start, end);
  }

  copy(target, targetStart, sourceStart, sourceEnd) {
    targetStart = targetStart || 0;
    sourceStart = sourceStart || 0;
    sourceEnd = sourceEnd !== undefined ? sourceEnd : this.length;

    const len = Math.min(sourceEnd - sourceStart, target.length - targetStart);
    for (let i = 0; i < len; i++) {
      target[targetStart + i] = this[sourceStart + i];
    }
    return len;
  }

  compare(other) {
    return Buffer.compare(this, other);
  }

  equals(other) {
    if (this.length !== other.length) return false;
    for (let i = 0; i < this.length; i++) {
      if (this[i] !== other[i]) return false;
    }
    return true;
  }

  indexOf(value, byteOffset, encoding) {
    if (typeof byteOffset === 'string') {
      encoding = byteOffset;
      byteOffset = 0;
    }
    byteOffset = byteOffset || 0;

    if (typeof value === 'number') {
      for (let i = byteOffset; i < this.length; i++) {
        if (this[i] === value) return i;
      }
      return -1;
    }

    if (typeof value === 'string') {
      value = Buffer.from(value, encoding);
    }

    // Search for sub-buffer
    if (value.length === 0) return byteOffset;
    for (let i = byteOffset; i <= this.length - value.length; i++) {
      let found = true;
      for (let j = 0; j < value.length; j++) {
        if (this[i + j] !== value[j]) { found = false; break; }
      }
      if (found) return i;
    }
    return -1;
  }

  includes(value, byteOffset, encoding) {
    return this.indexOf(value, byteOffset, encoding) !== -1;
  }

  write(string, offset, length, encoding) {
    if (typeof offset === 'string') {
      encoding = offset;
      offset = 0;
      length = this.length;
    } else if (typeof length === 'string') {
      encoding = length;
      length = this.length - (offset || 0);
    }
    offset = offset || 0;
    if (length === undefined) length = this.length - offset;

    const encoded = _encodeString(string, encoding);
    const bytesToWrite = Math.min(encoded.length, length, this.length - offset);
    for (let i = 0; i < bytesToWrite; i++) {
      this[offset + i] = encoded[i];
    }
    return bytesToWrite;
  }

  fill(value, offset, end, encoding) {
    offset = offset || 0;
    end = end !== undefined ? end : this.length;

    if (typeof value === 'string') {
      if (typeof offset === 'string') {
        encoding = offset;
        offset = 0;
        end = this.length;
      }
      const encoded = _encodeString(value, encoding);
      if (encoded.length === 0) return this;
      for (let i = offset; i < end; i++) {
        this[i] = encoded[(i - offset) % encoded.length];
      }
    } else if (typeof value === 'number') {
      for (let i = offset; i < end; i++) {
        this[i] = value & 0xff;
      }
    }
    return this;
  }

  readUInt8(offset) {
    return this[offset];
  }

  readUInt16BE(offset) {
    return (this[offset] << 8) | this[offset + 1];
  }

  readUInt16LE(offset) {
    return this[offset] | (this[offset + 1] << 8);
  }

  readUInt32BE(offset) {
    return ((this[offset] * 0x1000000) + (this[offset + 1] << 16) + (this[offset + 2] << 8) + this[offset + 3]) >>> 0;
  }

  readUInt32LE(offset) {
    return ((this[offset + 3] * 0x1000000) + (this[offset + 2] << 16) + (this[offset + 1] << 8) + this[offset]) >>> 0;
  }

  readInt8(offset) {
    const val = this[offset];
    return val & 0x80 ? val - 0x100 : val;
  }

  readInt16BE(offset) {
    const val = (this[offset] << 8) | this[offset + 1];
    return val & 0x8000 ? val - 0x10000 : val;
  }

  readInt32BE(offset) {
    return (this[offset] << 24) | (this[offset + 1] << 16) | (this[offset + 2] << 8) | this[offset + 3];
  }

  writeUInt8(value, offset) {
    this[offset] = value & 0xff;
    return offset + 1;
  }

  writeUInt16BE(value, offset) {
    this[offset] = (value >>> 8) & 0xff;
    this[offset + 1] = value & 0xff;
    return offset + 2;
  }

  writeUInt32BE(value, offset) {
    this[offset] = (value >>> 24) & 0xff;
    this[offset + 1] = (value >>> 16) & 0xff;
    this[offset + 2] = (value >>> 8) & 0xff;
    this[offset + 3] = value & 0xff;
    return offset + 4;
  }

  toJSON() {
    return { type: 'Buffer', data: Array.from(this) };
  }
}

export const bufferBridge = Buffer;

/**
 * Register browser builtins with EdgeJS module system.
 *
 * @param {object} edgeInstance - The EdgeJS Wasm instance
 */
export function registerBrowserBuiltins(edgeInstance) {
  const builtins = {
    'crypto': cryptoBridge,
    'events': { EventEmitter, default: EventEmitter },
    'stream': { Readable, Writable, Duplex, Transform, PassThrough, pipeline, finished },
    'path': pathBridge,
    'path/posix': pathBridge,
    'url': urlBridge,
    'util': util,
    'buffer': { Buffer: bufferBridge, kMaxLength: 2 ** 31 - 1 },
    'process': processBridge,
  };

  // Inject into EdgeJS's module resolution
  // This is called after EdgeJS initializes, hooking into its require() chain
  for (const [name, impl] of Object.entries(builtins)) {
    if (edgeInstance._registerBuiltinOverride) {
      edgeInstance._registerBuiltinOverride(name, impl);
    }
  }

  return builtins;
}
