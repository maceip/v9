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

fs.writeFileSync(
  posix.join(root, 'cycle-a.mjs'),
  `console.log('a');
import('./cycle-b.mjs').then(() => console.log('a-done'));
`,
);
fs.writeFileSync(
  posix.join(root, 'cycle-b.mjs'),
  `console.log('b');
import('./cycle-a.mjs').then(() => console.log('b-done'));
`,
);

const main = posix.join(root, 'cycle-main.mjs');
fs.writeFileSync(
  main,
  `import('./cycle-a.mjs');
`,
);

const st = await runtime.runFileAsync(main);
if (st !== 0) fail(`runFileAsync ${st}`);
const out = stdout.join('\n');
for (const line of ['a', 'b', 'a-done', 'b-done']) {
  if (!out.includes(line)) fail(`missing log ${line}: ${JSON.stringify(out)}`);
}

console.log('=== MEMFS circular dynamic import === ok');
