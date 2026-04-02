#!/usr/bin/env node
/**
 * Syntax-only check for repo JS/MJS (no ESLint dependency).
 * Skips vendored / generated trees.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const SKIP_DIRS = new Set([
  'node_modules',
  'edgejs-src',
  '.git',
  '.tmp',
  'dist',
  'build',
]);

function* walkFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walkFiles(p);
    } else if (ent.isFile() && /\.(mjs|cjs|js)$/i.test(ent.name)) {
      yield p;
    }
  }
}

const roots = ['napi-bridge', 'tests', 'scripts', 'web'].map((r) => join(rootDir, r));

let failed = false;
for (const base of roots) {
  try {
    statSync(base);
  } catch {
    continue;
  }
  for (const file of walkFiles(base)) {
    const r = spawnSync(process.execPath, ['--check', file], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    if (r.status !== 0) {
      failed = true;
      console.error(`--check ${relative(rootDir, file)}`);
      if (r.stderr) console.error(r.stderr);
      if (r.stdout) console.error(r.stdout);
    }
  }
}

if (failed) {
  console.error('\nlint-repo: syntax check failed');
  process.exit(1);
}
console.log('lint-repo: ok');
