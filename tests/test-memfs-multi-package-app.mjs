#!/usr/bin/env node
/**
 * Multi-package slice: real host packages (fflate + isomorphic-timers-promises) on MEMFS,
 * mixed static ESM imports and async API (top-level await).
 */
import { join, posix } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seedMemfsFromHostPath } from './helpers/seed-memfs-from-host.mjs';
import { initRuntimeForTests } from './helpers/runtime-init.mjs';

function fail(m) {
  console.error('FAIL:', m);
  process.exit(1);
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = join(__dirname, '..');
const HOST_FFLATE = join(rootDir, 'node_modules', 'fflate');
const HOST_TIMERS = join(rootDir, 'node_modules', 'isomorphic-timers-promises');
const MEMFS_ROOT = '/workspace';
const MEMFS_FFLATE = posix.join(MEMFS_ROOT, 'node_modules', 'fflate');
const MEMFS_TIMERS = posix.join(MEMFS_ROOT, 'node_modules', 'isomorphic-timers-promises');

if (!existsSync(HOST_FFLATE)) fail(`Missing ${HOST_FFLATE} — run npm ci`);
if (!existsSync(HOST_TIMERS)) fail(`Missing ${HOST_TIMERS} — run npm ci`);

const { runtime, stdout } = await initRuntimeForTests({ preferJsScriptBridge: true, captureOutput: true });
const fs = runtime.fs;
fs.mkdirSync(MEMFS_ROOT, { recursive: true });
seedMemfsFromHostPath({ hostPath: HOST_FFLATE, memfsPath: MEMFS_FFLATE, runtimeFs: fs });
seedMemfsFromHostPath({ hostPath: HOST_TIMERS, memfsPath: MEMFS_TIMERS, runtimeFs: fs });

const main = posix.join(MEMFS_ROOT, 'app.mjs');
fs.writeFileSync(
  main,
  `import { gzipSync } from 'fflate';
import { setTimeout as delay } from 'isomorphic-timers-promises';

const out = gzipSync(new Uint8Array([1, 2, 3, 4]));
const n = await delay(1, 1);
if (typeof out.length !== 'number' || out.length < 1) throw new Error('gzip');
if (n !== 1) throw new Error('timer');
console.log('multi-pkg-ok');
`,
);

const st = await runtime.runFileAsync(main);
if (st !== 0) fail(`runFileAsync ${st}`);
const out = stdout.join('\n');
if (!out.includes('multi-pkg-ok')) {
  fail(`expected success log: ${JSON.stringify(out)}`);
}

console.log('=== MEMFS multi-package app (fflate + timers) === ok');
