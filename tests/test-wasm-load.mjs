/**
 * Smoke test for EdgeJS .wasm binary loading.
 *
 * Verifies the .wasm validates, compiles, and has expected exports.
 * Run with: node tests/test-wasm-load.mjs
 *
 * Phase 1 deliverable: proves .wasm is valid WebAssembly.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmPath = join(__dirname, '..', 'dist', 'edgejs.wasm');

console.log('=== EdgeJS Wasm Load Tests ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} — ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// --- Check file exists ---
if (!existsSync(wasmPath)) {
  console.log(`  SKIP: ${wasmPath} not found — run 'make build' first`);
  console.log('\n=== Results: 0 passed, 0 failed (skipped) ===');
  process.exit(0);
}

const wasmBuffer = readFileSync(wasmPath);

// --- WebAssembly.validate ---
test('WebAssembly.validate returns true', () => {
  const valid = WebAssembly.validate(wasmBuffer);
  assert(valid === true, 'wasm binary must pass validation');
});

// --- WebAssembly.compile ---
let wasmModule;
try {
  wasmModule = await WebAssembly.compile(wasmBuffer);
  console.log('  PASS: WebAssembly.compile succeeds (no traps)');
  passed++;
} catch (e) {
  console.log(`  FAIL: WebAssembly.compile — ${e.message}`);
  failed++;
  console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  process.exit(1);
}

// --- Check exports ---
const exports = WebAssembly.Module.exports(wasmModule);
const exportNames = exports.map((e) => e.name);

test('exports include _malloc', () => {
  assert(exportNames.includes('malloc') || exportNames.includes('_malloc'),
    'expected malloc in exports');
});

test('exports include _free', () => {
  assert(exportNames.includes('free') || exportNames.includes('_free'),
    'expected free in exports');
});

test('exports include entry point (_main or main)', () => {
  const hasMain = exportNames.includes('main') || exportNames.includes('_main');
  assert(hasMain, 'expected main entry point in exports');
});

// --- Check imports ---
const imports = WebAssembly.Module.imports(wasmModule);
test('module has imports (env namespace for N-API)', () => {
  assert(imports.length > 0, 'expected module to have imports');
  const envImports = imports.filter((i) => i.module === 'env');
  assert(envImports.length > 0, 'expected env namespace in imports');
});

// --- Report binary size ---
const sizeMB = (wasmBuffer.length / 1024 / 1024).toFixed(2);
console.log(`\n  Binary size: ${sizeMB} MB (raw)`);

// --- Optional: attempt instantiation (may fail for complex modules) ---
try {
  const stubbedImports = {};
  for (const imp of imports) {
    if (!stubbedImports[imp.module]) stubbedImports[imp.module] = {};
    stubbedImports[imp.module][imp.name] = () => {};
  }
  const instance = await WebAssembly.instantiate(wasmModule, stubbedImports);
  if (typeof instance.exports.malloc === 'function' ||
      typeof instance.exports._malloc === 'function') {
    console.log('  PASS: instantiation succeeded, malloc callable');
    passed++;
  }
} catch (e) {
  console.log('  INFO: instantiation skipped (expected for Phase 1):', e.message);
}

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
