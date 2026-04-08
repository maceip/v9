#!/usr/bin/env node
/**
 * In-tab milestone: `node:test` stub (minimal) + MEMFS ESM entry.
 */
import { posix } from 'node:path';
import { initRuntimeForTests } from './helpers/runtime-init.mjs';

function fail(m) {
  console.error('FAIL:', m);
  process.exit(1);
}

const root = '/workspace';
const { runtime, stdout } = await initRuntimeForTests({ preferJsScriptBridge: true, captureOutput: true });
const fs = runtime.fs;
fs.mkdirSync(root, { recursive: true });

const main = posix.join(root, 'tests.mjs');
fs.writeFileSync(
  main,
  `import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

await describe('suite', () => {
  let hooks = '';
  before(() => { hooks += 'B'; });
  after(() => { hooks += 'A'; });
  beforeEach(() => { hooks += 'b'; });
  afterEach(() => { hooks += 'a'; });

  test('in-tab sanity', async () => {
    assert.equal(2 + 2, 4);
  });
  test('hook trace', () => {
    assert.ok(true);
    console.log('hooks', hooks);
  });
  describe('nested', () => {
    test('nested case', () => {
      assert.ok(true);
    });
  });
});
console.log('node-test-stub-ran');
`,
);

const st = await runtime.runFileAsync(main);
if (st !== 0) fail(`runFileAsync ${st}: ${stdout.join('\n')}`);
const out = stdout.join('\n');
if (!out.includes('node-test-stub-ran')) {
  fail(`expected completion log: ${JSON.stringify(out)}`);
}
if (!out.includes('hooks Bbab')) {
  fail(`expected hook trace Bbab (log runs before second afterEach), got: ${JSON.stringify(out)}`);
}

console.log('=== MEMFS node:test minimal stub === ok');
