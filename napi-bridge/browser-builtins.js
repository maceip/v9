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
import fs from './fs.js';
import { http, https } from './http.js';
import { net, tls, dns } from './net-stubs.js';
import childProcess from './child-process.js';

/**
 * crypto — Pure JS synchronous SHA + HMAC + randomBytes.
 *
 * Node.js crypto.createHash is SYNCHRONOUS. Web Crypto is async-only.
 * We implement pure JS SHA-1/256/384/512 so the SDK can do:
 *   crypto.createHash('sha256').update(body).digest('hex')
 * without awaiting.
 */

// ─── SHA-256 / SHA-224 (pure JS) ────────────────────────────────────

const SHA256_K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);

function _sha256(data) {
  // Pre-processing
  const msg = (data instanceof Uint8Array) ? data : new TextEncoder().encode(data);
  const bitLen = msg.length * 8;
  // Padding: msg + 0x80 + zeros + 64-bit big-endian length
  const padLen = 64 - ((msg.length + 9) % 64);
  const totalLen = msg.length + 1 + (padLen === 64 ? 0 : padLen) + 8;
  const buf = new Uint8Array(totalLen);
  buf.set(msg);
  buf[msg.length] = 0x80;
  // Length in bits as 64-bit big-endian (we only handle up to 2^32 bits)
  const dv = new DataView(buf.buffer);
  dv.setUint32(totalLen - 4, bitLen, false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let off = 0; off < totalLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = (((w[i-15] >>> 7) | (w[i-15] << 25)) ^ ((w[i-15] >>> 18) | (w[i-15] << 14)) ^ (w[i-15] >>> 3)) >>> 0;
      const s1 = (((w[i-2] >>> 17) | (w[i-2] << 15)) ^ ((w[i-2] >>> 19) | (w[i-2] << 13)) ^ (w[i-2] >>> 10)) >>> 0;
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }

    let a=h0, b=h1, c=h2, d=h3, e=h4, f=h5, g=h6, h=h7;
    for (let i = 0; i < 64; i++) {
      const S1 = (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;
      h=g; g=f; f=e; e=(d+temp1)>>>0; d=c; c=b; b=a; a=(temp1+temp2)>>>0;
    }
    h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
    h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
  }

  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  odv.setUint32(0,h0,false); odv.setUint32(4,h1,false); odv.setUint32(8,h2,false); odv.setUint32(12,h3,false);
  odv.setUint32(16,h4,false); odv.setUint32(20,h5,false); odv.setUint32(24,h6,false); odv.setUint32(28,h7,false);
  return out;
}

// ─── SHA-1 (pure JS) ────────────────────────────────────────────────

function _sha1(data) {
  const msg = (data instanceof Uint8Array) ? data : new TextEncoder().encode(data);
  const bitLen = msg.length * 8;
  const padLen = 64 - ((msg.length + 9) % 64);
  const totalLen = msg.length + 1 + (padLen === 64 ? 0 : padLen) + 8;
  const buf = new Uint8Array(totalLen);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(totalLen - 4, bitLen, false);

  let h0=0x67452301, h1=0xEFCDAB89, h2=0x98BADCFE, h3=0x10325476, h4=0xC3D2E1F0;
  const w = new Uint32Array(80);

  for (let off = 0; off < totalLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 80; i++) {
      const x = w[i-3] ^ w[i-8] ^ w[i-14] ^ w[i-16];
      w[i] = ((x << 1) | (x >>> 31)) >>> 0;
    }
    let a=h0, b=h1, c=h2, d=h3, e=h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = ((b & c) | (~b & d)) >>> 0; k = 0x5A827999; }
      else if (i < 40) { f = (b ^ c ^ d) >>> 0; k = 0x6ED9EBA1; }
      else if (i < 60) { f = ((b & c) | (b & d) | (c & d)) >>> 0; k = 0x8F1BBCDC; }
      else { f = (b ^ c ^ d) >>> 0; k = 0xCA62C1D6; }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e=d; d=c; c=((b << 30) | (b >>> 2)) >>> 0; b=a; a=temp;
    }
    h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0; h4=(h4+e)>>>0;
  }

  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  odv.setUint32(0,h0,false); odv.setUint32(4,h1,false); odv.setUint32(8,h2,false);
  odv.setUint32(12,h3,false); odv.setUint32(16,h4,false);
  return out;
}

// ─── SHA-512 / SHA-384 (pure JS, BigInt-based for correctness) ──────

const _SHA512_K = [
  0x428a2f98d728ae22n, 0x7137449123ef65cdn, 0xb5c0fbcfec4d3b2fn, 0xe9b5dba58189dbbcn,
  0x3956c25bf348b538n, 0x59f111f1b605d019n, 0x923f82a4af194f9bn, 0xab1c5ed5da6d8118n,
  0xd807aa98a3030242n, 0x12835b0145706fben, 0x243185be4ee4b28cn, 0x550c7dc3d5ffb4e2n,
  0x72be5d74f27b896fn, 0x80deb1fe3b1696b1n, 0x9bdc06a725c71235n, 0xc19bf174cf692694n,
  0xe49b69c19ef14ad2n, 0xefbe4786384f25e3n, 0x0fc19dc68b8cd5b5n, 0x240ca1cc77ac9c65n,
  0x2de92c6f592b0275n, 0x4a7484aa6ea6e483n, 0x5cb0a9dcbd41fbd4n, 0x76f988da831153b5n,
  0x983e5152ee66dfabn, 0xa831c66d2db43210n, 0xb00327c898fb213fn, 0xbf597fc7beef0ee4n,
  0xc6e00bf33da88fc2n, 0xd5a79147930aa725n, 0x06ca6351e003826fn, 0x142929670a0e6e70n,
  0x27b70a8546d22ffcn, 0x2e1b21385c26c926n, 0x4d2c6dfc5ac42aedn, 0x53380d139d95b3dfn,
  0x650a73548baf63den, 0x766a0abb3c77b2a8n, 0x81c2c92e47edaee6n, 0x92722c851482353bn,
  0xa2bfe8a14cf10364n, 0xa81a664bbc423001n, 0xc24b8b70d0f89791n, 0xc76c51a30654be30n,
  0xd192e819d6ef5218n, 0xd69906245565a910n, 0xf40e35855771202an, 0x106aa07032bbd1b8n,
  0x19a4c116b8d2d0c8n, 0x1e376c085141ab53n, 0x2748774cdf8eeb99n, 0x34b0bcb5e19b48a8n,
  0x391c0cb3c5c95a63n, 0x4ed8aa4ae3418acbn, 0x5b9cca4f7763e373n, 0x682e6ff3d6b2b8a3n,
  0x748f82ee5defb2fcn, 0x78a5636f43172f60n, 0x84c87814a1f0ab72n, 0x8cc702081a6439ecn,
  0x90befffa23631e28n, 0xa4506cebde82bde9n, 0xbef9a3f7b2c67915n, 0xc67178f2e372532bn,
  0xca273eceea26619cn, 0xd186b8c721c0c207n, 0xeada7dd6cde0eb1en, 0xf57d4f7fee6ed178n,
  0x06f067aa72176fban, 0x0a637dc5a2c898a6n, 0x113f9804bef90daen, 0x1b710b35131c471bn,
  0x28db77f523047d84n, 0x32caab7b40c72493n, 0x3c9ebe0a15c9bebcn, 0x431d67c49c100d4cn,
  0x4cc5d4becb3e42b6n, 0x597f299cfc657e2an, 0x5fcb6fab3ad6faecn, 0x6c44198c4a475817n,
];
const _M64 = 0xFFFFFFFFFFFFFFFFn;

const _SHA512_IV = [
  0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn,
  0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n, 0x9b05688c2b3e6c1fn,
  0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n,
];

const _SHA384_IV = [
  0xcbbb9d5dc1059ed8n, 0x629a292a367cd507n,
  0x9159015a3070dd17n, 0x152fecd8f70e5939n,
  0x67332667ffc00b31n, 0x8eb44a8768581511n,
  0xdb0c2e0d64f98fa7n, 0x47b5481dbefa4fa4n,
];

function _sha512(data, iv) {
  const msg = (data instanceof Uint8Array) ? data : new TextEncoder().encode(data);
  const bitLen = BigInt(msg.length) * 8n;

  // Padding: message + 0x80 + zeros + 128-bit big-endian length
  // Total must be multiple of 128
  const msgLen = msg.length;
  let totalLen = msgLen + 1 + 16; // +1 for 0x80, +16 for length
  totalLen += (128 - (totalLen % 128)) % 128;
  const buf = new Uint8Array(totalLen);
  buf.set(msg);
  buf[msgLen] = 0x80;
  // Write 128-bit big-endian length
  const dv = new DataView(buf.buffer);
  dv.setUint32(totalLen - 4, Number(bitLen & 0xFFFFFFFFn), false);
  dv.setUint32(totalLen - 8, Number((bitLen >> 32n) & 0xFFFFFFFFn), false);

  // Initial hash values — SHA-384 uses different IVs from SHA-512
  const H = Array.from(iv || _SHA512_IV);

  const W = new Array(80);

  for (let off = 0; off < totalLen; off += 128) {
    for (let i = 0; i < 16; i++) {
      const hi = BigInt(dv.getUint32(off + i * 8, false));
      const lo = BigInt(dv.getUint32(off + i * 8 + 4, false));
      W[i] = (hi << 32n) | lo;
    }
    for (let i = 16; i < 80; i++) {
      const w2 = W[i - 2];
      const s1 = (((w2 >> 19n) | (w2 << 45n)) ^ ((w2 >> 61n) | (w2 << 3n)) ^ (w2 >> 6n)) & _M64;
      const w15 = W[i - 15];
      const s0 = (((w15 >> 1n) | (w15 << 63n)) ^ ((w15 >> 8n) | (w15 << 56n)) ^ (w15 >> 7n)) & _M64;
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) & _M64;
    }

    let [a, b, c, d, e, f, g, h] = H;

    for (let i = 0; i < 80; i++) {
      const S1 = (((e >> 14n) | (e << 50n)) ^ ((e >> 18n) | (e << 46n)) ^ ((e >> 41n) | (e << 23n))) & _M64;
      const ch = ((e & f) ^ ((~e & _M64) & g)) & _M64;
      const temp1 = (h + S1 + ch + _SHA512_K[i] + W[i]) & _M64;

      const S0 = (((a >> 28n) | (a << 36n)) ^ ((a >> 34n) | (a << 30n)) ^ ((a >> 39n) | (a << 25n))) & _M64;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) & _M64;
      const temp2 = (S0 + maj) & _M64;

      h = g; g = f; f = e;
      e = (d + temp1) & _M64;
      d = c; c = b; b = a;
      a = (temp1 + temp2) & _M64;
    }

    H[0] = (H[0] + a) & _M64; H[1] = (H[1] + b) & _M64;
    H[2] = (H[2] + c) & _M64; H[3] = (H[3] + d) & _M64;
    H[4] = (H[4] + e) & _M64; H[5] = (H[5] + f) & _M64;
    H[6] = (H[6] + g) & _M64; H[7] = (H[7] + h) & _M64;
  }

  const out = new Uint8Array(64);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) {
    odv.setUint32(i * 8, Number((H[i] >> 32n) & 0xFFFFFFFFn), false);
    odv.setUint32(i * 8 + 4, Number(H[i] & 0xFFFFFFFFn), false);
  }
  return out;
}

// ─── Hash dispatch ──────────────────────────────────────────────────

function _hashBytes(algorithm, data) {
  switch (algorithm) {
    case 'sha256': case 'sha-256': return _sha256(data);
    case 'sha1': case 'sha-1': return _sha1(data);
    case 'sha512': case 'sha-512': return _sha512(data);
    case 'sha384': case 'sha-384': return _sha512(data, _SHA384_IV).subarray(0, 48);
    default: throw new Error(`Unsupported hash algorithm: ${algorithm}`);
  }
}

function _bytesToHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

function _bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

// ─── HMAC (pure JS) ────────────────────────────────────────────────

function _hmac(algorithm, key, data) {
  const blockSize = (algorithm === 'sha384' || algorithm === 'sha512' || algorithm === 'sha-384' || algorithm === 'sha-512') ? 128 : 64;

  let keyBytes;
  if (typeof key === 'string') keyBytes = new TextEncoder().encode(key);
  else keyBytes = new Uint8Array(key);

  // Keys longer than block size are hashed first
  if (keyBytes.length > blockSize) keyBytes = _hashBytes(algorithm, keyBytes);

  // Pad key to block size
  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(keyBytes);

  const ipad = new Uint8Array(blockSize);
  const opad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    ipad[i] = paddedKey[i] ^ 0x36;
    opad[i] = paddedKey[i] ^ 0x5c;
  }

  // inner = hash(ipad + data)
  const inner = new Uint8Array(blockSize + data.length);
  inner.set(ipad);
  inner.set(data, blockSize);
  const innerHash = _hashBytes(algorithm, inner);

  // outer = hash(opad + innerHash)
  const outer = new Uint8Array(blockSize + innerHash.length);
  outer.set(opad);
  outer.set(innerHash, blockSize);
  return _hashBytes(algorithm, outer);
}

// ─── cryptoBridge ───────────────────────────────────────────────────

export const cryptoBridge = {
  randomBytes(size) {
    const buf = new Uint8Array(size);
    crypto.getRandomValues(buf);
    return buf;
  },

  randomUUID() {
    return crypto.randomUUID();
  },

  randomFillSync(buf, offset, size) {
    offset = offset || 0;
    size = size || buf.length - offset;
    const view = new Uint8Array(buf.buffer || buf, buf.byteOffset + offset, size);
    crypto.getRandomValues(view);
    return buf;
  },

  randomFill(buf, offset, size, cb) {
    if (typeof offset === 'function') { cb = offset; offset = 0; size = buf.length; }
    if (typeof size === 'function') { cb = size; size = buf.length - offset; }
    try { this.randomFillSync(buf, offset, size); cb(null, buf); }
    catch (e) { cb(e); }
  },

  randomInt(min, max, cb) {
    if (max === undefined) { max = min; min = 0; }
    const range = max - min;
    const val = min + Math.floor(Math.random() * range);
    if (cb) cb(null, val); else return val;
  },

  timingSafeEqual(a, b) {
    if (a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
    let result = 0;
    for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
    return result === 0;
  },

  getRandomValues(buf) {
    return crypto.getRandomValues(buf);
  },

  getHashes() { return ['sha1', 'sha256', 'sha384', 'sha512', 'md5']; },
  getCiphers() { return []; },
  getCurves() { return []; },
  getFips() { return 0; },
  setFips() {},
  subtle: globalThis.crypto?.subtle || {},
  webcrypto: globalThis.crypto || {},
  constants: {},
  hash(algo, data, outputEncoding) {
    const h = cryptoBridge.createHash(algo);
    h.update(data);
    return outputEncoding ? h.digest(outputEncoding) : h.digest();
  },

  createHash(algorithm) {
    const algo = algorithm.toLowerCase();
    const chunks = [];
    return {
      update(data) {
        if (typeof data === 'string') {
          chunks.push(new TextEncoder().encode(data));
        } else {
          chunks.push(new Uint8Array(data));
        }
        return this;
      },
      digest(encoding) {
        const totalLen = chunks.reduce((s, c) => s + c.length, 0);
        const combined = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of chunks) { combined.set(c, offset); offset += c.length; }
        const hash = _hashBytes(algo, combined);
        if (encoding === 'hex') return _bytesToHex(hash);
        if (encoding === 'base64') return _bytesToBase64(hash);
        return hash;
      },
    };
  },

  createHmac(algorithm, key) {
    const algo = algorithm.toLowerCase();
    const chunks = [];
    let keyBytes;
    if (typeof key === 'string') keyBytes = new TextEncoder().encode(key);
    else keyBytes = new Uint8Array(key);

    return {
      update(data) {
        if (typeof data === 'string') {
          chunks.push(new TextEncoder().encode(data));
        } else {
          chunks.push(new Uint8Array(data));
        }
        return this;
      },
      digest(encoding) {
        const totalLen = chunks.reduce((s, c) => s + c.length, 0);
        const combined = new Uint8Array(totalLen);
        let offset = 0;
        for (const c of chunks) { combined.set(c, offset); offset += c.length; }
        const mac = _hmac(algo, keyBytes, combined);
        if (encoding === 'hex') return _bytesToHex(mac);
        if (encoding === 'base64') return _bytesToBase64(mac);
        return mac;
      },
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
    return pathBridge.normalize(parts.filter(Boolean).join('/'));
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
    // If no absolute anchor was found, prepend cwd
    if (!resolved.startsWith('/')) {
      const cwd = (typeof process !== 'undefined' && typeof process.cwd === 'function')
        ? process.cwd() : '/';
      resolved = cwd.replace(/\/$/, '') + '/' + resolved;
    }
    return pathBridge.normalize(resolved);
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
    const base = pathBridge.basename(p);
    const idx = base.lastIndexOf('.');
    return idx <= 0 ? '' : base.substring(idx);
  },

  isAbsolute(p) {
    return p.startsWith('/');
  },

  relative(from, to) {
    const fromParts = pathBridge.resolve(from).split('/').filter(Boolean);
    const toParts = pathBridge.resolve(to).split('/').filter(Boolean);
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
      dir: pathBridge.dirname(p),
      base: pathBridge.basename(p),
      ext: pathBridge.extname(p),
      name: pathBridge.basename(p, pathBridge.extname(p)),
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
    // In browser runtime, import.meta.url is http:// — extract pathname instead of throwing
    if (u.protocol !== 'file:' && (u.protocol === 'http:' || u.protocol === 'https:')) {
      return decodeURIComponent(u.pathname);
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

    // Bind cwd/chdir so they work when destructured (const { cwd } = process)
    const self = this;
    this.cwd = () => self._cwd;
    this.chdir = (dir) => {
      if (typeof dir !== 'string') throw new TypeError('The "directory" argument must be of type string');
      self._cwd = dir;
    };

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
    this.stdout.columns = 80;
    this.stdout.rows = 24;

    // stderr — Writable stream that logs to console.error
    this.stderr = new Writable({
      write(chunk, encoding, callback) {
        const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        console.error(str);
        callback();
      },
    });
    this.stderr.isTTY = false;
    this.stderr.columns = 80;
    this.stderr.rows = 24;

    // stdin — Readable stream (no data by default in browser)
    this.stdin = new Readable({
      read() {
        // No data available in browser environment — data is pushed
        // externally via runtime.pushStdin() from the terminal UI.
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
    // Use real Wasm heap stats when available via _wasmInstance
    const wasm = this._wasmInstance;
    if (wasm && wasm.HEAP8 && wasm.HEAP8.buffer) {
      const buf = wasm.HEAP8.buffer;
      const heapTotal = buf.byteLength;
      // _sbrk(0) returns current heap break if available
      const heapUsed = typeof wasm._sbrk === 'function'
        ? wasm._sbrk(0) : heapTotal;
      return {
        rss: heapTotal,
        heapTotal,
        heapUsed,
        external: 0,
        arrayBuffers: 0,
      };
    }
    // Fallback: use performance.memory if available (Chrome)
    if (typeof performance !== 'undefined' && performance.memory) {
      const m = performance.memory;
      return {
        rss: m.totalJSHeapSize || 0,
        heapTotal: m.totalJSHeapSize || 0,
        heapUsed: m.usedJSHeapSize || 0,
        external: 0,
        arrayBuffers: 0,
      };
    }
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

  writeUInt16LE(value, offset) { this[offset] = value & 0xff; this[offset+1] = (value>>>8) & 0xff; return offset+2; }
  writeUInt32BE(value, offset) { this[offset]=(value>>>24)&0xff; this[offset+1]=(value>>>16)&0xff; this[offset+2]=(value>>>8)&0xff; this[offset+3]=value&0xff; return offset+4; }
  writeUInt32LE(value, offset) { this[offset]=value&0xff; this[offset+1]=(value>>>8)&0xff; this[offset+2]=(value>>>16)&0xff; this[offset+3]=(value>>>24)&0xff; return offset+4; }
  writeInt8(value, offset) { if(value<0) value=0xff+value+1; this[offset]=value&0xff; return offset+1; }
  writeInt16BE(value, offset) { if(value<0) value=0xffff+value+1; return this.writeUInt16BE(value,offset); }
  writeInt16LE(value, offset) { if(value<0) value=0xffff+value+1; return this.writeUInt16LE(value,offset); }
  writeInt32BE(value, offset) { if(value<0) value=0xffffffff+value+1; return this.writeUInt32BE(value,offset); }
  writeInt32LE(value, offset) { if(value<0) value=0xffffffff+value+1; return this.writeUInt32LE(value,offset); }
  writeFloatBE(value, offset) { const v=new DataView(this.buffer,this.byteOffset,this.byteLength); v.setFloat32(offset,value,false); return offset+4; }
  writeFloatLE(value, offset) { const v=new DataView(this.buffer,this.byteOffset,this.byteLength); v.setFloat32(offset,value,true); return offset+4; }
  writeDoubleBE(value, offset) { const v=new DataView(this.buffer,this.byteOffset,this.byteLength); v.setFloat64(offset,value,false); return offset+8; }
  writeDoubleLE(value, offset) { const v=new DataView(this.buffer,this.byteOffset,this.byteLength); v.setFloat64(offset,value,true); return offset+8; }
  writeBigInt64BE(value, offset) { const v=new DataView(this.buffer,this.byteOffset,this.byteLength); v.setBigInt64(offset,value,false); return offset+8; }
  writeBigInt64LE(value, offset) { const v=new DataView(this.buffer,this.byteOffset,this.byteLength); v.setBigInt64(offset,value,true); return offset+8; }
  writeBigUInt64BE(value, offset) { const v=new DataView(this.buffer,this.byteOffset,this.byteLength); v.setBigUint64(offset,value,false); return offset+8; }
  writeBigUInt64LE(value, offset) { const v=new DataView(this.buffer,this.byteOffset,this.byteLength); v.setBigUint64(offset,value,true); return offset+8; }
  readFloatBE(offset) { return new DataView(this.buffer,this.byteOffset,this.byteLength).getFloat32(offset,false); }
  readFloatLE(offset) { return new DataView(this.buffer,this.byteOffset,this.byteLength).getFloat32(offset,true); }
  readDoubleBE(offset) { return new DataView(this.buffer,this.byteOffset,this.byteLength).getFloat64(offset,false); }
  readDoubleLE(offset) { return new DataView(this.buffer,this.byteOffset,this.byteLength).getFloat64(offset,true); }
  readBigInt64BE(offset) { return new DataView(this.buffer,this.byteOffset,this.byteLength).getBigInt64(offset,false); }
  readBigInt64LE(offset) { return new DataView(this.buffer,this.byteOffset,this.byteLength).getBigInt64(offset,true); }
  readBigUInt64BE(offset) { return new DataView(this.buffer,this.byteOffset,this.byteLength).getBigUint64(offset,false); }
  readBigUInt64LE(offset) { return new DataView(this.buffer,this.byteOffset,this.byteLength).getBigUint64(offset,true); }
  readIntBE(offset, byteLength) { let v=0; for(let i=0;i<byteLength;i++) v=(v*256)+this[offset+i]; if(v>=(1<<(8*byteLength-1))) v-=(1<<(8*byteLength)); return v; }
  readIntLE(offset, byteLength) { let v=0; for(let i=byteLength-1;i>=0;i--) v=(v*256)+this[offset+i]; if(v>=(1<<(8*byteLength-1))) v-=(1<<(8*byteLength)); return v; }
  readUIntBE(offset, byteLength) { let v=0; for(let i=0;i<byteLength;i++) v=(v*256)+this[offset+i]; return v; }
  readUIntLE(offset, byteLength) { let v=0; for(let i=byteLength-1;i>=0;i--) v=(v*256)+this[offset+i]; return v; }
  writeIntBE(value, offset, byteLength) { for(let i=byteLength-1;i>=0;i--) { this[offset+i]=value&0xff; value>>=8; } return offset+byteLength; }
  writeIntLE(value, offset, byteLength) { for(let i=0;i<byteLength;i++) { this[offset+i]=value&0xff; value>>=8; } return offset+byteLength; }
  writeUIntBE(value, offset, byteLength) { return this.writeIntBE(value,offset,byteLength); }
  writeUIntLE(value, offset, byteLength) { return this.writeIntLE(value,offset,byteLength); }
  swap16() { for(let i=0;i<this.length;i+=2) { const t=this[i]; this[i]=this[i+1]; this[i+1]=t; } return this; }
  swap32() { for(let i=0;i<this.length;i+=4) { let t=this[i]; this[i]=this[i+3]; this[i+3]=t; t=this[i+1]; this[i+1]=this[i+2]; this[i+2]=t; } return this; }
  swap64() { for(let i=0;i<this.length;i+=8) { for(let j=0;j<4;j++) { const t=this[i+j]; this[i+j]=this[i+7-j]; this[i+7-j]=t; } } return this; }

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
// ─── Phase 7: Additional module imports ──────────────────────────────

import osModule from './os.js';
import ttyModule from './tty.js';
import readlineModule, { promises as readlinePromises } from './readline.js';
import zlibModule from './zlib.js';
import asyncHooksModule from './async-hooks.js';
import moduleShim, { _setRequire, _setBuiltinList, _setBuiltinModule } from './module-shim.js';
import timersPromisesModule, { timersModule } from './timers-promises.js';
import streamConsumers from './stream-consumers.js';
import workerThreadsModule from './worker-threads.js';
import assertModule from './assert.js';
import stringDecoderModule from './string-decoder.js';
import constantsModule from './constants.js';
import inspectorModule from './inspector.js';
import nodePtyShim from './node-pty-shim.js';
import diagnosticsChannelModule from './diagnostics-channel.js';
import undiciStub from './undici-stub.js';

export function registerBrowserBuiltins(edgeInstance, overrides = {}) {
  // Build fs module with promises sub-object for node:fs/promises
  const fsModule = overrides.fs || fs;
  const fsPromises = fsModule.promises || {};

  const builtins = {
    // ── Original modules ──
    // Each module exposes named exports AND a `default` for ESM interop.
    // `const { createHash } = require('crypto')` and
    // `import { createHash } from 'node:crypto'` both work.
    'crypto': { ...cryptoBridge, default: cryptoBridge, Hash: class Hash { constructor() {} update() { return this; } digest() { return Buffer.alloc(0); } copy() { return new Hash(); } }, Hmac: class Hmac { constructor() {} update() { return this; } digest() { return Buffer.alloc(0); } }, Cipher: class Cipher extends Transform { constructor() { super(); } update() { return Buffer.alloc(0); } final() { return Buffer.alloc(0); } }, Cipheriv: class {}, Decipher: class Decipher extends Transform { constructor() { super(); } update() { return Buffer.alloc(0); } final() { return Buffer.alloc(0); } }, Decipheriv: class {}, Sign: class { constructor() {} update() { return this; } sign() { return Buffer.alloc(0); } }, Verify: class { constructor() {} update() { return this; } verify() { return false; } }, DiffieHellman: class {}, ECDH: class {}, KeyObject: class {}, X509Certificate: class {}, createPrivateKey: () => { throw new Error('createPrivateKey not in browser'); }, createPublicKey: () => { throw new Error('createPublicKey not in browser'); }, createSecretKey: () => { throw new Error('createSecretKey not in browser'); }, createSign: () => new (class { update() { return this; } sign() { return Buffer.alloc(0); } })(), createVerify: () => new (class { update() { return this; } verify() { return false; } })(), createCipheriv: () => { throw new Error('createCipheriv not in browser'); }, createDecipheriv: () => { throw new Error('createDecipheriv not in browser'); }, createDiffieHellman: () => { throw new Error('not in browser'); }, createECDH: () => { throw new Error('not in browser'); }, pbkdf2: () => { throw new Error('not in browser'); }, pbkdf2Sync: () => { throw new Error('not in browser'); }, scrypt: () => { throw new Error('not in browser'); }, scryptSync: () => { throw new Error('not in browser'); }, generateKeyPairSync: () => { throw new Error('not in browser'); }, generateKeyPair: () => { throw new Error('not in browser'); } },
    'events': Object.assign(EventEmitter, { EventEmitter, default: EventEmitter, setMaxListeners: EventEmitter.setMaxListeners || (() => {}) }),
    'stream': (() => { const w = (C) => new Proxy(C, { apply(t,_,a) { return new t(...a); } }); const R=w(Readable),W=w(Writable),D=w(Duplex),T=w(Transform),P=w(PassThrough); return Object.assign(R, { Stream:R, Readable:R, Writable:W, Duplex:D, Transform:T, PassThrough:P, pipeline, finished, default:R }); })(),
    'path': { ...pathBridge, default: pathBridge },
    'path/posix': { ...pathBridge, default: pathBridge },
    'url': { ...urlBridge, default: urlBridge },
    'util': { ...util, default: util },
    'buffer': { Buffer: bufferBridge, kMaxLength: 2 ** 31 - 1, default: { Buffer: bufferBridge, kMaxLength: 2 ** 31 - 1 } },
    'process': processBridge,
    'fs': { ...fsModule, default: fsModule },
    'fs/promises': { ...fsPromises, default: fsPromises },
    'http': { ...http, default: http },
    'https': { ...https, default: https },
    'net': { ...net, default: net },
    'tls': { ...tls, default: tls },
    'dns': { ...dns, default: dns },
    'child_process': { ...childProcess, default: childProcess },

    // ── Phase 7: New modules ──
    'os': osModule,
    'tty': ttyModule,
    'readline': readlineModule,
    'readline/promises': readlinePromises,
    'zlib': { ...zlibModule, DeflateRaw: class DeflateRaw extends Transform { constructor(o) { super(o); } }, InflateRaw: class InflateRaw extends Transform { constructor(o) { super(o); } }, Gzip: class Gzip extends Transform { constructor(o) { super(o); } }, Gunzip: class Gunzip extends Transform { constructor(o) { super(o); } }, Deflate: class Deflate extends Transform { constructor(o) { super(o); } }, Inflate: class Inflate extends Transform { constructor(o) { super(o); } }, Unzip: class Unzip extends Transform { constructor(o) { super(o); } }, BrotliCompress: class BrotliCompress extends Transform { constructor(o) { super(o); } }, BrotliDecompress: class BrotliDecompress extends Transform { constructor(o) { super(o); } } },
    'async_hooks': asyncHooksModule,
    'module': moduleShim,
    'timers': timersModule,
    'timers/promises': timersPromisesModule,
    'stream/consumers': streamConsumers,
    'worker_threads': workerThreadsModule,
    'assert': assertModule,
    'assert/strict': assertModule.strict || assertModule,
    'string_decoder': stringDecoderModule,
    'constants': constantsModule,
    'inspector': inspectorModule,
    'inspector/promises': inspectorModule,
    // 'diagnostics_channel': diagnosticsChannelModule, // replaced below with _parentWrap version

    // ── Missing builtins (stubs for modules not yet fully implemented) ──
    'punycode': { encode: (s) => s, decode: (s) => s, toASCII: (s) => s, toUnicode: (s) => s, ucs2: { decode: (s) => [...s].map(c => c.codePointAt(0)), encode: (a) => String.fromCodePoint(...a) }, version: '2.3.1' },
    'http2': { constants: {}, connect: () => { throw new Error('http2 not available in browser'); }, createServer: () => { throw new Error('http2 not available in browser'); }, createSecureServer: () => { throw new Error('http2 not available in browser'); } },
    'console': Object.assign({}, globalThis.console, {
      Console: class Console {
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
      },
    }),
    'util/types': util.types || {},
    'querystring': { parse: (s) => Object.fromEntries(new URLSearchParams(s)), stringify: (o) => new URLSearchParams(o).toString(), encode: (o) => new URLSearchParams(o).toString(), decode: (s) => Object.fromEntries(new URLSearchParams(s)), escape: encodeURIComponent, unescape: decodeURIComponent },
    'perf_hooks': Object.assign({}, { performance: globalThis.performance, PerformanceObserver: globalThis.PerformanceObserver || class {}, monitorEventLoopDelay: () => ({ enable(){}, disable(){}, min:0, max:0, mean:0, percentile(){return 0;} }), createHistogram: () => ({}) }),
    'diagnostics_channel': (() => { try { const m = import.meta; /* dynamic import won't work here */ } catch {} class Ch { constructor(n) { this.name=n; this._subscribers=[]; this._parentWrap=undefined; } get hasSubscribers() { return this._subscribers.length>0; } subscribe(fn) { this._subscribers.push(fn); } unsubscribe(fn) { this._subscribers=this._subscribers.filter(s=>s!==fn); } publish(m) { for(const fn of this._subscribers) fn(m,this.name); } bindStore(){} unbindStore(){} runStores(d,fn,...a){return fn(...a);} } const chs=new Map(); const ch=(n)=>{if(!chs.has(n))chs.set(n,new Ch(n));return chs.get(n);}; return { Channel:Ch, channel:ch, hasSubscribers:(n)=>chs.has(n)&&chs.get(n).hasSubscribers, subscribe:(n,fn)=>ch(n).subscribe(fn), unsubscribe:(n,fn)=>ch(n).unsubscribe(fn), tracingChannel:(n)=>({start:ch(n+':start'),end:ch(n+':end'),asyncStart:ch(n+':asyncStart'),asyncEnd:ch(n+':asyncEnd'),error:ch(n+':error'),hasSubscribers:false,subscribe(){},unsubscribe(){},traceSync(fn,c,t,...a){return fn.apply(t,a);},tracePromise(fn,c,t,...a){return fn.apply(t,a);},traceCallback(fn){return fn;}}), TracingChannel:class{constructor(){} subscribe(){} unsubscribe(){}} }; })(),

    // ── Third-party shims ──
    'undici': undiciStub,
    'node-pty': nodePtyShim,
  };

  // Register all builtins + node: prefixed aliases
  for (const [name, impl] of Object.entries(builtins)) {
    if (edgeInstance._registerBuiltinOverride) {
      edgeInstance._registerBuiltinOverride(name, impl);
      // Also register with node: prefix for ESM-style imports
      if (!name.includes('-') && !name.includes('/') || name === 'child_process' ||
          name === 'async_hooks' || name === 'worker_threads' || name === 'string_decoder' ||
          name === 'diagnostics_channel' ||
          name === 'readline/promises' || name === 'timers/promises' || name === 'stream/consumers' ||
          name === 'inspector/promises' || name === 'assert/strict' || name === 'path/posix' ||
          name === 'fs/promises') {
        edgeInstance._registerBuiltinOverride('node:' + name, impl);
      }
    }
  }

  // Wire up module shim to use the runtime's require
  if (edgeInstance._memfsRequire) {
    _setRequire(edgeInstance._memfsRequire);
  }
  _setBuiltinList(Object.keys(builtins));
  // Also populate the sync builtin cache for createRequire
  for (const [name, impl] of Object.entries(builtins)) {
    _setBuiltinModule(name, impl);
    if (!name.includes('-') && !name.includes('/') || name === 'child_process' ||
        name === 'async_hooks' || name === 'worker_threads' || name === 'string_decoder') {
      _setBuiltinModule('node:' + name, impl);
    }
  }

  return builtins;
}
