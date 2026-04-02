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

const dep = posix.join(root, 'dep.mjs');
fs.writeFileSync(dep, `export const v = 'dep';\n`);

const main = posix.join(root, 'main.mjs');
fs.writeFileSync(
  main,
  `const u = new URL(import.meta.url);
console.log('meta', u.pathname);
import('./dep.mjs').then(({ v }) => console.log('dyn', v));
`,
);

const st = await runtime.runFileAsync(main);
if (st !== 0) fail(`runFileAsync ${st}`);
const out = stdout.join('\n');
if (!out.includes('meta') || !out.includes('/workspace/main.mjs')) {
  fail(`import.meta.url line missing: ${JSON.stringify(out)}`);
}
if (!out.includes('dyn dep')) {
  fail(`dynamic import missing: ${JSON.stringify(out)}`);
}

console.log('=== MEMFS import.meta + dynamic import === ok');
