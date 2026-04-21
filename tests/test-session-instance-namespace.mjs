#!/usr/bin/env node

const calls = [];

globalThis.indexedDB = {
  open(name, version) {
    const req = {};
    queueMicrotask(() => {
      const db = {
        objectStoreNames: { contains: () => false },
        createObjectStore() { return { createIndex() {} }; },
        transaction() {
          return {
            objectStore() {
              return {
                put(record) {
                  calls.push(record.key);
                  const inner = {};
                  queueMicrotask(() => inner.onsuccess && inner.onsuccess());
                  return inner;
                },
                get() {
                  const inner = {};
                  queueMicrotask(() => {
                    inner.result = null;
                    inner.onsuccess && inner.onsuccess();
                  });
                  return inner;
                },
                clear() {
                  const inner = {};
                  queueMicrotask(() => inner.onsuccess && inner.onsuccess());
                  return inner;
                },
              };
            },
          };
        },
      };
      req.result = db;
      req.onupgradeneeded && req.onupgradeneeded({ target: req });
      req.onsuccess && req.onsuccess();
    });
    return req;
  },
};

globalThis.process = { env: {} };
globalThis.location = { search: '?runtimeId=alpha' };
globalThis.__V9_RUNTIME_ID__ = 'alpha';

const mod = await import('../napi-bridge/session-persistence.js');

let passed = 0;
let failed = 0;
function assert(cond, name) {
  if (cond) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.log(`FAIL: ${name}`);
    failed++;
  }
}

await mod.saveSession({ force: true });
assert(calls.includes('alpha:schema'), 'runtime namespaced schema key');
assert(calls.includes('alpha:files'), 'runtime namespaced files key');
assert(calls.includes('alpha:shell'), 'runtime namespaced shell key');

globalThis.__TEST_EXIT_CODE__ = failed > 0 ? 1 : 0;
if (globalThis.__TEST_EXIT_CODE__ !== 0) {
  throw new Error(`session namespace test failed with ${failed} failures`);
}
