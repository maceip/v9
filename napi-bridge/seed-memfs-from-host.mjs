/**
 * Copy a real directory tree from the host (Node.js disk) into the runtime MEMFS
 * exposed as `runtime.fs`. Uses only actual host reads (fs.readFileSync, readdirSync,
 * lstatSync, realpathSync) and MEMFS writes — no stub filesystem, no proxy beyond
 * Node’s own realpath behavior.
 *
 * MEMFS does not support symlinks; symbolic links on disk are followed with
 * realpathSync and their materialized files/directories are stored as normal nodes.
 *
 * @param {{ hostPath: string, memfsPath: string, runtimeFs: object }} opts
 * @param {string} opts.hostPath — Absolute path on the host (must exist).
 * @param {string} opts.memfsPath — Absolute MEMFS path (e.g. `/workspace/node_modules/foo`).
 * @param {object} opts.runtimeFs — `runtime.fs` from initEdgeJS (mkdirSync, writeFileSync).
 */
import * as hostFs from 'node:fs';
import * as hostPath from 'node:path';
import { posix } from 'node:path';

function assertFs(fs) {
  if (typeof fs?.mkdirSync !== 'function' || typeof fs?.writeFileSync !== 'function') {
    throw new Error('runtimeFs must provide mkdirSync and writeFileSync');
  }
}

/**
 * @param {string} hostAbs — Already realpath-resolved absolute host path.
 * @param {string} memfsAbs — POSIX absolute path in MEMFS.
 */
function copyTree(hostAbs, memfsAbs, runtimeFs) {
  let st;
  try {
    st = hostFs.lstatSync(hostAbs);
  } catch (e) {
    throw new Error(`seed-memfs-from-host: lstatSync failed for ${hostAbs}: ${e?.message || e}`);
  }

  if (st.isSymbolicLink()) {
    const resolved = hostFs.realpathSync(hostAbs);
    copyTree(resolved, memfsAbs, runtimeFs);
    return;
  }

  if (st.isDirectory()) {
    runtimeFs.mkdirSync(memfsAbs, { recursive: true });
    const names = hostFs.readdirSync(hostAbs, { withFileTypes: true });
    for (const ent of names) {
      const h = hostPath.join(hostAbs, ent.name);
      const m = posix.join(memfsAbs, ent.name);
      if (ent.isDirectory()) {
        copyTree(h, m, runtimeFs);
      } else if (ent.isFile()) {
        const buf = hostFs.readFileSync(h);
        runtimeFs.mkdirSync(posix.dirname(m), { recursive: true });
        runtimeFs.writeFileSync(m, buf);
      } else if (ent.isSymbolicLink()) {
        const resolved = hostFs.realpathSync(h);
        const lst = hostFs.lstatSync(resolved);
        if (lst.isDirectory()) {
          copyTree(resolved, m, runtimeFs);
        } else if (lst.isFile()) {
          const buf = hostFs.readFileSync(resolved);
          runtimeFs.mkdirSync(posix.dirname(m), { recursive: true });
          runtimeFs.writeFileSync(m, buf);
        } else {
          throw new Error(`seed-memfs-from-host: unsupported symlink target type at ${resolved}`);
        }
      } else {
        throw new Error(`seed-memfs-from-host: unsupported dirent type for ${h}`);
      }
    }
    return;
  }

  if (st.isFile()) {
    runtimeFs.mkdirSync(posix.dirname(memfsAbs), { recursive: true });
    runtimeFs.writeFileSync(memfsAbs, hostFs.readFileSync(hostAbs));
    return;
  }

  throw new Error(`seed-memfs-from-host: unsupported host inode at ${hostAbs}`);
}

export function seedMemfsFromHostPath({ hostPath, memfsPath, runtimeFs }) {
  assertFs(runtimeFs);
  if (typeof hostPath !== 'string' || typeof memfsPath !== 'string') {
    throw new Error('hostPath and memfsPath must be strings');
  }
  const hostResolved = hostFs.realpathSync(hostPath);
  const memfsNorm = memfsPath.startsWith('/') ? memfsPath : `/${memfsPath}`;
  copyTree(hostResolved, memfsNorm, runtimeFs);
}
