/**
 * MEMFS — In-memory filesystem with POSIX inode tree.
 *
 * Each inode: { type, content, children, ino, version, contentHash, atime, mtime, ctime }
 * Paths resolved via POSIX rules. No symlinks in v1.
 *
 * Architecture:
 *   - Instance-based: createFilesystem() returns an isolated MEMFS instance
 *   - Mutation journal: every write operation emits a structured record
 *   - Content hashing: FNV-1a hash on file content for cheap change detection
 *   - Version tracking: per-inode monotonic version counter
 *   - Watcher hooks: onMutation callback for watch()/sync/snapshot consumers
 *
 * Error shapes match Node.js exactly:
 *   { code: 'ENOENT', errno: -2, syscall: 'open', path: '/missing',
 *     message: "ENOENT: no such file or directory, open '/missing'" }
 */

const _encoder = new TextEncoder();
const _decoder = new TextDecoder('utf-8');

// ─── Error factory ──────────────────────────────────────────────────

const ERRNO_MAP = {
  ENOENT:  -2,
  EISDIR:  -21,
  ENOTDIR: -20,
  EEXIST:  -17,
  EACCES:  -13,
  EBADF:   -9,
  EPERM:   -1,
  ENOTEMPTY: -39,
};

const ERR_MSG = {
  ENOENT:  'no such file or directory',
  EISDIR:  'illegal operation on a directory',
  ENOTDIR: 'not a directory',
  EEXIST:  'file already exists',
  EACCES:  'permission denied',
  EBADF:   'bad file descriptor',
  EPERM:   'operation not permitted',
  ENOTEMPTY: 'directory not empty',
};

export function createFsError(code, syscall, path) {
  const msg = ERR_MSG[code] || 'unknown error';
  const err = new Error(`${code}: ${msg}, ${syscall} '${path}'`);
  err.code = code;
  err.errno = ERRNO_MAP[code] || -1;
  err.syscall = syscall;
  err.path = path;
  return err;
}

// ─── Content hashing (FNV-1a 32-bit) ────────────────────────────────
// Fast, non-cryptographic hash for change detection and snapshot diffing.

function fnv1a(data) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

// ─── Stat object ────────────────────────────────────────────────────

class Stats {
  constructor(inode) {
    const isFile = inode.type === 'file';
    const isDir = inode.type === 'dir';
    this.dev = 1;
    this.ino = inode.ino;
    this.mode = isFile ? 0o100644 : 0o040755;
    this.nlink = 1;
    this.uid = 0;
    this.gid = 0;
    this.size = isFile ? inode.content.byteLength : 0;
    this.atime = new Date(inode.atime);
    this.mtime = new Date(inode.mtime);
    this.ctime = new Date(inode.ctime);
    this.birthtime = new Date(inode.ctime);
    this.blksize = 4096;
    this.blocks = Math.ceil(this.size / 512);
    this._type = inode.type;
  }

  isFile() { return this._type === 'file'; }
  isDirectory() { return this._type === 'dir'; }
  isSymbolicLink() { return false; }
  isBlockDevice() { return false; }
  isCharacterDevice() { return false; }
  isFIFO() { return false; }
  isSocket() { return false; }
}

// ─── Dirent ─────────────────────────────────────────────────────────

class Dirent {
  constructor(name, type) {
    this.name = name;
    this._type = type;
  }
  isFile() { return this._type === 'file'; }
  isDirectory() { return this._type === 'dir'; }
  isSymbolicLink() { return false; }
  isBlockDevice() { return false; }
  isCharacterDevice() { return false; }
  isFIFO() { return false; }
  isSocket() { return false; }
}

// ─── Canonical path resolution ──────────────────────────────────────
// Single shared path normalizer. All subsystems (fs, shell, module
// loader) should use resolvePath() for consistent canonical paths.

export function normalizePath(p) {
  if (typeof p !== 'string' || p.length === 0) return '/';
  const parts = p.split('/').filter(Boolean);
  const result = [];
  for (const part of parts) {
    if (part === '..') { if (result.length > 0) result.pop(); }
    else if (part !== '.') result.push(part);
  }
  return '/' + result.join('/');
}

/**
 * Resolve a path against a cwd. If the path is already absolute,
 * it is normalized. If relative, it is joined with cwd first.
 *
 * This is the ONE canonical resolver that fs, shell, and module
 * loader should all call.
 */
export function resolvePath(p, cwd) {
  if (typeof p !== 'string' || p.length === 0) return normalizePath(cwd || '/');
  if (p.startsWith('/')) return normalizePath(p);
  const base = (cwd || '/').replace(/\/$/, '');
  return normalizePath(base + '/' + p);
}

function parentAndName(p) {
  const norm = normalizePath(p);
  if (norm === '/') return { parent: null, name: '' };
  const idx = norm.lastIndexOf('/');
  const parentPath = norm.substring(0, idx) || '/';
  const name = norm.substring(idx + 1);
  return { parent: parentPath, name };
}

// ─── MEMFS class ────────────────────────────────────────────────────

export class MEMFS {
  constructor() {
    this._root = this._makeInode('dir');
    this._fdTable = new Map();
    this._nextFd = 3; // 0,1,2 reserved for stdin/stdout/stderr
    this._seq = 0;    // monotonic mutation sequence number
    this._journal = []; // mutation log for sync/watchers/snapshots
    this._maxJournal = 10000; // cap journal to prevent unbounded growth
    this._onMutation = null; // optional callback: (record) => void
    this._inoCounter = 1;
  }

  // ── Inode creation (per-instance counter) ──
  _makeInode(type, content) {
    const now = Date.now();
    return {
      type,
      content: content || null,
      children: type === 'dir' ? new Map() : null,
      ino: this._inoCounter++,
      version: 1,
      contentHash: content ? fnv1a(content) : 0,
      atime: now,
      mtime: now,
      ctime: now,
    };
  }

  // ── Mutation journal ──
  _emit(op, path, extra) {
    const record = {
      seq: ++this._seq,
      op,
      path,
      timestamp: Date.now(),
      ...extra,
    };
    this._journal.push(record);
    if (this._journal.length > this._maxJournal) {
      this._journal = this._journal.slice(-Math.floor(this._maxJournal * 0.75));
    }
    if (this._onMutation) {
      try { this._onMutation(record); } catch { /* watcher errors must not break fs */ }
    }
    return record;
  }

  /**
   * Get journal entries since a given sequence number.
   * Useful for incremental sync.
   */
  getJournalSince(seq) {
    const idx = this._journal.findIndex(r => r.seq > seq);
    return idx === -1 ? [] : this._journal.slice(idx);
  }

  /**
   * Register a mutation listener. Returns an unsubscribe function.
   */
  onMutation(callback) {
    const prev = this._onMutation;
    if (!prev) {
      this._onMutation = callback;
    } else {
      // Support multiple listeners by chaining
      this._onMutation = (record) => { prev(record); callback(record); };
    }
    return () => {
      if (this._onMutation === callback) {
        this._onMutation = null;
      }
    };
  }

  // ── Internal: resolve path to inode ──
  _resolve(p) {
    const norm = normalizePath(p);
    if (norm === '/') return this._root;
    const parts = norm.split('/').filter(Boolean);
    let current = this._root;
    for (const part of parts) {
      if (!current || current.type !== 'dir') return null;
      current = current.children.get(part) || null;
    }
    return current;
  }

  // ── Internal: resolve parent dir inode ──
  _resolveParent(p) {
    const { parent } = parentAndName(p);
    if (parent === null) return this._root;
    return this._resolve(parent);
  }

  // ── stat ──
  stat(p) {
    const inode = this._resolve(p);
    if (!inode) throw createFsError('ENOENT', 'stat', p);
    inode.atime = Date.now();
    return new Stats(inode);
  }

  // ── mkdir ──
  mkdir(p, recursive) {
    const norm = normalizePath(p);
    if (recursive) {
      const parts = norm.split('/').filter(Boolean);
      let current = this._root;
      let builtPath = '';
      for (const part of parts) {
        builtPath += '/' + part;
        if (!current.children.has(part)) {
          const child = this._makeInode('dir');
          current.children.set(part, child);
          this._emit('mkdir', builtPath, { ino: child.ino });
        }
        const next = current.children.get(part);
        if (next.type !== 'dir') {
          throw createFsError('ENOTDIR', 'mkdir', norm);
        }
        current = next;
      }
      return;
    }

    // Non-recursive
    const { parent, name } = parentAndName(norm);
    const parentInode = parent === null ? this._root : this._resolve(parent);
    if (!parentInode || parentInode.type !== 'dir') {
      throw createFsError('ENOENT', 'mkdir', norm);
    }
    if (parentInode.children.has(name)) {
      throw createFsError('EEXIST', 'mkdir', norm);
    }
    const child = this._makeInode('dir');
    parentInode.children.set(name, child);
    this._emit('mkdir', norm, { ino: child.ino });
  }

  // ── readFile ──
  readFile(p) {
    const inode = this._resolve(p);
    if (!inode) throw createFsError('ENOENT', 'open', p);
    if (inode.type === 'dir') throw createFsError('EISDIR', 'read', p);
    inode.atime = Date.now();
    return inode.content;
  }

  // ── writeFile ──
  writeFile(p, data) {
    const norm = normalizePath(p);
    const { parent, name } = parentAndName(norm);
    const parentInode = parent === null ? this._root : this._resolve(parent);
    if (!parentInode || parentInode.type !== 'dir') {
      throw createFsError('ENOENT', 'open', norm);
    }

    let content;
    if (typeof data === 'string') {
      content = _encoder.encode(data);
    } else if (data instanceof Uint8Array) {
      // Copy to avoid external mutation
      content = new Uint8Array(data);
    } else {
      content = _encoder.encode(String(data));
    }

    const hash = fnv1a(content);
    const existing = parentInode.children.get(name);
    if (existing) {
      if (existing.type === 'dir') throw createFsError('EISDIR', 'open', norm);
      const oldHash = existing.contentHash;
      existing.content = content;
      existing.contentHash = hash;
      existing.version++;
      const now = Date.now();
      existing.mtime = now;
      existing.ctime = now;
      this._emit('writeFile', norm, {
        ino: existing.ino, version: existing.version,
        oldHash, newHash: hash, size: content.byteLength,
      });
    } else {
      const inode = this._makeInode('file', content);
      inode.contentHash = hash;
      parentInode.children.set(name, inode);
      this._emit('create', norm, {
        ino: inode.ino, version: inode.version,
        newHash: hash, size: content.byteLength,
      });
    }
  }

  // ── readdir ──
  readdir(p, withFileTypes) {
    const inode = this._resolve(p);
    if (!inode) throw createFsError('ENOENT', 'scandir', p);
    if (inode.type !== 'dir') throw createFsError('ENOTDIR', 'scandir', p);
    inode.atime = Date.now();

    if (withFileTypes) {
      const entries = [];
      for (const [name, child] of inode.children) {
        entries.push(new Dirent(name, child.type));
      }
      return entries;
    }
    return Array.from(inode.children.keys());
  }

  // ── unlink ──
  unlink(p) {
    const norm = normalizePath(p);
    const { parent, name } = parentAndName(norm);
    const parentInode = parent === null ? this._root : this._resolve(parent);
    if (!parentInode || parentInode.type !== 'dir') {
      throw createFsError('ENOENT', 'unlink', norm);
    }
    const child = parentInode.children.get(name);
    if (!child) throw createFsError('ENOENT', 'unlink', norm);
    if (child.type === 'dir') throw createFsError('EISDIR', 'unlink', norm);
    parentInode.children.delete(name);
    this._emit('unlink', norm, { ino: child.ino, oldHash: child.contentHash });
  }

  // ── rmdir ──
  rmdir(p) {
    const norm = normalizePath(p);
    if (norm === '/') throw createFsError('EPERM', 'rmdir', norm);
    const inode = this._resolve(norm);
    if (!inode) throw createFsError('ENOENT', 'rmdir', norm);
    if (inode.type !== 'dir') throw createFsError('ENOTDIR', 'rmdir', norm);
    if (inode.children.size > 0) throw createFsError('ENOTEMPTY', 'rmdir', norm);

    const { parent, name } = parentAndName(norm);
    const parentInode = parent === null ? this._root : this._resolve(parent);
    if (parentInode) {
      parentInode.children.delete(name);
      this._emit('rmdir', norm, { ino: inode.ino });
    }
  }

  // ── rename ──
  rename(oldPath, newPath) {
    const normOld = normalizePath(oldPath);
    const normNew = normalizePath(newPath);

    const { parent: oldParent, name: oldName } = parentAndName(normOld);
    const oldParentInode = oldParent === null ? this._root : this._resolve(oldParent);
    if (!oldParentInode || !oldParentInode.children.has(oldName)) {
      throw createFsError('ENOENT', 'rename', normOld);
    }

    const { parent: newParent, name: newName } = parentAndName(normNew);
    const newParentInode = newParent === null ? this._root : this._resolve(newParent);
    if (!newParentInode || newParentInode.type !== 'dir') {
      throw createFsError('ENOENT', 'rename', normNew);
    }

    const inode = oldParentInode.children.get(oldName);
    oldParentInode.children.delete(oldName);
    newParentInode.children.set(newName, inode);
    inode.version++;
    inode.ctime = Date.now();
    this._emit('rename', normOld, {
      ino: inode.ino, newPath: normNew, version: inode.version,
    });
  }

  // ── exists ──
  exists(p) {
    return this._resolve(p) !== null;
  }

  // ── access ──
  access(p) {
    const inode = this._resolve(p);
    if (!inode) throw createFsError('ENOENT', 'access', p);
  }

  // ── realpath ──
  realpath(p) {
    const norm = normalizePath(p);
    const inode = this._resolve(norm);
    if (!inode) throw createFsError('ENOENT', 'realpath', norm);
    return norm;
  }

  // ── File descriptors ──
  open(p, flags) {
    const norm = normalizePath(p);
    const inode = this._resolve(norm);
    if (!inode) throw createFsError('ENOENT', 'open', norm);
    if (inode.type === 'dir') throw createFsError('EISDIR', 'open', norm);
    const fd = this._nextFd++;
    this._fdTable.set(fd, { inode, position: 0, path: norm });
    return fd;
  }

  readFd(fd, buffer, offset, length, position) {
    const entry = this._fdTable.get(fd);
    if (!entry) throw createFsError('EBADF', 'read', String(fd));
    const content = entry.inode.content;
    const pos = position !== null && position !== undefined ? position : entry.position;
    const available = Math.min(length, content.byteLength - pos);
    if (available <= 0) return 0;
    buffer.set(content.subarray(pos, pos + available), offset);
    if (position === null || position === undefined) {
      entry.position += available;
    }
    return available;
  }

  writeFd(fd, buffer, offset, length, position) {
    const entry = this._fdTable.get(fd);
    if (!entry) throw createFsError('EBADF', 'write', String(fd));
    const pos = position !== null && position !== undefined ? position : entry.position;
    const data = buffer.subarray(offset, offset + length);

    // Grow file if needed
    const neededSize = pos + data.byteLength;
    if (neededSize > entry.inode.content.byteLength) {
      const newContent = new Uint8Array(neededSize);
      newContent.set(entry.inode.content);
      entry.inode.content = newContent;
    }
    entry.inode.content.set(data, pos);
    if (position === null || position === undefined) {
      entry.position += data.byteLength;
    }
    const now = Date.now();
    entry.inode.mtime = now;
    entry.inode.contentHash = fnv1a(entry.inode.content);
    entry.inode.version++;
    this._emit('writeFd', entry.path, {
      ino: entry.inode.ino, version: entry.inode.version,
      newHash: entry.inode.contentHash,
    });
    return data.byteLength;
  }

  close(fd) {
    if (!this._fdTable.has(fd)) throw createFsError('EBADF', 'close', String(fd));
    this._fdTable.delete(fd);
  }

  // ── Snapshot: capture full filesystem state ──
  snapshot() {
    const files = {};
    const _walk = (node, path) => {
      for (const [name, child] of node.children) {
        const childPath = path === '/' ? '/' + name : path + '/' + name;
        if (child.type === 'file') {
          files[childPath] = {
            content: new Uint8Array(child.content),
            ino: child.ino,
            version: child.version,
            contentHash: child.contentHash,
            mtime: child.mtime,
          };
        } else if (child.type === 'dir') {
          _walk(child, childPath);
        }
      }
    };
    _walk(this._root, '/');
    return { seq: this._seq, files };
  }

  // ── Pre-populate from a files map ──
  populate(files) {
    for (const [path, content] of Object.entries(files)) {
      // Ensure parent dirs exist
      const { parent } = parentAndName(normalizePath(path));
      if (parent && parent !== '/') {
        this.mkdir(parent, true);
      }
      this.writeFile(path, content);
    }
  }
}

// ─── Factory function ───────────────────────────────────────────────
// Preferred way to create filesystem instances. Each runtime should
// get its own instance for isolation, snapshots, and deterministic tests.

export function createFilesystem(options = {}) {
  const fs = new MEMFS();
  fs.mkdir('/tmp', true);
  if (options.onMutation) {
    fs.onMutation(options.onMutation);
  }
  if (options.files) {
    fs.populate(options.files);
  }
  return fs;
}

// Singleton for backward compatibility — subsystems that haven't been
// migrated to per-runtime instances yet still import this.
export const defaultMemfs = createFilesystem();
