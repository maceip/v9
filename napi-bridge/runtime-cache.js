/**
 * runtime-cache.js — Persistent cross-tab state for v9 pages in a browser.
 *
 * Two stores, two storage backends:
 *
 *   [1] Last-known-good network transport  →  localStorage
 *       Small (one JSON object), synchronous, shared across tabs on the
 *       same origin. Set by net-stubs.js / http.js after a successful
 *       connect or request. Read on boot to surface what worked last time
 *       (currently informational; future: used to warm-start tier ordering).
 *
 *   [2] npm package tarball cache           →  IndexedDB
 *       Large (MBs per package, tens-hundreds of MB total), async, shared
 *       across tabs. Keyed by `${name}@${version}`. Set by napi-bridge/npm.js
 *       after downloading a tarball from registry.npmjs.org. Read before
 *       the fetch — a cache hit skips the network entirely and extracts
 *       the stored bytes straight into MEMFS.
 *
 * Eviction: LRU capped at __V9_PKG_CACHE_CAP_BYTES__ (default 128 MB).
 * tsAccessed is bumped on every hit so eviction is real LRU, not FIFO.
 *
 * Degrades silently when storage isn't available (private windows, quota
 * exceeded, sandboxed iframe without storage-access). All async errors
 * are swallowed — the caller treats cache misses and put-failures the
 * same way: as "no cache", proceed as if the cache didn't exist.
 */

// ─── Network mode (localStorage) ────────────────────────────────────

const NETMODE_KEY = 'v9:lastNetworkMode';
const NETMODE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day — after which we forget

/**
 * Record the transport mode that just produced a working connection.
 * Fire-and-forget. Never throws. Cross-tab via localStorage.
 *
 * @param {'gvisor'|'wisp'|'fetch-proxy'|'fetch'} mode
 * @param {string} [url]  the actual endpoint that worked (optional, purely
 *                        diagnostic — won't be blindly reused if stale)
 */
export function recordNetworkMode(mode, url) {
  try {
    if (typeof localStorage === 'undefined') return;
    // De-dupe: don't rewrite if the same mode was just stored. Saves wear
    // on the storage partition for callers that hit recordNetworkMode on
    // every HTTP request.
    const prev = _readNetModeRaw();
    if (prev && prev.mode === mode && prev.url === (url || null)) return;
    const payload = JSON.stringify({ mode, url: url || null, ts: Date.now() });
    localStorage.setItem(NETMODE_KEY, payload);
  } catch { /* storage blocked or quota — ignore */ }
}

function _readNetModeRaw() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(NETMODE_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || typeof rec.mode !== 'string') return null;
    return rec;
  } catch { return null; }
}

/**
 * Read the last-known-good transport mode. Returns null when nothing is
 * stored, storage is unavailable, or the record is older than
 * NETMODE_TTL_MS.
 *
 * @returns {{mode: string, url: string|null, ts: number} | null}
 */
export function getLastNetworkMode() {
  const rec = _readNetModeRaw();
  if (!rec) return null;
  if (Date.now() - (rec.ts || 0) > NETMODE_TTL_MS) return null;
  return rec;
}

export function clearLastNetworkMode() {
  try { localStorage?.removeItem(NETMODE_KEY); } catch { /* ignore */ }
}


// ─── Package tarball cache (IndexedDB) ──────────────────────────────

const DB_NAME = 'v9-runtime-cache';
// Version 2 added the `session` store (owned by session-persistence.js).
// Both modules share this DB, so whichever opens first must create BOTH
// stores — otherwise the second one sees a half-populated schema and
// session-persistence's upgrade handler never runs (it's at the same
// version). Keep this upgrade handler in sync with session-persistence.js.
const DB_VERSION = 2;
const STORE_PACKAGES = 'packages';
const STORE_SESSION = 'session';
const DEFAULT_CACHE_CAP_BYTES = 128 * 1024 * 1024; // 128 MB

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
      if (!db.objectStoreNames.contains(STORE_PACKAGES)) {
        const store = db.createObjectStore(STORE_PACKAGES, { keyPath: 'key' });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('tsAccessed', 'tsAccessed', { unique: false });
      }
      // Session store is owned by session-persistence.js but we create it
      // here too so opening order doesn't matter. Idempotent via contains().
      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  // If open fails (quota, no permission, etc.), clear so next call retries.
  _dbPromise.catch(() => { _dbPromise = null; });
  return _dbPromise;
}

const _pkgKey = (name, version) => `${name}@${version}`;

/** Minimal Promise wrapper around an IDBRequest. */
function _p(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Read a cached tarball. Bumps tsAccessed on hit so LRU eviction sees
 * the most-recent-access timestamp. Returns null on miss or any error —
 * the caller should always treat null as "fetch from the network".
 *
 * @param {string} name
 * @param {string} version
 * @returns {Promise<Uint8Array | null>}
 */
export async function cacheGetPackage(name, version) {
  try {
    const db = await _openDb();
    const key = _pkgKey(name, version);
    // readwrite so we can update tsAccessed in the same txn
    const tx = db.transaction(STORE_PACKAGES, 'readwrite');
    const store = tx.objectStore(STORE_PACKAGES);
    const rec = await _p(store.get(key));
    if (!rec) return null;
    // Fire-and-forget access-time update; don't await.
    try {
      store.put({ ...rec, tsAccessed: Date.now(), hits: (rec.hits || 0) + 1 });
    } catch { /* ignore */ }
    return rec.bytes instanceof Uint8Array ? rec.bytes : new Uint8Array(rec.bytes);
  } catch { return null; }
}

/**
 * Store a tarball. Runs LRU eviction if the new put would exceed the
 * byte cap. Best-effort: any error is swallowed so callers don't have
 * to care about storage availability.
 *
 * @param {string} name
 * @param {string} version
 * @param {Uint8Array} bytes
 */
export async function cachePutPackage(name, version, bytes) {
  if (!(bytes instanceof Uint8Array)) return;
  try {
    const db = await _openDb();
    await _evictIfNeeded(db, bytes.length);
    const now = Date.now();
    const rec = {
      key: _pkgKey(name, version),
      name,
      version,
      bytes,
      size: bytes.length,
      tsAdded: now,
      tsAccessed: now,
      hits: 0,
    };
    const tx = db.transaction(STORE_PACKAGES, 'readwrite');
    const store = tx.objectStore(STORE_PACKAGES);
    await _p(store.put(rec));
  } catch { /* best-effort */ }
}

async function _evictIfNeeded(db, incomingSize) {
  const cap = globalThis.__V9_PKG_CACHE_CAP_BYTES__ || DEFAULT_CACHE_CAP_BYTES;
  const tx = db.transaction(STORE_PACKAGES, 'readwrite');
  const store = tx.objectStore(STORE_PACKAGES);
  const all = await _p(store.getAll());
  let total = all.reduce((n, r) => n + (r.size || 0), 0);
  if (total + incomingSize <= cap) return;
  // Real LRU: oldest access first.
  all.sort((a, b) => (a.tsAccessed || 0) - (b.tsAccessed || 0));
  for (const rec of all) {
    if (total + incomingSize <= cap) break;
    try {
      await _p(store.delete(rec.key));
      total -= (rec.size || 0);
    } catch { /* ignore */ }
  }
}

/**
 * List cached packages (metadata only; no bytes).
 * @returns {Promise<Array<{name: string, version: string, size: number, tsAdded: number, tsAccessed: number, hits: number}>>}
 */
export async function cacheListPackages() {
  try {
    const db = await _openDb();
    const tx = db.transaction(STORE_PACKAGES, 'readonly');
    const store = tx.objectStore(STORE_PACKAGES);
    const all = await _p(store.getAll());
    return all.map(({ name, version, size, tsAdded, tsAccessed, hits }) => ({
      name, version, size, tsAdded, tsAccessed, hits: hits || 0,
    }));
  } catch { return []; }
}

export async function cacheStats() {
  try {
    const list = await cacheListPackages();
    let quota = null;
    let usage = null;
    try {
      if (navigator?.storage?.estimate) {
        const est = await navigator.storage.estimate();
        quota = est.quota ?? null;
        usage = est.usage ?? null;
      }
    } catch { /* ignore */ }
    return {
      count: list.length,
      bytes: list.reduce((n, r) => n + r.size, 0),
      quota,
      usage,
      cap: globalThis.__V9_PKG_CACHE_CAP_BYTES__ || DEFAULT_CACHE_CAP_BYTES,
    };
  } catch { return { count: 0, bytes: 0, quota: null, usage: null, cap: DEFAULT_CACHE_CAP_BYTES }; }
}

export async function cacheDeletePackage(name, version) {
  try {
    const db = await _openDb();
    const tx = db.transaction(STORE_PACKAGES, 'readwrite');
    await _p(tx.objectStore(STORE_PACKAGES).delete(_pkgKey(name, version)));
  } catch { /* ignore */ }
}

export async function cacheClearPackages() {
  try {
    const db = await _openDb();
    const tx = db.transaction(STORE_PACKAGES, 'readwrite');
    await _p(tx.objectStore(STORE_PACKAGES).clear());
  } catch { /* ignore */ }
}
