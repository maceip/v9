/**
 * Strict wasm smoke test:
 * - artifact exists
 * - validates + compiles
 * - exports/imports shape is sane
 * - runtime instantiates through the real N-API bridge import object
 * - diagnostics stay clean (no missing imports / import errors)
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initEdgeJS } from '../napi-bridge/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const wasmPath = join(rootDir, 'dist', 'edgejs.wasm');
const moduleFactoryPath = join(rootDir, 'build', 'edge');

console.log('=== EdgeJS Wasm Load Tests (strict) ===\n');

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

function failNow(message) {
  console.log(`  FAIL: ${message}`);
  console.log(`\n=== Results: ${passed} passed, ${failed + 1} failed ===`);
  process.exit(1);
}

if (!existsSync(wasmPath)) {
  failNow(`${wasmPath} not found (run 'make build' first)`);
}
if (!existsSync(moduleFactoryPath)) {
  failNow(`${moduleFactoryPath} not found (run 'make build' first)`);
}

const wasmBuffer = readFileSync(wasmPath);

test('WebAssembly.validate returns true', () => {
  const valid = WebAssembly.validate(wasmBuffer);
  assert(valid === true, 'wasm binary must pass validation');
});

let wasmModule;
try {
  wasmModule = await WebAssembly.compile(wasmBuffer);
  console.log('  PASS: WebAssembly.compile succeeds (no traps)');
  passed++;
} catch (e) {
  failNow(`WebAssembly.compile failed — ${e.message}`);
}

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
  const hasMain =
    exportNames.includes('main') ||
    exportNames.includes('_main') ||
    exportNames.includes('__main_argc_argv');
  assert(hasMain, 'expected entry point export (main/_main/__main_argc_argv)');
});

const imports = WebAssembly.Module.imports(wasmModule);
test('module imports include napi/env namespaces', () => {
  assert(imports.length > 0, 'expected module to have imports');
  const modules = new Set(imports.map((i) => i.module));
  assert(modules.has('napi'), 'expected napi namespace imports');
  assert(modules.has('env'), 'expected env namespace imports');
});

const sizeMB = (wasmBuffer.length / 1024 / 1024).toFixed(2);
console.log(`\n  Binary size: ${sizeMB} MB (raw)`);

let runtime;
try {
  runtime = await initEdgeJS({
    moduleUrl: './__missing_edge_module__.js',
    modulePath: '../build/edge',
    wasmPath: '../dist/edgejs.wasm',
    strictUnknownImports: process.env.EDGEJS_STRICT_IMPORTS === '1',
    onStdout: () => {},
    onStderr: () => {},
  });
  console.log('  PASS: runtime instantiated using real bridge import object');
  passed++;
} catch (e) {
  failNow(`runtime instantiation failed — ${e.message}`);
}

test('runtime surface exports eval/runFile/fs', () => {
  assert(runtime && typeof runtime === 'object', 'runtime should be object');
  assert(typeof runtime.eval === 'function', 'runtime.eval should be a function');
  assert(typeof runtime.runFile === 'function', 'runtime.runFile should be a function');
  assert(runtime.fs && typeof runtime.fs.writeFile === 'function',
    'runtime.fs.writeFile should exist');
});

test('bridge diagnostics are clean post-init', () => {
  const diagnostics = runtime.diagnostics();
  const missingImports = Object.keys(diagnostics.missingImports || {});
  const importErrors = Object.keys(diagnostics.importErrors || {});
  assert(missingImports.length === 0,
    `expected no missing imports, got: ${missingImports.join(', ')}`);
  assert(importErrors.length === 0,
    `expected no import errors, got: ${importErrors.join(', ')}`);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
