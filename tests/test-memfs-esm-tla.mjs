#!/usr/bin/env node
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

const main = posix.join(root, 'tla.mjs');
fs.writeFileSync(
  main,
  `await Promise.resolve();
console.log('tla-ok');
`,
);

const st = await runtime.runFileAsync(main);
if (st !== 0) fail(`runFileAsync ${st}`);
const out = stdout.join('\n');
if (!out.includes('tla-ok')) {
  fail(`expected top-level await output: ${JSON.stringify(out)}`);
}

console.log('=== MEMFS ESM top-level await (bundle path) === ok');
