/**
 * fs — Node.js-compatible filesystem module backed by MEMFS.
 *
 * Provides sync, async (callback), and promise-based APIs.
 * Error shapes match Node.js exactly: { code, errno, syscall, path, message }.
 */

import { defaultMemfs, createFsError } from './memfs.js';
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

// ─── Sync APIs ──────────────────────────────────────────────────────

function readFileSync(path, options) {
  const opts = parseOptions(options, { encoding: null });
  const data = defaultMemfs.readFile(path);
  return opts.encoding ? fromBuffer(data, opts.encoding) : new Uint8Array(data);
}

function writeFileSync(path, data, options) {
  const opts = parseOptions(options, { encoding: 'utf8' });
  if (typeof data === 'string') {
    defaultMemfs.writeFile(path, toBuffer(data, opts.encoding));
  } else {
    defaultMemfs.writeFile(path, data);
  }
}

function readdirSync(path, options) {
  const opts = parseOptions(options, { withFileTypes: false });
  return defaultMemfs.readdir(path, opts.withFileTypes);
}

function statSync(path) {
  return defaultMemfs.stat(path);
}

function mkdirSync(path, options) {
  const opts = parseOptions(options, { recursive: false });
  defaultMemfs.mkdir(path, opts.recursive);
}

function unlinkSync(path) {
  defaultMemfs.unlink(path);
}

function renameSync(oldPath, newPath) {
  defaultMemfs.rename(oldPath, newPath);
}

function existsSync(path) {
  try {
    return defaultMemfs.exists(path);
  } catch {
    return false;
  }
}

function accessSync(path, mode) {
  defaultMemfs.access(path);
}

function realpathSync(path) {
  return defaultMemfs.realpath(path);
}

function openSync(path, flags) {
  return defaultMemfs.open(path, flags);
}

function readSync(fd, buffer, offset, length, position) {
  return defaultMemfs.readFd(fd, buffer, offset, length, position);
}

function writeSync(fd, buffer, offset, length, position) {
  return defaultMemfs.writeFd(fd, buffer, offset, length, position);
}

function closeSync(fd) {
  defaultMemfs.close(fd);
}

function rmdirSync(path) {
  const inode = defaultMemfs._resolve(path);
  if (!inode) throw createFsError('ENOENT', 'rmdir', path);
  if (inode.type !== 'dir') throw createFsError('ENOTDIR', 'rmdir', path);
  if (inode.children.size > 0) throw createFsError('ENOTEMPTY', 'rmdir', path);
  const norm = path.replace(/\/+$/, '') || '/';
  const idx = norm.lastIndexOf('/');
  const parentPath = norm.substring(0, idx) || '/';
  const name = norm.substring(idx + 1);
  const parent = defaultMemfs._resolve(parentPath);
  if (parent) parent.children.delete(name);
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
};

// ─── Streaming APIs ─────────────────────────────────────────────────

function createReadStream(path, options) {
  const opts = parseOptions(options, { encoding: null, highWaterMark: 65536 });
  let started = false;
  const stream = new Readable({
    highWaterMark: opts.highWaterMark,
    read() {
      if (started) return;
      started = true;
      try {
        const data = defaultMemfs.readFile(path);
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
        defaultMemfs.writeFile(path, combined);
        callback();
      } catch (err) {
        callback(err);
      }
    },
  });
  stream.path = path;
  return stream;
}

// ─── fs object (default export) ─────────────────────────────────────

const fs = {
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

export default fs;
export { fs };
