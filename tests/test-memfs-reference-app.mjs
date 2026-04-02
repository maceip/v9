#!/usr/bin/env node
/**
 * Reference-app slice: real host package seed → require() from MEMFS → minimal API call.
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
const MEMFS_ROOT = '/workspace';
const MEMFS_PKG = posix.join(MEMFS_ROOT, 'node_modules', 'fflate');

if (!existsSync(HOST_FFLATE)) fail(`Missing ${HOST_FFLATE} — run npm ci`);

const { runtime } = await initRuntimeForTests({ preferJsScriptBridge: true, captureOutput: true });
const fs = runtime.fs;
fs.mkdirSync(MEMFS_ROOT, { recursive: true });
seedMemfsFromHostPath({ hostPath: HOST_FFLATE, memfsPath: MEMFS_PKG, runtimeFs: fs });

const main = posix.join(MEMFS_ROOT, 'use-fflate.js');
fs.writeFileSync(
  main,
  `
const f = require('fflate');
if (typeof f.gzipSync !== 'function') {
  throw new Error('fflate.gzipSync missing');
}
const out = f.gzipSync(Buffer.from('hello'));
const ok =
  out != null &&
  typeof out.length === 'number' &&
  out.length > 0 &&
  (Buffer.isBuffer(out) || out instanceof Uint8Array);
if (!ok) throw new Error('bad gzip output');
console.log('reference-app-ok');
`,
);

const st = await runtime.runNodeEntry({ entry: main, cwd: MEMFS_ROOT });
if (st.status !== 0) {
  fail(`reference app failed: ${st.stderr.join('\n')}`);
}

console.log('=== MEMFS reference app (fflate) === ok');
