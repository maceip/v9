#!/usr/bin/env node
/**
 * Bundle in-tab-api-contract-suite for MEMFS + runtime.runFileAsync (EdgeJS JS bridge path).
 * Output: dist/in-tab-api-contract-wasm-lib.cjs + dist/in-tab-api-contract-wasm-run.cjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, '..');
const dist = join(repoRoot, 'dist');
const libOut = join(dist, 'in-tab-api-contract-wasm-lib.cjs');
const runOut = join(dist, 'in-tab-api-contract-wasm-run.cjs');

mkdirSync(dist, { recursive: true });

await esbuild.build({
  entryPoints: [join(repoRoot, 'tests', 'conformance', 'in-tab-api-contract-suite.mjs')],
  bundle: true,
  outfile: libOut,
  format: 'cjs',
  platform: 'node',
  logLevel: 'warning',
  define: {
    'import.meta.url': JSON.stringify('file:///contracts/in-tab-api-contract-wasm-lib.cjs'),
  },
});

const runSrc =
  `'use strict';
globalThis.__HARNESS_BROWSER_FINISH__ = true;
const { runInTabApiContract } = require('/contracts/in-tab-api-contract-wasm-lib.cjs');
const __p = runInTabApiContract();
module.exports = __p;
return __p;
`;
writeFileSync(runOut, runSrc, 'utf8');

console.log(`Bundled wasm contract → ${libOut} + ${runOut}`);
