/**
 * MEMFS — In-memory filesystem with POSIX inode tree.
 *
 * Each inode: { type: 'file'|'dir', content: Uint8Array|null, children: Map, stat: {...} }
 * Paths resolved via POSIX rules. No symlinks in v1.
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

// ─── Stat object ────────────────────────────────────────────────────

let _inoCounter = 1;

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

// ─── Inode helpers ──────────────────────────────────────────────────

function _makeInode(type, content) {
  const now = Date.now();
  return {
    type,
    content: content || null,
    children: type === 'dir' ? new Map() : null,
    ino: _inoCounter++,
    atime: now,
    mtime: now,
    ctime: now,
  };
}

// ─── Path resolution ────────────────────────────────────────────────

function normalizePath(p) {
  if (typeof p !== 'string' || p.length === 0) return '/';
  const parts = p.split('/').filter(Boolean);
  const result = [];
  for (const part of parts) {
    if (part === '..') { if (result.length > 0) result.pop(); }
    else if (part !== '.') result.push(part);
  }
  return '/' + result.join('/');
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
    this._root = _makeInode('dir');
    this._fdTable = new Map();
    this._nextFd = 3; // 0,1,2 reserved for stdin/stdout/stderr
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
      for (const part of parts) {
        if (!current.children.has(part)) {
          const child = _makeInode('dir');
          current.children.set(part, child);
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
    parentInode.children.set(name, _makeInode('dir'));
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

    const existing = parentInode.children.get(name);
    if (existing) {
      if (existing.type === 'dir') throw createFsError('EISDIR', 'open', norm);
      existing.content = content;
      const now = Date.now();
      existing.mtime = now;
      existing.ctime = now;
    } else {
      const inode = _makeInode('file', content);
      parentInode.children.set(name, inode);
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
    inode.ctime = Date.now();
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
    entry.inode.mtime = Date.now();
    return data.byteLength;
  }

  close(fd) {
    if (!this._fdTable.has(fd)) throw createFsError('EBADF', 'close', String(fd));
    this._fdTable.delete(fd);
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

// Singleton for the default fs
export const defaultMemfs = new MEMFS();

// Ensure /tmp exists
defaultMemfs.mkdir('/tmp', true);
