/**
 * zlib — Node.js-compatible zlib module for browser/Wasm.
 *
 * Uses fflate for compression engine, wraps with Node.js Transform stream API.
 */

import { Transform, PassThrough } from './streams.js';
// Bare specifier: import map (web) → CDN; Node resolves via package.json "fflate".
// Do not use ../node_modules/… — on GitHub Pages that becomes /v9/node_modules/… (404).
import * as fflate from 'fflate';

// ─── Sync APIs ───────────────────────────────────────────────────────

export function gzipSync(buf, options) {
  const input = _toUint8Array(buf);
  return fflate.gzipSync(input, options || {});
}

export function gunzipSync(buf) {
  const input = _toUint8Array(buf);
  return fflate.gunzipSync(input);
}

export function deflateSync(buf, options) {
  const input = _toUint8Array(buf);
  return fflate.zlibSync(input, options || {});
}

export function inflateSync(buf) {
  const input = _toUint8Array(buf);
  return fflate.unzlibSync(input);
}

export function deflateRawSync(buf, options) {
  const input = _toUint8Array(buf);
  return fflate.deflateSync(input, options || {});
}

export function inflateRawSync(buf) {
  const input = _toUint8Array(buf);
  return fflate.inflateSync(input);
}

export function unzipSync(buf) {
  const input = _toUint8Array(buf);
  return fflate.unzipSync(input);
}

export function brotliCompressSync() {
  throw new Error('Brotli is not supported in browser environment');
}

export function brotliDecompressSync() {
  throw new Error('Brotli is not supported in browser environment');
}

// ─── Callback APIs ──────────────────────────────────────────────────

export function gzip(buf, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  try {
    const result = gzipSync(buf, options);
    if (callback) Promise.resolve().then(() => callback(null, result));
  } catch (err) {
    if (callback) Promise.resolve().then(() => callback(err));
  }
}

export function gunzip(buf, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  try {
    const result = gunzipSync(buf);
    if (callback) Promise.resolve().then(() => callback(null, result));
  } catch (err) {
    if (callback) Promise.resolve().then(() => callback(err));
  }
}

export function deflate(buf, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  try {
    const result = deflateSync(buf, options);
    if (callback) Promise.resolve().then(() => callback(null, result));
  } catch (err) {
    if (callback) Promise.resolve().then(() => callback(err));
  }
}

export function inflate(buf, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  try {
    const result = inflateSync(buf);
    if (callback) Promise.resolve().then(() => callback(null, result));
  } catch (err) {
    if (callback) Promise.resolve().then(() => callback(err));
  }
}

// ─── Stream APIs ────────────────────────────────────────────────────

export function createGzip(options) {
  // Accumulate all chunks, compress as one stream in flush
  const chunks = [];
  return new Transform({
    transform(chunk, encoding, callback) {
      chunks.push(_toUint8Array(chunk));
      callback();
    },
    flush(callback) {
      try {
        const combined = _concatUint8Arrays(chunks);
        callback(null, fflate.gzipSync(combined, options || {}));
      } catch (err) { callback(err); }
    },
  });
}

export function createGunzip() {
  const chunks = [];
  return new Transform({
    transform(chunk, encoding, callback) {
      chunks.push(_toUint8Array(chunk));
      callback();
    },
    flush(callback) {
      try {
        const combined = _concatUint8Arrays(chunks);
        callback(null, fflate.gunzipSync(combined));
      } catch (err) { callback(err); }
    },
  });
}

export function createDeflate(options) {
  // Accumulate all chunks, compress as one zlib stream in flush
  const chunks = [];
  return new Transform({
    transform(chunk, encoding, callback) {
      chunks.push(_toUint8Array(chunk));
      callback();
    },
    flush(callback) {
      try {
        const combined = _concatUint8Arrays(chunks);
        callback(null, fflate.zlibSync(combined, options || {}));
      } catch (err) { callback(err); }
    },
  });
}

export function createInflate() {
  const chunks = [];
  return new Transform({
    transform(chunk, encoding, callback) {
      chunks.push(_toUint8Array(chunk));
      callback();
    },
    flush(callback) {
      try {
        const combined = _concatUint8Arrays(chunks);
        callback(null, fflate.unzlibSync(combined));
      } catch (err) { callback(err); }
    },
  });
}

export function createDeflateRaw(options) {
  const chunks = [];
  return new Transform({
    transform(chunk, encoding, callback) {
      chunks.push(_toUint8Array(chunk));
      callback();
    },
    flush(callback) {
      try {
        const combined = _concatUint8Arrays(chunks);
        callback(null, fflate.deflateSync(combined, options || {}));
      } catch (err) { callback(err); }
    },
  });
}
export function createInflateRaw() {
  const chunks = [];
  return new Transform({
    transform(chunk, encoding, callback) {
      chunks.push(_toUint8Array(chunk));
      callback();
    },
    flush(callback) {
      try {
        const combined = _concatUint8Arrays(chunks);
        callback(null, fflate.inflateSync(combined));
      } catch (err) { callback(err); }
    },
  });
}

export function createBrotliCompress() {
  throw new Error('Brotli is not supported in browser environment');
}
export function createBrotliDecompress() {
  throw new Error('Brotli is not supported in browser environment');
}
export function createUnzip() { return createGunzip(); }

// ─── Constants ──────────────────────────────────────────────────────

export const constants = {
  Z_NO_FLUSH: 0,
  Z_PARTIAL_FLUSH: 1,
  Z_SYNC_FLUSH: 2,
  Z_FULL_FLUSH: 3,
  Z_FINISH: 4,
  Z_BLOCK: 5,
  Z_TREES: 6,
  Z_OK: 0,
  Z_STREAM_END: 1,
  Z_NEED_DICT: 2,
  Z_ERRNO: -1,
  Z_STREAM_ERROR: -2,
  Z_DATA_ERROR: -3,
  Z_MEM_ERROR: -4,
  Z_BUF_ERROR: -5,
  Z_VERSION_ERROR: -6,
  Z_NO_COMPRESSION: 0,
  Z_BEST_SPEED: 1,
  Z_BEST_COMPRESSION: 9,
  Z_DEFAULT_COMPRESSION: -1,
  Z_FILTERED: 1,
  Z_HUFFMAN_ONLY: 2,
  Z_RLE: 3,
  Z_FIXED: 4,
  Z_DEFAULT_STRATEGY: 0,
  Z_BINARY: 0,
  Z_TEXT: 1,
  Z_ASCII: 1,
  Z_UNKNOWN: 2,
  Z_DEFLATED: 8,
  Z_MIN_WINDOWBITS: 8,
  Z_MAX_WINDOWBITS: 15,
  Z_DEFAULT_WINDOWBITS: 15,
  Z_MIN_CHUNK: 64,
  Z_MAX_CHUNK: Infinity,
  Z_DEFAULT_CHUNK: 16384,
  Z_MIN_MEMLEVEL: 1,
  Z_MAX_MEMLEVEL: 9,
  Z_DEFAULT_MEMLEVEL: 8,
  Z_MIN_LEVEL: -1,
  Z_MAX_LEVEL: 9,
  Z_DEFAULT_LEVEL: -1,
  BROTLI_DECODE: 0,
  BROTLI_ENCODE: 1,
};

// ─── Helpers ────────────────────────────────────────────────────────

function _toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (typeof input === 'string') return new TextEncoder().encode(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input);
}

function _concatUint8Arrays(arrays) {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const a of arrays) { result.set(a, offset); offset += a.length; }
  return result;
}

export default {
  gzipSync, gunzipSync, deflateSync, inflateSync,
  deflateRawSync, inflateRawSync, unzipSync,
  brotliCompressSync, brotliDecompressSync,
  gzip, gunzip, deflate, inflate,
  createGzip, createGunzip, createDeflate, createInflate,
  createDeflateRaw, createInflateRaw,
  createBrotliCompress, createBrotliDecompress, createUnzip,
  constants,
};
