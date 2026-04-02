#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const entry = join(root, 'tests/fixtures/bundle-smoke/entry.js');
const dir = mkdtempSync(join(tmpdir(), 'bundle-graph-'));
const outfile = join(dir, 'out.cjs');
mkdirSync(dir, { recursive: true });

const b = spawnSync(
  process.execPath,
  [join(root, 'scripts/bundle-app-graph.mjs'), '--entry', entry, '--outfile', outfile],
  { encoding: 'utf8', cwd: root },
);
if (b.status !== 0) {
  console.error('bundle failed', b.stderr || b.stdout);
  process.exit(1);
}
const code = readFileSync(outfile, 'utf8');
if (!code.includes('bundle-smoke')) {
  console.error('expected bundled stdout path in output');
  process.exit(1);
}
const r = spawnSync(process.execPath, [outfile], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error('run bundle failed', r.stderr || r.stdout);
  process.exit(1);
}
if (!(r.stdout || '').includes('bundle-smoke 42')) {
  console.error('unexpected run output', r.stdout);
  process.exit(1);
}
rmSync(dir, { recursive: true, force: true });
console.log('=== bundle-app-graph === ok');
