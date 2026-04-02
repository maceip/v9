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

const esm = posix.join(root, 'hi.mjs');
fs.writeFileSync(
  esm,
  `export const x = 99;\nconsole.log('esm-ok', x);\n`,
);

const st = await runtime.runFileAsync(esm);
if (st !== 0) {
  fail(`runFileAsync(esm) expected 0, got ${st}`);
}
const out = stdout.join('\n');
if (!out.includes('esm-ok 99')) {
  fail(`expected transpiled ESM output, got: ${JSON.stringify(out)}`);
}

console.log('=== MEMFS ESM entry (transpile path) === ok');
