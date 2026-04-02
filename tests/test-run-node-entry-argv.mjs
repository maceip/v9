#!/usr/bin/env node
import { posix } from 'node:path';
import { initRuntimeForTests } from './helpers/runtime-init.mjs';

function fail(m) {
  console.error('FAIL:', m);
  process.exit(1);
}

const root = '/workspace';

const { runtime } = await initRuntimeForTests({ preferJsScriptBridge: true, captureOutput: true });
const fs = runtime.fs;
fs.mkdirSync(root, { recursive: true });

const main = posix.join(root, 'argv-print.js');
fs.writeFileSync(
  main,
  `console.log(JSON.stringify(process.argv.slice(1)));`,
);

const res = await runtime.runNodeEntry({
  entry: main,
  cwd: root,
  argv: ['--x', '1'],
});

if (res.status !== 0) fail(`runNodeEntry status ${res.status}: ${res.stderr.join('\n')}`);

const line = (res.stdout || []).join('\n').trim();
const argv = JSON.parse(line);
if (argv[0] !== main) fail(`argv[0] expected ${main}, got ${argv[0]}`);
if (argv[1] !== '--x' || argv[2] !== '1') {
  fail(`expected extras [--x,1], got ${JSON.stringify(argv.slice(1))}`);
}

console.log('=== runNodeEntry argv === ok');
