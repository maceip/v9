#!/usr/bin/env node
/**
 * Bundle claude-contract-suite for MEMFS + runtime.runFileAsync (EdgeJS JS bridge path).
 * Output: dist/claude-contract-wasm-lib.cjs + dist/claude-contract-wasm-run.cjs
 *
 * Usage: node scripts/build-claude-contract-wasm.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, '..');
const dist = join(repoRoot, 'dist');
const libOut = join(dist, 'claude-contract-wasm-lib.cjs');
const runOut = join(dist, 'claude-contract-wasm-run.cjs');

mkdirSync(dist, { recursive: true });

await esbuild.build({
  entryPoints: [join(repoRoot, 'tests', 'conformance', 'claude-contract-suite.mjs')],
  bundle: true,
  outfile: libOut,
  format: 'cjs',
  platform: 'node',
  logLevel: 'warning',
  define: {
    'import.meta.url': JSON.stringify('file:///contracts/claude-contract-wasm-lib.cjs'),
  },
});

const runSrc =
  `'use strict';
globalThis.__HARNESS_BROWSER_FINISH__ = true;
const { runClaudeApiContract } = require('/contracts/claude-contract-wasm-lib.cjs');
const __p = runClaudeApiContract();
module.exports = __p;
return __p;
`;
writeFileSync(runOut, runSrc, 'utf8');

console.log(`Bundled wasm contract → ${libOut} + ${runOut}`);
