#!/usr/bin/env node
/**
 * runtime-cache unit test — localStorage shim in Node so we can exercise
 * the network-mode path without a real browser. The IndexedDB path is
 * covered by a separate browser smoke test (not here).
 *
 * Usage: node tests/test-runtime-cache.mjs
 */

// ─── Minimal localStorage shim (no browser on Node) ──────────────────
const _store = new Map();
globalThis.localStorage = {
  getItem(k) { return _store.has(k) ? _store.get(k) : null; },
  setItem(k, v) { _store.set(k, String(v)); },
  removeItem(k) { _store.delete(k); },
  clear() { _store.clear(); },
  get length() { return _store.size; },
  key(i) { return [..._store.keys()][i] ?? null; },
};

// No indexedDB — the package-cache calls should degrade to no-ops.

const mod = await import('../napi-bridge/runtime-cache.js');

let passed = 0;
let failed = 0;
function assert(cond, name) {
  if (cond) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}`); failed++; }
}

console.log('\n=== runtime-cache: network mode ===\n');

// Starts empty
_store.clear();
assert(mod.getLastNetworkMode() === null, 'empty store returns null');

// Record + read
mod.recordNetworkMode('gvisor');
let rec = mod.getLastNetworkMode();
assert(rec && rec.mode === 'gvisor' && rec.url === null, 'records gvisor with null URL');
assert(typeof rec.ts === 'number' && rec.ts > 0, 'record has timestamp');

mod.recordNetworkMode('wisp', 'wss://edge.stare.network/wisp/');
rec = mod.getLastNetworkMode();
assert(rec.mode === 'wisp', 'records wisp mode');
assert(rec.url === 'wss://edge.stare.network/wisp/', 'records wisp URL');

// De-dupe: same mode+url should not re-write
const before = _store.get('v9:lastNetworkMode');
mod.recordNetworkMode('wisp', 'wss://edge.stare.network/wisp/');
const after = _store.get('v9:lastNetworkMode');
assert(before === after, 'de-dupe: same mode+url does not rewrite');

// Different URL rewrites
mod.recordNetworkMode('wisp', 'wss://other.example/wisp/');
const after2 = _store.get('v9:lastNetworkMode');
assert(after !== after2, 'different URL rewrites');

// TTL expiry
_store.set('v9:lastNetworkMode', JSON.stringify({
  mode: 'gvisor', url: null, ts: Date.now() - (25 * 60 * 60 * 1000),
}));
assert(mod.getLastNetworkMode() === null, 'expired record (>24h) reads as null');

// Malformed JSON
_store.set('v9:lastNetworkMode', 'not-json{');
assert(mod.getLastNetworkMode() === null, 'malformed JSON reads as null');

// Missing mode
_store.set('v9:lastNetworkMode', JSON.stringify({ ts: Date.now() }));
assert(mod.getLastNetworkMode() === null, 'record without mode reads as null');

// Clear
mod.recordNetworkMode('fetch-proxy');
assert(mod.getLastNetworkMode() !== null, 'record present before clear');
mod.clearLastNetworkMode();
assert(mod.getLastNetworkMode() === null, 'cleared record reads as null');

// Errors in localStorage do not throw
const brokenStorage = {
  getItem() { throw new Error('boom'); },
  setItem() { throw new Error('boom'); },
  removeItem() { throw new Error('boom'); },
};
const origStorage = globalThis.localStorage;
globalThis.localStorage = brokenStorage;
try {
  mod.recordNetworkMode('gvisor');  // should not throw
  const result = mod.getLastNetworkMode();  // should return null
  assert(result === null, 'broken localStorage degrades to null');
  mod.clearLastNetworkMode();  // should not throw
  assert(true, 'clearLastNetworkMode does not throw on broken storage');
} catch (e) {
  assert(false, `broken localStorage throws: ${e.message}`);
} finally {
  globalThis.localStorage = origStorage;
}

console.log('\n=== runtime-cache: package cache (no IDB) ===\n');

// With no IndexedDB available, all package-cache methods must degrade
// to safe no-ops so callers don't need to defend against environment.
const v1 = await mod.cacheGetPackage('lodash', '4.17.21');
assert(v1 === null, 'cacheGetPackage returns null when IDB unavailable');

await mod.cachePutPackage('lodash', '4.17.21', new Uint8Array([1, 2, 3]));
assert(true, 'cachePutPackage does not throw when IDB unavailable');

const list = await mod.cacheListPackages();
assert(Array.isArray(list) && list.length === 0, 'cacheListPackages returns [] when IDB unavailable');

const stats = await mod.cacheStats();
assert(typeof stats === 'object' && stats.count === 0 && stats.bytes === 0,
  'cacheStats returns zeroed object when IDB unavailable');

await mod.cacheDeletePackage('lodash', '4.17.21');
assert(true, 'cacheDeletePackage does not throw when IDB unavailable');

await mod.cacheClearPackages();
assert(true, 'cacheClearPackages does not throw when IDB unavailable');

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
