#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const paths = [
  ['wasm', join(rootDir, 'dist', 'edgejs.wasm')],
  ['js', join(rootDir, 'dist', 'edgejs.js')],
];

let ok = true;
for (const [label, p] of paths) {
  if (!existsSync(p)) {
    console.error(`missing ${label}: ${p} (run make build)`);
    ok = false;
    continue;
  }
  const b = statSync(p).size;
  console.log(`${label}\t${p}\t${b} bytes\t${(b / 1024 / 1024).toFixed(2)} MiB`);
}
process.exit(ok ? 0 : 1);
