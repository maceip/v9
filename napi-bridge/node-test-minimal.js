/**
 * Minimal stub for node:test — enough for simple `import { test } from 'node:test'` in MEMFS.
 * Not a spec-complete test runner (no TAP, no concurrency limits, no snapshot).
 */

async function runFn(name, fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('test() requires a function');
  }
  const ctx = {
    name,
    signal: { aborted: false },
    diagnostic: () => {},
  };
  const ret = fn(ctx);
  if (ret != null && typeof ret.then === 'function') await ret;
}

export async function test(name, options, fn) {
  if (typeof name !== 'string') throw new TypeError('test name must be a string');
  if (typeof options === 'function') {
    fn = options;
    options = undefined;
  }
  await runFn(name, fn);
}

export function describe(name, options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = undefined;
  }
  if (typeof fn !== 'function') return;
  fn();
}

export async function it(name, options, fn) {
  return await test(name, options, fn);
}

const mod = {
  test,
  describe,
  it,
  default: { test, describe, it },
};

export default mod;
