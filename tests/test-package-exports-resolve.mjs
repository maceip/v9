#!/usr/bin/env node
import { posix } from 'node:path';
import { initRuntimeForTests } from './helpers/runtime-init.mjs';

function fail(m) {
  console.error('FAIL:', m);
  process.exit(1);
}

const root = '/workspace';
const nm = posix.join(root, 'node_modules', 'fixture-exp');

const { runtime } = await initRuntimeForTests({ preferJsScriptBridge: true, captureOutput: true });
const fs = runtime.fs;
fs.mkdirSync(nm, { recursive: true });

fs.writeFileSync(
  posix.join(nm, 'package.json'),
  JSON.stringify({
    name: 'fixture-exp',
    exports: {
      '.': { require: './cjs.js', import: './esm.mjs' },
      './lite': './lite.js',
    },
  }),
);
fs.writeFileSync(posix.join(nm, 'cjs.js'), 'module.exports = { which: "cjs", v: 42 };');
fs.writeFileSync(posix.join(nm, 'esm.mjs'), 'export const which = "esm"; export const v = 7;');
fs.writeFileSync(posix.join(nm, 'lite.js'), 'module.exports = { which: "lite" };');

const main = posix.join(root, 'main.js');
fs.writeFileSync(
  main,
  `
const assert = require('assert');
const root = require('fixture-exp');
assert.strictEqual(root.which, 'cjs');
assert.strictEqual(root.v, 42);
const lite = require('fixture-exp/lite');
assert.strictEqual(lite.which, 'lite');
console.log('ok');
`,
);

const st = await runtime.runNodeEntry({ entry: main, cwd: root });
if (st.status !== 0) {
  fail(`runNodeEntry failed: ${JSON.stringify(st.stderr)}`);
}

console.log('=== package exports resolve (MEMFS) === ok');
