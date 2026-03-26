/**
 * run-oneshot.mjs — Verify that the EdgeJS Wasm binary can:
 *   1. Self-initialize (load module, set up MEMFS, call _main)
 *   2. Resolve internal dependencies (built-in modules)
 *   3. Write a CLI blob to MEMFS and execute it
 *   4. Stream output to captured stdout/stderr via EventEmitter bridge
 *   5. Complete without silent hangs
 *
 * Usage:
 *   node tests/run-oneshot.mjs [--bundle path/to/bundle.js]
 *
 * Without --bundle, uses a synthetic script that exercises the same code paths
 * a real CLI bundle would (require, EventEmitter, stdout streaming, async).
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { EventEmitter } from '../napi-bridge/eventemitter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// ---- Parse args ----
const args = process.argv.slice(2);
const bundleFlag = args.indexOf('--bundle');
const bundlePath = bundleFlag !== -1 ? args[bundleFlag + 1] : null;

// ---- Timeout guard ----
const TIMEOUT_MS = 30_000;
const timer = setTimeout(() => {
  console.error(`\nFATAL: oneshot test timed out after ${TIMEOUT_MS / 1000}s — silent hang detected`);
  process.exit(2);
}, TIMEOUT_MS);
timer.unref();

// ---- Output capture via EventEmitter ----
const outputEmitter = new EventEmitter();
const captured = { stdout: [], stderr: [], events: [] };

outputEmitter.on('stdout', (text) => captured.stdout.push(text));
outputEmitter.on('stderr', (text) => captured.stderr.push(text));
outputEmitter.on(EventEmitter.errorMonitor, (err) => {
  captured.events.push({ type: 'errorMonitor', message: err.message });
});

// ---- Test harness ----
let passed = 0;
let failed = 0;

function test(name, condition, detail) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

console.log('=== EdgeJS One-Shot Execution Test ===\n');

// ---- Phase 1: Load runtime ----
console.log('Phase 1: Runtime initialization');

const wasmPath = join(rootDir, 'dist', 'edgejs.wasm');
const modulePath = join(rootDir, 'build', 'edge.js');

test('dist/edgejs.wasm exists', existsSync(wasmPath), wasmPath);
test('build/edge.js exists', existsSync(modulePath), modulePath);

if (!existsSync(wasmPath) || !existsSync(modulePath)) {
  console.error('\nCannot proceed without build artifacts. Run: make build');
  process.exit(1);
}

const { initEdgeJS } = await import('../napi-bridge/index.js');

// Load the Emscripten module factory.
// edge.js uses `var EdgeJSModule = (...)` with no module.exports, and the
// package has "type": "module" so dynamic import treats .js as ESM.
// Solution: read the file, evaluate it, and extract the global.
let moduleFactory;
try {
  const edgeSource = readFileSync(modulePath, 'utf8');
  // Evaluate in a context where require() is available (Emscripten uses it)
  const { createRequire } = await import('node:module');
  const require = createRequire(modulePath);
  const fn = new Function('require', '__filename', '__dirname', edgeSource + '\nreturn EdgeJSModule;');
  moduleFactory = fn(require, modulePath, dirname(modulePath));
  test('Emscripten module factory loaded', typeof moduleFactory === 'function',
    `got ${typeof moduleFactory}`);
} catch (err) {
  test('Emscripten module factory loaded', false, err.message);
}

let runtime;
try {
  runtime = await initEdgeJS({
    moduleFactory,
    wasmPath: '../dist/edgejs.wasm',
    onStdout: (...args) => {
      const text = args.map(String).join(' ');
      outputEmitter.emit('stdout', text);
    },
    onStderr: (...args) => {
      const text = args.map(String).join(' ');
      outputEmitter.emit('stderr', text);
    },
    strictUnknownImports: false,
    diagnosticsEnabled: true,
  });
  test('initEdgeJS() completes without hang', true);
} catch (err) {
  test('initEdgeJS() completes without hang', false, err.message);
  console.error('\nRuntime failed to initialize:', err);
  process.exit(1);
}

test('runtime.eval is a function', typeof runtime.eval === 'function');
test('runtime.runFile is a function', typeof runtime.runFile === 'function');
test('runtime.fs exists', !!runtime.fs);
test('runtime._main or module available', !!runtime.module);

// ---- Phase 2: Heap allocation ----
console.log('\nPhase 2: Wasm heap allocation');

let allocOk = false;
try {
  const mod = runtime.module;
  if (mod && typeof mod._malloc === 'function' && typeof mod._free === 'function') {
    const size = 1024 * 1024; // 1MB
    const ptr = mod._malloc(size);
    test('_malloc(1MB) returns non-zero pointer', ptr > 0, `ptr=${ptr}`);

    // Write pattern to verify memory is writable
    if (ptr > 0 && mod.HEAPU8) {
      mod.HEAPU8[ptr] = 0xDE;
      mod.HEAPU8[ptr + 1] = 0xAD;
      test('Wasm heap is writable', mod.HEAPU8[ptr] === 0xDE && mod.HEAPU8[ptr + 1] === 0xAD);
      allocOk = true;
    }

    mod._free(ptr);
    test('_free() does not throw', true);
  } else {
    test('_malloc/_free exported', false, 'functions not available on module');
  }
} catch (err) {
  test('heap allocation', false, err.message);
}

// ---- Phase 3: Write script to MEMFS and execute ----
console.log('\nPhase 3: MEMFS write + script execution');

// Synthetic CLI blob that exercises:
// - require() for built-in modules (path, os, events)
// - EventEmitter creation and emission
// - stdout streaming (multiple writes)
// - Async completion
const syntheticScript = `
'use strict';

// Test built-in module resolution
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

// Verify modules loaded
console.log('MODULE_CHECK:path=' + (typeof path.join === 'function'));
console.log('MODULE_CHECK:os=' + (typeof os.platform === 'function'));
console.log('MODULE_CHECK:events=' + (typeof EventEmitter === 'function'));

// Test EventEmitter bridge
const emitter = new EventEmitter();
let received = [];

emitter.on('data', (chunk) => {
  received.push(chunk);
});

emitter.emit('data', 'chunk1');
emitter.emit('data', 'chunk2');
emitter.emit('data', 'chunk3');

console.log('EMITTER_COUNT=' + received.length);
console.log('EMITTER_DATA=' + received.join(','));

// Test streaming output (multiple console.log calls)
for (let i = 0; i < 5; i++) {
  console.log('STREAM_LINE_' + i);
}

// Report success
console.log('ONESHOT_STATUS=ok');
`;

let scriptToRun;
let scriptPath;

if (bundlePath) {
  // Use real CLI bundle
  console.log(`  Using external bundle: ${bundlePath}`);
  if (!existsSync(bundlePath)) {
    console.error(`  Bundle not found: ${bundlePath}`);
    process.exit(1);
  }
  scriptToRun = readFileSync(bundlePath, 'utf8');
  scriptPath = '/app/bundle.js';
  console.log(`  Bundle size: ${(scriptToRun.length / 1024 / 1024).toFixed(2)} MB`);
} else {
  scriptToRun = syntheticScript;
  scriptPath = '/app/oneshot.js';
}

// Write to MEMFS
try {
  runtime.fs.mkdirSync('/app', { recursive: true });
  test('mkdirSync /app succeeds', true);
} catch (err) {
  test('mkdirSync /app succeeds', false, err.message);
}

try {
  runtime.fs.writeFileSync(scriptPath, scriptToRun);
  const stat = runtime.fs.statSync(scriptPath);
  test('writeFileSync writes script to MEMFS', stat && stat.size > 0,
    `size=${stat ? stat.size : 0}, expected=${scriptToRun.length}`);
} catch (err) {
  test('writeFileSync writes script to MEMFS', false, err.message);
}

// Verify we can read it back
try {
  const readBack = runtime.fs.readFileSync(scriptPath, 'utf8');
  test('readFileSync reads back identical content', readBack === scriptToRun,
    `readBack.length=${readBack.length} vs original=${scriptToRun.length}`);
} catch (err) {
  test('readFileSync reads back identical content', false, err.message);
}

// ---- Phase 4: Execute the script ----
console.log('\nPhase 4: Script execution via _main');

// Clear captured output
captured.stdout.length = 0;
captured.stderr.length = 0;

let execResult;
let execError;
try {
  execResult = runtime.runFile(scriptPath);
  // Allow microtask queue to flush stdout batching
  await new Promise(r => setTimeout(r, 100));
  test('runFile() completes without hang', true);
  test('runFile() returns exit code 0', execResult === 0, `exitCode=${execResult}`);
} catch (err) {
  execError = err;
  // HEAPU32 undefined = Emscripten memory views not initialized in Node.js
  // pthread context. This is a known bridge-level issue, not a test bug.
  const isMemViewBug = err.message.includes('Cannot set properties of undefined');
  if (isMemViewBug) {
    test('runFile() completes without hang', false,
      'HEAPU32 undefined — Emscripten memory views not wired in Node.js pthread mode');
    console.log('  NOTE: _main invocation requires Emscripten memory view initialization.');
    console.log('  The binary loaded and heap allocated successfully (Phase 2).');
    console.log('  This is a bridge wiring issue, not a build or MEMFS issue.');
  } else {
    test('runFile() completes without hang', false, err.message);
    console.error('  Stack:', err.stack?.split('\n').slice(0, 5).join('\n  '));
  }
}

// ---- Phase 5: Verify output ----
console.log('\nPhase 5: Output verification');

const allStdout = captured.stdout.join('');
const allStderr = captured.stderr.join('');

if (execError) {
  console.log('  SKIP: Script execution failed — output verification skipped');
} else if (!bundlePath) {
  test('stdout captured (non-empty)', allStdout.length > 0, `length=${allStdout.length}`);
  // Verify synthetic script output
  test('path module resolved', allStdout.includes('MODULE_CHECK:path=true'));
  test('os module resolved', allStdout.includes('MODULE_CHECK:os=true'));
  test('events module resolved', allStdout.includes('MODULE_CHECK:events=true'));
  test('EventEmitter emitted 3 chunks', allStdout.includes('EMITTER_COUNT=3'));
  test('EventEmitter data correct', allStdout.includes('EMITTER_DATA=chunk1,chunk2,chunk3'));

  // Verify streaming (all 5 lines present)
  let streamCount = 0;
  for (let i = 0; i < 5; i++) {
    if (allStdout.includes(`STREAM_LINE_${i}`)) streamCount++;
  }
  test('all 5 stream lines received', streamCount === 5, `got ${streamCount}/5`);
  test('ONESHOT_STATUS=ok received', allStdout.includes('ONESHOT_STATUS=ok'));
} else {
  console.log(`  stdout length: ${allStdout.length} chars`);
  console.log(`  stderr length: ${allStderr.length} chars`);
  if (allStdout.length > 0) {
    console.log(`  stdout preview: ${allStdout.substring(0, 200)}...`);
  }
}

// ---- Phase 6: EventEmitter bridge verification ----
console.log('\nPhase 6: EventEmitter bridge integration');

// Verify the output emitter worked correctly
test('outputEmitter received stdout events', captured.stdout.length > 0,
  `events=${captured.stdout.length}`);

// Test static once() with the output emitter
const oncePromise = EventEmitter.once(outputEmitter, 'test-signal');
outputEmitter.emit('test-signal', 'payload');
const onceResult = await oncePromise;
test('EventEmitter.once() resolves with args', onceResult[0] === 'payload');

// Test static on() async iterator
const iter = EventEmitter.on(outputEmitter, 'iter-test');
outputEmitter.emit('iter-test', 'a');
outputEmitter.emit('iter-test', 'b');
const first = await iter.next();
const second = await iter.next();
await iter.return();
test('EventEmitter.on() async iterator yields events',
  first.value[0] === 'a' && second.value[0] === 'b');

// Test errorMonitor
const monitorEmitter = new EventEmitter();
let monitorFired = false;
monitorEmitter.on(EventEmitter.errorMonitor, () => { monitorFired = true; });
monitorEmitter.on('error', () => {}); // prevent throw
monitorEmitter.emit('error', new Error('test'));
test('errorMonitor fires on error event', monitorFired);

// ---- Phase 7: Diagnostics ----
console.log('\nPhase 7: Diagnostics');

if (typeof runtime.diagnostics === 'function') {
  const diag = runtime.diagnostics();
  test('diagnostics() returns object', typeof diag === 'object');
  if (diag.missingImports) {
    console.log(`  Missing N-API imports: ${diag.missingImports.length}`);
    if (diag.missingImports.length > 0 && diag.missingImports.length <= 10) {
      diag.missingImports.forEach(m => console.log(`    - ${m}`));
    }
  }
} else {
  test('diagnostics() available', false, 'not a function');
}

// ---- Summary ----
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

clearTimeout(timer);
process.exit(failed > 0 ? 1 : 0);
