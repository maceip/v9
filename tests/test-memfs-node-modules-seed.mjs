#!/usr/bin/env node
/**
 * Proves a real host node_modules package tree can be copied into MEMFS and read back
 * byte-for-byte via runtime.fs (no synthetic FS — see seed-memfs-from-host.mjs).
 *
 * Requires: dist/edgejs.wasm + build/edge (same as other wasm tests).
 *
 * Run: node tests/test-memfs-node-modules-seed.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedMemfsFromHostPath } from './helpers/seed-memfs-from-host.mjs';
import { initRuntimeForTests } from './helpers/runtime-init.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

/** Real dependency already in repo after npm install */
const HOST_PACKAGE = join(rootDir, 'node_modules', 'fflate');
const MEMFS_ROOT = '/workspace';
const MEMFS_NODE_MODULES = posix.join(MEMFS_ROOT, 'node_modules');
const MEMFS_PACKAGE = posix.join(MEMFS_NODE_MODULES, 'fflate');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function walkHostFiles(dir, rootDir, out) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      walkHostFiles(p, rootDir, out);
    } else if (ent.isFile()) {
      out.push(relative(rootDir, p).split(/[/\\]/g).join('/'));
    } else if (ent.isSymbolicLink()) {
      const st = statSync(p);
      if (st.isDirectory()) walkHostFiles(p, rootDir, out);
      else if (st.isFile()) out.push(relative(rootDir, p).split(/[/\\]/g).join('/'));
    }
  }
}

function walkMemfsFiles(fs, dir, pkgRoot, out) {
  for (const name of fs.readdirSync(dir)) {
    const abs = posix.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      walkMemfsFiles(fs, abs, pkgRoot, out);
    } else if (st.isFile()) {
      out.push(posix.relative(pkgRoot, abs));
    }
  }
}

if (!existsSync(HOST_PACKAGE)) {
  fail(`Expected real package at ${HOST_PACKAGE} — run npm ci first`);
}

console.log('=== MEMFS node_modules seed (real disk → MEMFS) ===\n');

const { runtime } = await initRuntimeForTests({
  strictUnknownImports: false,
  captureOutput: true,
  preferJsScriptBridge: true,
});

const fs = runtime.fs;
fs.mkdirSync(MEMFS_ROOT, { recursive: true });

seedMemfsFromHostPath({
  hostPath: HOST_PACKAGE,
  memfsPath: MEMFS_PACKAGE,
  runtimeFs: fs,
});

const listing = fs.readdirSync(MEMFS_NODE_MODULES);
if (!listing.includes('fflate')) {
  fail(`MEMFS ${MEMFS_NODE_MODULES} should contain fflate, got ${JSON.stringify(listing)}`);
}

const pkgJsonMem = fs.readFileSync(posix.join(MEMFS_PACKAGE, 'package.json'), 'utf8');
const pkgHost = readFileSync(join(HOST_PACKAGE, 'package.json'), 'utf8');
if (pkgJsonMem !== pkgHost) {
  fail('package.json content mismatch between host and MEMFS');
}

const meta = JSON.parse(pkgJsonMem);
if (meta.name !== 'fflate') {
  fail(`Expected package name fflate, got ${meta.name}`);
}

const hostRelFiles = [];
walkHostFiles(HOST_PACKAGE, HOST_PACKAGE, hostRelFiles);
hostRelFiles.sort();

const memRelFiles = [];
walkMemfsFiles(fs, MEMFS_PACKAGE, MEMFS_PACKAGE, memRelFiles);
memRelFiles.sort();

if (hostRelFiles.length !== memRelFiles.length) {
  fail(`File count mismatch: host ${hostRelFiles.length} vs MEMFS ${memRelFiles.length}`);
}

for (let i = 0; i < hostRelFiles.length; i++) {
  if (hostRelFiles[i] !== memRelFiles[i]) {
    fail(`Path list mismatch at ${i}: host ${hostRelFiles[i]} vs mem ${memRelFiles[i]}`);
  }
}

for (const rel of hostRelFiles) {
  const hBuf = readFileSync(join(HOST_PACKAGE, rel));
  const mBuf = fs.readFileSync(posix.join(MEMFS_PACKAGE, rel));
  const a = Buffer.from(hBuf);
  const b = Buffer.isBuffer(mBuf) ? mBuf : Buffer.from(mBuf);
  if (a.length !== b.length || sha256(a) !== sha256(b)) {
    fail(`Byte mismatch for ${rel}`);
  }
}

console.log(`  PASS: materialized ${hostRelFiles.length} files from host node_modules/fflate into MEMFS`);
console.log(`  PASS: package.json identity + full tree hash parity`);
console.log('\n=== Results: PASS ===');
