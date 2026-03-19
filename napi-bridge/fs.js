/**
 * fs — Node.js-compatible filesystem module backed by MEMFS.
 *
 * Provides sync, async (callback), and promise-based APIs.
 * Error shapes match Node.js exactly: { code, errno, syscall, path, message }.
 *
 * Architecture:
 *   - All paths resolved against process.cwd() via resolvePath()
 *   - Backed by a MEMFS instance (defaultMemfs for backward compat,
 *     or a per-runtime instance via createFsModule())
 *   - No direct _resolve() access — all ops go through MEMFS public API
 */

import { defaultMemfs, createFsError, resolvePath } from './memfs.js';
import { Readable, Writable } from './streams.js';

const _encoder = new TextEncoder();
const _decoder = new TextDecoder('utf-8');

// ─── Encoding helpers ───────────────────────────────────────────────

function toBuffer(data, encoding) {
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') {
    if (!encoding || encoding === 'utf8' || encoding === 'utf-8') {
      return _encoder.encode(data);
    }
    // For other encodings, encode byte-by-byte
    const buf = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) buf[i] = data.charCodeAt(i) & 0xff;
    return buf;
  }
  return _encoder.encode(String(data));
}

function fromBuffer(buf, encoding) {
  if (!encoding) return buf;
  if (encoding === 'utf8' || encoding === 'utf-8') {
    return _decoder.decode(buf);
  }
  // latin1/binary
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return s;
}

function parseOptions(options, defaults) {
  if (typeof options === 'string') return { ...defaults, encoding: options };
  if (options && typeof options === 'object') return { ...defaults, ...options };
  return defaults;
}

// ─── Factory: create fs module bound to a specific MEMFS instance ───

export function createFsModule(memfs, getCwd) {
  // getCwd returns the current working directory for relative path resolution
  const _cwd = getCwd || (() => '/');

  function _r(p) {
    // Canonical path resolution: relative paths resolved against cwd
    return resolvePath(String(p), _cwd());
  }

  // ─── Sync APIs ──────────────────────────────────────────────────────

  function readFileSync(path, options) {
    const opts = parseOptions(options, { encoding: null });
    const data = memfs.readFile(_r(path));
    return opts.encoding ? fromBuffer(data, opts.encoding) : new Uint8Array(data);
  }

  function writeFileSync(path, data, options) {
    const opts = parseOptions(options, { encoding: 'utf8' });
    if (typeof data === 'string') {
      memfs.writeFile(_r(path), toBuffer(data, opts.encoding));
    } else {
      memfs.writeFile(_r(path), data);
    }
  }

  function readdirSync(path, options) {
    const opts = parseOptions(options, { withFileTypes: false });
    return memfs.readdir(_r(path), opts.withFileTypes);
  }

  function statSync(path) {
    return memfs.stat(_r(path));
  }

  function mkdirSync(path, options) {
    const opts = parseOptions(options, { recursive: false });
    memfs.mkdir(_r(path), opts.recursive);
  }

  function unlinkSync(path) {
    memfs.unlink(_r(path));
  }

  function renameSync(oldPath, newPath) {
    memfs.rename(_r(oldPath), _r(newPath));
  }

  function existsSync(path) {
    try {
      return memfs.exists(_r(path));
    } catch {
      return false;
    }
  }

  function accessSync(path, mode) {
    memfs.access(_r(path));
  }

  function realpathSync(path) {
    return memfs.realpath(_r(path));
  }

  function openSync(path, flags) {
    return memfs.open(_r(path), flags);
  }

  function readSync(fd, buffer, offset, length, position) {
    return memfs.readFd(fd, buffer, offset, length, position);
  }

  function writeSync(fd, buffer, offset, length, position) {
    return memfs.writeFd(fd, buffer, offset, length, position);
  }

  function closeSync(fd) {
    memfs.close(fd);
  }

  function rmdirSync(path) {
    memfs.rmdir(_r(path));
  }

  // lstat = stat (no symlinks in v1)
  function lstatSync(path) {
    return statSync(path);
  }

  function chmodSync(path, mode) {
    // No-op in MEMFS (no real permissions), but don't throw
    memfs.access(_r(path)); // throws ENOENT if missing
  }

  function copyFileSync(src, dest) {
    const data = memfs.readFile(_r(src));
    memfs.writeFile(_r(dest), new Uint8Array(data));
  }

  function rmSync(path, options) {
    const opts = parseOptions(options, { recursive: false, force: false });
    const resolved = _r(path);
    try {
      const s = memfs.stat(resolved);
      if (s.isDirectory()) {
        if (opts.recursive) {
          const entries = memfs.readdir(resolved);
          for (const name of entries) {
            rmSync(resolved + '/' + name, opts);
          }
          memfs.rmdir(resolved);
        } else {
          memfs.rmdir(resolved);
        }
      } else {
        memfs.unlink(resolved);
      }
    } catch (err) {
      if (!opts.force || err.code !== 'ENOENT') throw err;
    }
  }

  // ─── Async (callback) APIs ──────────────────────────────────────────

  function wrapAsync(syncFn) {
    return (...args) => {
      const callback = args.pop();
      try {
        const result = syncFn(...args);
        Promise.resolve().then(() => callback(null, result));
      } catch (err) {
        Promise.resolve().then(() => callback(err));
      }
    };
  }

  const readFile = wrapAsync(readFileSync);
  const writeFile = wrapAsync(writeFileSync);
  const readdir = wrapAsync(readdirSync);
  const stat = wrapAsync(statSync);
  const mkdir = wrapAsync(mkdirSync);
  const unlink = wrapAsync(unlinkSync);
  const rename = wrapAsync(renameSync);
  const access = wrapAsync(accessSync);
  const realpath = wrapAsync(realpathSync);
  const open = wrapAsync(openSync);
  const close = wrapAsync(closeSync);
  const rmdir = wrapAsync(rmdirSync);
  const lstat = wrapAsync(lstatSync);
  const chmod = wrapAsync(chmodSync);
  const copyFile = wrapAsync(copyFileSync);
  const rm = wrapAsync(rmSync);

  // ─── Promises API ───────────────────────────────────────────────────

  function wrapPromise(syncFn) {
    return (...args) => {
      return new Promise((resolve, reject) => {
        try {
          resolve(syncFn(...args));
        } catch (err) {
          reject(err);
        }
      });
    };
  }

  const promises = {
    readFile: wrapPromise(readFileSync),
    writeFile: wrapPromise(writeFileSync),
    readdir: wrapPromise(readdirSync),
    stat: wrapPromise(statSync),
    mkdir: wrapPromise(mkdirSync),
    unlink: wrapPromise(unlinkSync),
    rename: wrapPromise(renameSync),
    access: wrapPromise(accessSync),
    realpath: wrapPromise(realpathSync),
    rmdir: wrapPromise(rmdirSync),
    lstat: wrapPromise(lstatSync),
    chmod: wrapPromise(chmodSync),
    copyFile: wrapPromise(copyFileSync),
    rm: wrapPromise(rmSync),
  };

  // ─── Streaming APIs ─────────────────────────────────────────────────

  function createReadStream(path, options) {
    const opts = parseOptions(options, { encoding: null, highWaterMark: 65536 });
    const resolved = _r(path);
    let started = false;
    const stream = new Readable({
      highWaterMark: opts.highWaterMark,
      read() {
        if (started) return;
        started = true;
        try {
          const data = memfs.readFile(resolved);
          this.push(opts.encoding ? fromBuffer(data, opts.encoding) : new Uint8Array(data));
          this.push(null);
        } catch (err) {
          this.destroy(err);
        }
      },
    });
    stream.path = path;
    return stream;
  }

  function createWriteStream(path, options) {
    const opts = parseOptions(options, { encoding: 'utf8' });
    const resolved = _r(path);
    const chunks = [];
    const stream = new Writable({
      write(chunk, encoding, callback) {
        try {
          if (typeof chunk === 'string') {
            chunks.push(toBuffer(chunk, encoding));
          } else {
            chunks.push(new Uint8Array(chunk));
          }
          callback();
        } catch (err) {
          callback(err);
        }
      },
      final(callback) {
        try {
          const totalLen = chunks.reduce((sum, c) => sum + c.byteLength, 0);
          const combined = new Uint8Array(totalLen);
          let offset = 0;
          for (const c of chunks) {
            combined.set(c, offset);
            offset += c.byteLength;
          }
          memfs.writeFile(resolved, combined);
          callback();
        } catch (err) {
          callback(err);
        }
      },
    });
    stream.path = path;
    return stream;
  }

  // ─── fs object ─────────────────────────────────────────────────────

  return {
    readFileSync,
    writeFileSync,
    readdirSync,
    statSync,
    mkdirSync,
    unlinkSync,
    renameSync,
    existsSync,
    accessSync,
    realpathSync,
    openSync,
    readSync,
    writeSync,
    closeSync,
    rmdirSync,
    lstatSync,
    chmodSync,
    copyFileSync,
    rmSync,

    readFile,
    writeFile,
    readdir,
    stat,
    mkdir,
    unlink,
    rename,
    access,
    realpath,
    open,
    close,
    rmdir,
    lstat,
    chmod,
    copyFile,
    rm,

    createReadStream,
    createWriteStream,

    promises,

    // Constants
    constants: {
      F_OK: 0,
      R_OK: 4,
      W_OK: 2,
      X_OK: 1,
    },
  };
}

// ─── Default module export (backward compatible) ─────────────────────
// Uses defaultMemfs singleton with cwd = '/' (no process bridge available
// at import time). The runtime wires up process.cwd() later via createFsModule().

const fs = createFsModule(defaultMemfs, () => '/');

// ─── ESM named exports ──────────────────────────────────────────────
// Required for browser import { readFileSync } from "node:fs" via import map.

export const {
  readFileSync, writeFileSync, readdirSync, statSync, mkdirSync,
  unlinkSync, renameSync, existsSync, accessSync, realpathSync,
  openSync, readSync, writeSync, closeSync, rmdirSync,
  lstatSync, chmodSync, copyFileSync, rmSync,
  readFile, writeFile, readdir, stat, mkdir, unlink, rename,
  access, realpath, open, close, rmdir,
  lstat, chmod, copyFile, rm,
  createReadStream, createWriteStream,
  constants,
} = fs;

export const promises = fs.promises;

export default fs;
export { fs };
