#!/usr/bin/env node
/**
 * Single validation gate for “Node.js in a tab”: both runtimes that ship together.
 *
 *   Phase 1 — Chromium host: import map + polyfills (same shape as web/index.html).
 *   Phase 2 — EdgeJS VM: MEMFS + runFileAsync (bundled suite, JS script bridge path).
 *
 * One process, one exit code: both must pass. Do not split this in CI.
 *
 * Optional maintainer flags (undocumented in package.json):
 *   --browser-only | --wasm-only
 *
 * Usage:
 *   node tests/test-node-in-tab-contract.mjs
 *   npm run test:nodejs-in-tab-contract
 */
import { runBrowserHostContractPhase } from './helpers/contract-phase-browser.mjs';
import { runWasmMemfsContractPhase } from './helpers/contract-phase-wasm.mjs';

const argv = new Set(process.argv.slice(2));
const browserOnly = argv.has('--browser-only');
const wasmOnly = argv.has('--wasm-only');
const mode = browserOnly ? 'browser' : wasmOnly ? 'wasm' : 'both';

console.log('=== Node.js-in-tab contract (unified gate) ===');
console.log(`Mode: ${mode} — same suite, two runtimes that ship together.\n`);

let failed = 0;

if (mode === 'both' || mode === 'browser') {
  console.log('— Phase 1/2: Browser host (Chromium + import map + COOP/COEP) —');
  const b = await runBrowserHostContractPhase();
  if (b.ok) {
    console.log(`  PASS: ${b.name} (${b.checksPassed} checks)`);
    for (const n of b.notes) console.log(`        ${n}`);
  } else {
    failed++;
    console.log(`  FAIL: ${b.name}`);
    for (const n of b.notes) console.log(`        ${n}`);
    if (b.error) console.log(`        ${b.error}`);
  }
  console.log('');
}

if (mode === 'both' || mode === 'wasm') {
  console.log('— Phase 2/2: Wasm runtime (initEdgeJS MEMFS + runFileAsync) —');
  const w = await runWasmMemfsContractPhase({ runBuild: mode === 'both' || wasmOnly });
  if (w.ok) {
    console.log(`  PASS: ${w.name}`);
    for (const n of w.notes) console.log(`        ${n}`);
  } else {
    failed++;
    console.log(`  FAIL: ${w.name}`);
    for (const n of w.notes) console.log(`        ${n}`);
  }
}

console.log(`\n=== Unified contract: ${failed === 0 ? 'PASS' : 'FAIL'} (${failed} failed phases) ===`);
process.exit(failed > 0 ? 1 : 0);
