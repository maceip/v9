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
fs.mkdirSync(posix.join(nm, 'a'), { recursive: true });
fs.mkdirSync(posix.join(nm, 'b'), { recursive: true });

fs.writeFileSync(posix.join(nm, 'cjs.js'), 'module.exports = { which: "cjs", v: 42 };');
fs.writeFileSync(posix.join(nm, 'esm.mjs'), 'export const which = "esm"; export const v = 7;');
fs.writeFileSync(posix.join(nm, 'lite.js'), 'module.exports = { which: "lite" };');
fs.writeFileSync(posix.join(nm, 'a', 'x.js'), 'module.exports = { which: "pat", seg: "x" };');
fs.writeFileSync(posix.join(nm, 'b', 'y.js'), 'module.exports = { which: "pat", seg: "y" };');
fs.writeFileSync(posix.join(nm, 'dev.js'), 'module.exports = { which: "dev" };');
fs.writeFileSync(posix.join(nm, 'prod.js'), 'module.exports = { which: "prod" };');

fs.writeFileSync(
  posix.join(nm, 'package.json'),
  JSON.stringify({
    name: 'fixture-exp',
    exports: {
      '.': { require: './cjs.js', import: './esm.mjs' },
      './lite': './lite.js',
      './features/*': './a/*.js',
      './alt/*': './b/*.js',
      './env': {
        development: './dev.js',
        production: './prod.js',
        default: './prod.js',
      },
    },
    imports: {
      '#internal': './lite.js',
      '#mod/*': './a/*.js',
    },
  }),
);

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
const px = require('fixture-exp/features/x');
assert.strictEqual(px.which, 'pat');
assert.strictEqual(px.seg, 'x');
const py = require('fixture-exp/alt/y');
assert.strictEqual(py.seg, 'y');
const env = require('fixture-exp/env');
assert.strictEqual(env.which, 'prod');
console.log('ok');
`,
);

const pkgMain = posix.join(nm, 'use-imports.js');
fs.writeFileSync(
  pkgMain,
  `
const assert = require('assert');
const internal = require('#internal');
assert.strictEqual(internal.which, 'lite');
const hashMod = require('#mod/x');
assert.strictEqual(hashMod.seg, 'x');
console.log('imports-ok');
`,
);

let st = await runtime.runNodeEntry({ entry: main, cwd: root });
if (st.status !== 0) {
  fail(`runNodeEntry failed: ${JSON.stringify(st.stderr)}`);
}

st = await runtime.runNodeEntry({ entry: pkgMain, cwd: nm });
if (st.status !== 0) {
  fail(`runNodeEntry imports failed: ${JSON.stringify(st.stderr)}`);
}

const mainDev = posix.join(root, 'main-dev.js');
fs.writeFileSync(
  mainDev,
  `
const assert = require('assert');
const env = require('fixture-exp/env');
assert.strictEqual(env.which, 'dev');
console.log('dev-ok');
`,
);
st = await runtime.runNodeEntry({
  entry: mainDev,
  cwd: root,
  env: { NODE_ENV: 'development' },
});
if (st.status !== 0) {
  fail(`runNodeEntry dev failed: ${JSON.stringify(st.stderr)}`);
}

console.log('=== package exports resolve (MEMFS) === ok');
