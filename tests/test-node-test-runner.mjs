#!/usr/bin/env node
/**
 * Milestone: real Node `node --test` on a committed fixture (host-side runner).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/node-test-example/parity.test.mjs', import.meta.url));
const r = spawnSync(process.execPath, ['--test', fixture], { encoding: 'utf8' });

if (r.status !== 0) {
  console.error('FAIL: node --test', r.stderr || r.stdout);
  process.exit(1);
}

console.log('=== node --test fixture === ok');
