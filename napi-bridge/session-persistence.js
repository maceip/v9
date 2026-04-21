/**
 * session-persistence.js — Save/restore shell + MEMFS state via IndexedDB.
 *
 * What we persist, from most- to least-interesting:
 *   1. MEMFS contents under /workspace (project files, node_modules,
 *      installed packages, package.json). The most valuable piece — it
 *      means a user can `npm i express` once and come back next day
 *      and have express still installed without re-fetching the tarball.
 *   2. Shell state: cwd, command history, environment overrides.
 *   3. A small version/clock record so future schema migrations are safe.
 *
 * Storage layout (single IndexedDB DB reused from runtime-cache.js):
 *   DB:      v9-runtime-cache
 *   Stores:
 *     packages   — existing npm tarball cache (runtime-cache.js)
 *     session    — this module: one record per key
 *
 * Design choices:
 *   - Files are stored as raw Uint8Array in a single blob keyed by their
 *     absolute path. Small projects → small records → cheap to save.
 *   - We DON'T persist /tmp, /usr, /home/.cache, or hidden dotfiles
 *     under .node-in-tab — those are runtime scratch.
 *   - Save is throttled to at most once every 2 seconds and debounced
 *     on visibilitychange / pagehide so we write on tab-close without
 *     spamming during a hot interactive session.
 *   - Restore is best-effort: if any step fails we return false and let
 *     the caller proceed with an empty MEMFS.
 *   - Nothing here mutates state when IndexedDB is unavailable.
 */

const DB_NAME = 'v9-runtime-cache';
// Bump DB_VERSION to add the session store to the existing runtime-cache DB.
// Keep in sync with runtime-cache.js if that file ever bumps its version.
const DB_VERSION = 2;
const STORE_PACKAGES = 'packages';
const STORE_SESSION = 'session';

const SCHEMA_VERSION = 1;

// Only these prefixes are persisted. Everything else is ephemeral.
const PERSIST_PREFIXES = ['/workspace', '/home/user'];
// Never persist these, even under the allowed prefixes.
const SKIP_SUBPATHS = [
  '/home/user/.node-in-tab', // runtime scratch
  '/home/user/.cache',
];

// ── IndexedDB plumbing ──────────────────────────────────────────────

/** @type {Promise<IDBDatabase>|null} */
let _dbPromise = null;

function _openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (e) { reject(e); return; }
    req.onerror = () => reject(req.error || new Error('IDB open failed'));
    req.onblocked = () => reject(new Error('IDB open blocked'));
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // Create or retain packages store (owned by runtime-cache.js).
      if (!db.objectStoreNames.contains(STORE_PACKAGES)) {
        const store = db.createObjectStore(STORE_PACKAGES, { keyPath: 'key' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('tsAccessed', 'tsAccessed', { unique: false });
      }
      // New in DB_VERSION 2: session state.
      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  _dbPromise.catch(() => { _dbPromise = null; });
  return _dbPromise;
}

function _p(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function _sessionRuntimeId() {
  if (typeof globalThis !== 'undefined' && globalThis.__V9_RUNTIME_ID__) {
    return String(globalThis.__V9_RUNTIME_ID__);
  }
  try {
    const search = globalThis?.location?.search || '';
    const params = new URLSearchParams(search);
    const fromQuery = params.get('runtimeId');
    if (fromQuery) return fromQuery;
  } catch { /* ignore */ }
  return 'default';
}

function _sessionKey(key) {
  const runtimeId = _sessionRuntimeId();
  return `${runtimeId}:${key}`;
}

async function _putSession(key, value) {
  const db = await _openDb();
  const tx = db.transaction(STORE_SESSION, 'readwrite');
  await _p(tx.objectStore(STORE_SESSION).put({ key: _sessionKey(key), value, ts: Date.now() }));
}

async function _getSession(key) {
  try {
    const db = await _openDb();
    const tx = db.transaction(STORE_SESSION, 'readonly');
    const rec = await _p(tx.objectStore(STORE_SESSION).get(_sessionKey(key)));
    return rec ? rec.value : null;
  } catch { return null; }
}

// ── Path filtering ──────────────────────────────────────────────────

function _shouldPersist(path) {
  if (!PERSIST_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) return false;
  if (SKIP_SUBPATHS.some((p) => path === p || path.startsWith(p + '/'))) return false;
  return true;
}

// ── Runtime/shell accessors ─────────────────────────────────────────

function _getRuntime() {
  return (typeof globalThis !== 'undefined' && globalThis.__edgeRuntime) || null;
}
function _getShell() {
  return (typeof globalThis !== 'undefined' && globalThis.__edgeShell) || null;
}

// MEMFS snapshot/populate helpers — we prefer the per-runtime memfs if the
// Wasm runtime has booted, otherwise fall back to the shell-commands module
// singleton (which is what the shell uses before Wasm is ready).
async function _getActiveMemfs() {
  const rt = _getRuntime();
  if (rt && rt.fs && typeof rt.fsSnapshotFull === 'function') {
    return { kind: 'runtime', runtime: rt };
  }
  // Fallback: the shell module's active memfs (set in shell-commands.js).
  const sc = await import('./shell-commands.js');
  const memfs = sc.getMemfs ? sc.getMemfs() : null;
  return { kind: 'bare', memfs };
}

// ── Save ────────────────────────────────────────────────────────────

/**
 * Collect the persistable slice of MEMFS into a plain object:
 *   { '/workspace/app.js': Uint8Array, ... }
 */
async function _collectFiles() {
  const active = await _getActiveMemfs();
  let snapshot;
  if (active.kind === 'runtime') {
    snapshot = active.runtime.fsSnapshotFull();
  } else if (active.memfs && typeof active.memfs.snapshotFull === 'function') {
    snapshot = active.memfs.snapshotFull();
  } else {
    return {};
  }
  const out = {};
  const files = snapshot?.files || {};
  for (const [path, entry] of Object.entries(files)) {
    if (!_shouldPersist(path)) continue;
    // entry.content is the raw bytes from snapshotFull(). Store as-is; IDB
    // accepts Uint8Array natively via structured clone.
    if (entry && entry.content instanceof Uint8Array) {
      out[path] = entry.content;
    }
  }
  return out;
}

let _lastSaveAt = 0;
let _saveInFlight = null;

/**
 * Save the current session to IndexedDB. By default, throttled to once
 * every 2s. Pass `{ force: true }` from unload handlers or tests to skip
 * the throttle.
 *
 * @param {{force?: boolean}} [opts]
 * @returns {Promise<boolean>} true if a save was actually attempted
 */
export async function saveSession(opts = {}) {
  if (_saveInFlight) return _saveInFlight;
  if (!opts.force && Date.now() - _lastSaveAt < 2000) return false;

  _saveInFlight = (async () => {
    try {
      const files = await _collectFiles();
      const shell = _getShell();
      const cwd = shell && typeof shell.getCwd === 'function' ? shell.getCwd() : '/workspace';
      const history = shell && Array.isArray(shell.history) ? shell.history.slice() : [];
      const env = (globalThis.process && globalThis.process.env)
        ? _serializeEnv(globalThis.process.env)
        : {};

      await _putSession('schema', SCHEMA_VERSION);
      await _putSession('files', files);
      await _putSession('shell', { cwd, history, env, ts: Date.now() });

      _lastSaveAt = Date.now();
      return true;
    } catch (err) {
      // Storage blocked, quota exceeded, or DB open failed. Never throw.
      try { console.debug?.('[session] save failed:', err?.message || err); } catch {}
      return false;
    } finally {
      _saveInFlight = null;
    }
  })();
  return _saveInFlight;
}

function _serializeEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

// ── Restore ─────────────────────────────────────────────────────────

/**
 * Restore a saved session, if present.
 *
 * Files are written into whichever MEMFS is currently active (shell
 * singleton pre-Wasm, runtime-owned memfs post-Wasm) AND mirrored into
 * `globalThis.__edgeInitialFiles` so `initEdgeJS({files})` populates the
 * runtime's fresh memfs at boot time. This is what closes the restore →
 * Wasm-boot race: without it, a pre-Wasm restore writes into a singleton
 * that `_setShellMemfs(_sharedMemfs)` will orphan a moment later.
 *
 * @returns {Promise<{
 *   restored: boolean,
 *   files: number,
 *   cwd: string | null,
 *   historyLength: number,
 * }>}
 */
export async function restoreSession() {
  const empty = { restored: false, files: 0, cwd: null, historyLength: 0 };
  try {
    const schema = await _getSession('schema');
    if (schema !== SCHEMA_VERSION) return empty;

    const files = await _getSession('files');
    const shell = await _getSession('shell');
    if (!files && !shell) return empty;

    // Write files back into MEMFS. Prefer the runtime's fs if booted
    // (it uses the same isolated instance the bridge wired up).
    let filesRestored = 0;
    const active = await _getActiveMemfs();
    if (files && typeof files === 'object') {
      // Seed the Wasm runtime's future memfs via initEdgeJS({files}).
      // terminal.js reads globalThis.__edgeInitialFiles right before it
      // calls initEdgeJS, and initEdgeJS populates the fresh per-runtime
      // memfs from it — so any files we restore here survive the
      // `_setShellMemfs` swap that happens when the Wasm boot completes.
      if (typeof globalThis !== 'undefined') {
        const existing = (globalThis.__edgeInitialFiles && typeof globalThis.__edgeInitialFiles === 'object')
          ? globalThis.__edgeInitialFiles
          : {};
        const merged = { ...existing };
        for (const [path, bytes] of Object.entries(files)) {
          merged[path] = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        }
        globalThis.__edgeInitialFiles = merged;
      }

      if (active.kind === 'runtime') {
        const rfs = active.runtime.fs;
        for (const [path, bytes] of Object.entries(files)) {
          try {
            const dir = path.replace(/\/[^/]+$/, '') || '/';
            rfs.mkdirSync(dir, { recursive: true });
            rfs.writeFileSync(path, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
            filesRestored++;
          } catch { /* skip bad entries */ }
        }
      } else if (active.memfs) {
        for (const [path, bytes] of Object.entries(files)) {
          try {
            const dir = path.replace(/\/[^/]+$/, '') || '/';
            active.memfs.mkdir(dir, true);
            active.memfs.writeFile(path, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
            filesRestored++;
          } catch {}
        }
      } else {
        // Neither runtime nor singleton available — but we still counted
        // these files in __edgeInitialFiles, so report them as restored.
        filesRestored = Object.keys(files).length;
      }
    }

    // Restore shell cwd/history/env. Shell doesn't expose setters, so we
    // mutate the live instance defensively — it's the same closure we
    // created in terminal.js.
    let cwdRestored = null;
    let historyLength = 0;
    if (shell && typeof shell === 'object') {
      const liveShell = _getShell();
      if (liveShell) {
        if (typeof shell.cwd === 'string' && typeof liveShell.setCwd === 'function') {
          liveShell.setCwd(shell.cwd);
          cwdRestored = shell.cwd;
        }
        if (Array.isArray(shell.history) && typeof liveShell.setHistory === 'function') {
          liveShell.setHistory(shell.history);
          historyLength = shell.history.length;
        }
      }
      // Apply env overrides too.
      if (shell.env && typeof shell.env === 'object' && globalThis.process?.env) {
        for (const [k, v] of Object.entries(shell.env)) {
          if (typeof v === 'string') globalThis.process.env[k] = v;
        }
      }
    }

    return {
      restored: true,
      files: filesRestored,
      cwd: cwdRestored,
      historyLength,
    };
  } catch (err) {
    try { console.debug?.('[session] restore failed:', err?.message || err); } catch {}
    return empty;
  }
}

// ── Clear (for testing / "start fresh" menu entry) ──────────────────

/**
 * Wipe the session store. Does NOT touch the npm package cache.
 */
export async function clearSession() {
  try {
    const db = await _openDb();
    const tx = db.transaction(STORE_SESSION, 'readwrite');
    const store = tx.objectStore(STORE_SESSION);
    const runtimePrefix = _sessionKey('');
    const keys = await _p(store.getAllKeys());
    for (const key of keys) {
      if (String(key).startsWith(runtimePrefix)) {
        await _p(store.delete(key));
      }
    }
    return true;
  } catch {
    return false;
  }
}

// ── Install hooks on the terminal module ───────────────────────────
//
// Call this from terminal.js boot() after the shell + runtime are wired.
// It registers visibilitychange/pagehide/beforeunload listeners so the
// session is saved on tab-close, and kicks off an optional restore.
// Idempotent — safe to call once per boot.

let _hooksInstalled = false;

/**
 * @param {{restore?: boolean, autosave?: boolean}} [opts]
 */
export async function installSessionHooks(opts = {}) {
  if (_hooksInstalled) return;
  _hooksInstalled = true;

  if (opts.restore !== false) {
    await restoreSession();
  }

  if (opts.autosave === false) return;

  // Save on tab close / visibility change. Prefer pagehide which is the
  // only event that reliably fires on mobile Safari when the page is
  // backgrounded or discarded.
  const trigger = () => { saveSession({ force: true }).catch(() => {}); };
  try {
    globalThis.addEventListener?.('pagehide', trigger);
    globalThis.addEventListener?.('beforeunload', trigger);
    globalThis.document?.addEventListener?.('visibilitychange', () => {
      if (globalThis.document?.visibilityState === 'hidden') trigger();
    });
  } catch { /* not in a browser */ }
}

// Convenience: named export so tests can poke a rehydrated shell without
// round-tripping through IndexedDB.
export const __internal = {
  _collectFiles,
  _shouldPersist,
};
