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
import { EventEmitter } from './eventemitter.js';
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
  const _watchers = new Map();
  const _statWatchers = new Map();

  function _r(p) {
    // Canonical path resolution: relative paths resolved against cwd
    return resolvePath(String(p), _cwd());
  }

  function cloneStats(stat) {
    return stat ? {
      dev: stat.dev,
      ino: stat.ino,
      mode: stat.mode,
      nlink: stat.nlink,
      uid: stat.uid,
      gid: stat.gid,
      size: stat.size,
      atime: new Date(stat.atime),
      mtime: new Date(stat.mtime),
      ctime: new Date(stat.ctime),
      birthtime: new Date(stat.birthtime),
      blksize: stat.blksize,
      blocks: stat.blocks,
      isFile: () => stat.isFile(),
      isDirectory: () => stat.isDirectory(),
      isSymbolicLink: () => stat.isSymbolicLink(),
      isBlockDevice: () => stat.isBlockDevice(),
      isCharacterDevice: () => stat.isCharacterDevice(),
      isFIFO: () => stat.isFIFO(),
      isSocket: () => stat.isSocket(),
    } : undefined;
  }

  function tryStat(path) {
    try {
      return cloneStats(memfs.stat(path));
    } catch {
      return undefined;
    }
  }

  function statsEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.ino === b.ino
      && a.size === b.size
      && a.mtime.getTime() === b.mtime.getTime()
      && a.ctime.getTime() === b.ctime.getTime()
      && a.mode === b.mode;
  }

  function emitWatchEvent(path, eventType) {
    const targets = [path];
    if (path !== '/') {
      const idx = path.lastIndexOf('/');
      targets.push(idx <= 0 ? '/' : path.slice(0, idx));
    }
    for (const target of targets) {
      const listeners = _watchers.get(target);
      if (!listeners) continue;
      for (const watcher of listeners) {
        queueMicrotask(() => {
          if (!watcher.closed) {
            watcher.emit('change', eventType, path.split('/').pop() || path);
          }
        });
      }
    }
  }

  function notifyMutation(path, eventType = 'change') {
    emitWatchEvent(path, eventType);
  }

  function startStatWatcher(resolved, options, listener) {
    const interval = Math.max(1, Number(options?.interval) || 5007);
    const entry = _statWatchers.get(resolved) || { listeners: new Set(), prev: tryStat(resolved), timer: null };
    entry.listeners.add(listener);
    if (!entry.timer) {
      entry.timer = setInterval(() => {
        const next = tryStat(resolved);
        if (statsEqual(entry.prev, next)) {
          return;
        }
        const prev = entry.prev;
        entry.prev = next;
        for (const cb of entry.listeners) {
          queueMicrotask(() => cb(next || zeroStats(), prev || zeroStats()));
        }
      }, interval);
      entry.timer.unref?.();
    }
    _statWatchers.set(resolved, entry);
  }

  function stopStatWatcher(resolved, listener) {
    const entry = _statWatchers.get(resolved);
    if (!entry) return;
    if (listener) {
      entry.listeners.delete(listener);
    } else {
      entry.listeners.clear();
    }
    if (entry.listeners.size === 0) {
      clearInterval(entry.timer);
      _statWatchers.delete(resolved);
    }
  }

  function zeroStats() {
    const now = new Date(0);
    return {
      dev: 0, ino: 0, mode: 0, nlink: 0, uid: 0, gid: 0, size: 0,
      atime: now, mtime: now, ctime: now, birthtime: now,
      blksize: 0, blocks: 0,
      isFile: () => false,
      isDirectory: () => false,
      isSymbolicLink: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isFIFO: () => false,
      isSocket: () => false,
    };
  }

  // ─── Sync APIs ──────────────────────────────────────────────────────

  function readFileSync(path, options) {
    const opts = parseOptions(options, { encoding: null });
    const data = memfs.readFile(_r(path));
    return opts.encoding ? fromBuffer(data, opts.encoding) : new Uint8Array(data);
  }

  function writeFileSync(path, data, options) {
    const opts = parseOptions(options, { encoding: 'utf8', flag: 'w' });
    const resolved = _r(path);
    const flag = String(opts.flag || 'w');
    const body = typeof data === 'string'
      ? toBuffer(data, opts.encoding)
      : (data instanceof Uint8Array ? new Uint8Array(data) : toBuffer(String(data), opts.encoding));
    const present = existsSync(resolved);

    // Flag shapes exercised by real Node apps (see claude-js teammateMailbox, toolResultStorage, etc.)
    if (flag === 'wx' || flag === 'xw') {
      if (present) throw createFsError('EEXIST', 'open', resolved);
      memfs.writeFile(resolved, body);
      notifyMutation(resolved, 'change');
      return;
    }
    if (flag === 'ax' || flag === 'xa') {
      if (present) throw createFsError('EEXIST', 'open', resolved);
      memfs.writeFile(resolved, body);
      notifyMutation(resolved, 'change');
      return;
    }
    if (flag === 'r+') {
      if (!present) throw createFsError('ENOENT', 'open', resolved);
      memfs.writeFile(resolved, body);
      notifyMutation(resolved, 'change');
      return;
    }
    if (flag === 'a' || flag === 'ax') {
      if (flag === 'ax' && present) throw createFsError('EEXIST', 'open', resolved);
      if (present) {
        const existing = memfs.readFile(resolved);
        const combined = new Uint8Array(existing.byteLength + body.byteLength);
        combined.set(existing, 0);
        combined.set(body, existing.byteLength);
        memfs.writeFile(resolved, combined);
      } else {
        memfs.writeFile(resolved, body);
      }
      notifyMutation(resolved, 'change');
      return;
    }

    memfs.writeFile(resolved, body);
    notifyMutation(resolved, 'change');
  }

  function appendFileSync(path, data, options) {
    const opts = parseOptions(options, { encoding: 'utf8' });
    const resolved = _r(path);
    const nextChunk = typeof data === 'string'
      ? toBuffer(data, opts.encoding)
      : data instanceof Uint8Array
        ? new Uint8Array(data)
        : toBuffer(String(data), opts.encoding);
    const existing = existsSync(resolved) ? memfs.readFile(resolved) : new Uint8Array(0);
    const combined = new Uint8Array(existing.byteLength + nextChunk.byteLength);
    combined.set(existing, 0);
    combined.set(nextChunk, existing.byteLength);
    memfs.writeFile(resolved, combined);
    notifyMutation(resolved, 'change');
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
    const resolved = _r(path);
    memfs.mkdir(resolved, opts.recursive);
    notifyMutation(resolved, 'rename');
  }

  function unlinkSync(path) {
    const resolved = _r(path);
    memfs.unlink(resolved);
    notifyMutation(resolved, 'rename');
  }

  function renameSync(oldPath, newPath) {
    const oldResolved = _r(oldPath);
    const newResolved = _r(newPath);
    memfs.rename(oldResolved, newResolved);
    notifyMutation(oldResolved, 'rename');
    notifyMutation(newResolved, 'rename');
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
    const resolved = _r(path);
    memfs.rmdir(resolved);
    notifyMutation(resolved, 'rename');
  }

  // lstat = stat (no symlinks in v1)
  function lstatSync(path) {
    return statSync(path);
  }

  function chmodSync(path, mode) {
    // No-op in MEMFS (no real permissions), but don't throw
    memfs.access(_r(path)); // throws ENOENT if missing
  }

  function copyFileSync(src, dest, flags) {
    const resolved = _r(dest);
    const excl = Number(flags || 0) & 1; // COPYFILE_EXCL
    if (excl && existsSync(resolved)) {
      throw createFsError('EEXIST', 'copyfile', resolved);
    }
    const data = memfs.readFile(_r(src));
    memfs.writeFile(resolved, new Uint8Array(data));
    notifyMutation(resolved, 'change');
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
      notifyMutation(resolved, 'rename');
    } catch (err) {
      if (!opts.force || err.code !== 'ENOENT') throw err;
    }
  }

  // ─── Async (callback) APIs ──────────────────────────────────────────

  function wrapAsync(syncFn) {
    return (...args) => {
      const maybeCallback = args[args.length - 1];
      if (typeof maybeCallback !== 'function') {
        return syncFn(...args);
      }
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
  const appendFile = wrapAsync(appendFileSync);

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
    appendFile: wrapPromise(appendFileSync),
  };

  // ─── Streaming APIs ─────────────────────────────────────────────────

  function createReadStream(path, options) {
    const opts = parseOptions(options, { encoding: null, highWaterMark: 65536 });
    const resolved = _r(path);
    let fd = null;
    let position = 0;
    let fileSize = 0;
    const hwm = opts.highWaterMark;
    const stream = new Readable({
      highWaterMark: hwm,
      read() {
        try {
          // Lazy open on first read
          if (fd === null) {
            fileSize = memfs.stat(resolved).size;
            fd = memfs.open(resolved, 'r');
            position = 0;
          }
          if (position >= fileSize) {
            // Close fd and signal EOF
            memfs.close(fd);
            fd = null;
            this.push(null);
            return;
          }
          // Read one chunk up to highWaterMark
          const chunkSize = Math.min(hwm, fileSize - position);
          const buf = new Uint8Array(chunkSize);
          const bytesRead = memfs.readFd(fd, buf, 0, chunkSize, position);
          position += bytesRead;
          if (bytesRead === 0) {
            memfs.close(fd);
            fd = null;
            this.push(null);
            return;
          }
          const chunk = bytesRead < chunkSize ? buf.subarray(0, bytesRead) : buf;
          this.push(opts.encoding ? fromBuffer(chunk, opts.encoding) : chunk);
        } catch (err) {
          if (fd !== null) { try { memfs.close(fd); } catch {} fd = null; }
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
    let fd = null;
    const stream = new Writable({
      write(chunk, encoding, callback) {
        try {
          // Lazy create file and open fd on first write
          if (fd === null) {
            // Ensure file exists (create empty if new, truncate if existing)
            memfs.writeFile(resolved, new Uint8Array(0));
            fd = memfs.open(resolved, 'w');
          }
          const buf = typeof chunk === 'string' ? toBuffer(chunk, encoding) : new Uint8Array(chunk);
          memfs.writeFd(fd, buf, 0, buf.byteLength, null);
          notifyMutation(resolved, 'change');
          callback();
        } catch (err) {
          callback(err);
        }
      },
      final(callback) {
        try {
          if (fd !== null) {
            memfs.close(fd);
            fd = null;
          }
          callback();
        } catch (err) {
          callback(err);
        }
      },
      destroy(err, callback) {
        if (fd !== null) { try { memfs.close(fd); } catch {} fd = null; }
        callback(err);
      },
    });
    stream.path = path;
    return stream;
  }

  function watch(path, options, listener) {
    if (typeof options === 'function') {
      listener = options;
      options = {};
    }
    const resolved = _r(path);
    const watcher = new EventEmitter();
    watcher.closed = false;
    watcher.close = () => {
      if (watcher.closed) return;
      watcher.closed = true;
      const listeners = _watchers.get(resolved);
      if (listeners) {
        listeners.delete(watcher);
        if (listeners.size === 0) {
          _watchers.delete(resolved);
        }
      }
      watcher.emit('close');
    };
    if (listener) {
      watcher.on('change', listener);
    }
    const listeners = _watchers.get(resolved) || new Set();
    listeners.add(watcher);
    _watchers.set(resolved, listeners);
    return watcher;
  }

  function watchFile(path, options, listener) {
    if (typeof options === 'function') {
      listener = options;
      options = {};
    }
    if (typeof listener !== 'function') {
      return;
    }
    startStatWatcher(_r(path), options, listener);
  }

  function unwatchFile(path, listener) {
    stopStatWatcher(_r(path), listener);
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
    appendFile,

    createReadStream,
    createWriteStream,
    mkdirTree: (path) => mkdirSync(path, { recursive: true }),

    // Stubs for methods that don't apply to MEMFS but shouldn't throw
    utimes: (path, atime, mtime, cb) => { if (typeof cb === 'function') cb(null); },
    utimesSync: () => {},
    futimes: (fd, atime, mtime, cb) => { if (typeof cb === 'function') cb(null); },
    futimesSync: () => {},
    chown: (path, uid, gid, cb) => { if (typeof cb === 'function') cb(null); },
    chownSync: () => {},
    fchown: (fd, uid, gid, cb) => { if (typeof cb === 'function') cb(null); },
    fchownSync: () => {},
    lchown: (path, uid, gid, cb) => { if (typeof cb === 'function') cb(null); },
    lchownSync: () => {},
    fchmod: (fd, mode, cb) => { if (typeof cb === 'function') cb(null); },
    fchmodSync: () => {},
    lchmod: (path, mode, cb) => { if (typeof cb === 'function') cb(null); },
    lchmodSync: () => {},
    fstat: (fd, opts, cb) => { if (typeof opts === 'function') { cb = opts; } if (typeof cb === 'function') cb(null, { isFile: () => true, isDirectory: () => false, size: 0 }); },
    fstatSync: () => ({ isFile: () => true, isDirectory: () => false, size: 0 }),
    fsync: (fd, cb) => { if (typeof cb === 'function') cb(null); },
    fsyncSync: () => {},
    fdatasync: (fd, cb) => { if (typeof cb === 'function') cb(null); },
    fdatasyncSync: () => {},
    link: (src, dst, cb) => { if (typeof cb === 'function') cb(null); },
    linkSync: () => {},
    symlink: (target, path, type, cb) => { if (typeof type === 'function') { cb = type; } if (typeof cb === 'function') cb(null); },
    symlinkSync: () => {},
    readlink: (path, opts, cb) => { if (typeof opts === 'function') { cb = opts; } if (typeof cb === 'function') cb(null, path); },
    readlinkSync: (path) => path,
    truncate: (path, len, cb) => { if (typeof len === 'function') { cb = len; } if (typeof cb === 'function') cb(null); },
    truncateSync: () => {},
    ftruncate: (fd, len, cb) => { if (typeof len === 'function') { cb = len; } if (typeof cb === 'function') cb(null); },
    ftruncateSync: () => {},
    watch,
    watchFile,
    unwatchFile,
    appendFile,
    appendFileSync,

    promises,

    // Constants
    constants: {
      F_OK: 0,
      R_OK: 4,
      W_OK: 2,
      X_OK: 1,
      COPYFILE_EXCL: 1,
      COPYFILE_FICLONE: 2,
      COPYFILE_FICLONE_FORCE: 4,
    },
  };
}

// ─── Default module export (backward compatible) ─────────────────────
// ESM import-map consumers resolve through this mutable facade so they can
// follow the per-runtime MEMFS instance installed by initEdgeJS().

let _activeFs = createFsModule(defaultMemfs, () => '/');

const promises = new Proxy({}, {
  get(_target, prop) {
    const value = _activeFs.promises?.[prop];
    if (typeof value === 'function') {
      return (...args) => _activeFs.promises[prop](...args);
    }
    return value;
  },
});

const fs = new Proxy({}, {
  get(_target, prop) {
    if (prop === 'promises') {
      return promises;
    }
    const value = _activeFs[prop];
    if (typeof value === 'function') {
      return (...args) => _activeFs[prop](...args);
    }
    return value;
  },
});

export function setActiveFsModule(fsModule) {
  _activeFs = fsModule || createFsModule(defaultMemfs, () => '/');
  return _activeFs;
}

// ─── ESM named exports ──────────────────────────────────────────────
// Required for browser import { readFileSync } from "node:fs" via import map.

export const readFileSync = (...args) => fs.readFileSync(...args);
export const writeFileSync = (...args) => fs.writeFileSync(...args);
export const readdirSync = (...args) => fs.readdirSync(...args);
export const statSync = (...args) => fs.statSync(...args);
export const mkdirSync = (...args) => fs.mkdirSync(...args);
export const unlinkSync = (...args) => fs.unlinkSync(...args);
export const renameSync = (...args) => fs.renameSync(...args);
export const existsSync = (...args) => fs.existsSync(...args);
export const accessSync = (...args) => fs.accessSync(...args);
export const realpathSync = (...args) => fs.realpathSync(...args);
export const openSync = (...args) => fs.openSync(...args);
export const readSync = (...args) => fs.readSync(...args);
export const writeSync = (...args) => fs.writeSync(...args);
export const closeSync = (...args) => fs.closeSync(...args);
export const rmdirSync = (...args) => fs.rmdirSync(...args);
export const lstatSync = (...args) => fs.lstatSync(...args);
export const chmodSync = (...args) => fs.chmodSync(...args);
export const copyFileSync = (...args) => fs.copyFileSync(...args);
export const rmSync = (...args) => fs.rmSync(...args);
export const readFile = (...args) => fs.readFile(...args);
export const writeFile = (...args) => fs.writeFile(...args);
export const readdir = (...args) => fs.readdir(...args);
export const stat = (...args) => fs.stat(...args);
export const mkdir = (...args) => fs.mkdir(...args);
export const unlink = (...args) => fs.unlink(...args);
export const rename = (...args) => fs.rename(...args);
export const access = (...args) => fs.access(...args);
export const realpath = (...args) => fs.realpath(...args);
export const open = (...args) => fs.open(...args);
export const close = (...args) => fs.close(...args);
export const rmdir = (...args) => fs.rmdir(...args);
export const lstat = (...args) => fs.lstat(...args);
export const chmod = (...args) => fs.chmod(...args);
export const copyFile = (...args) => fs.copyFile(...args);
export const rm = (...args) => fs.rm(...args);
export const createReadStream = (...args) => fs.createReadStream(...args);
export const createWriteStream = (...args) => fs.createWriteStream(...args);
export const watch = (...args) => fs.watch(...args);
export const watchFile = (...args) => fs.watchFile(...args);
export const unwatchFile = (...args) => fs.unwatchFile(...args);
export const constants = fs.constants;

export { promises };
export default fs;
export { fs };
