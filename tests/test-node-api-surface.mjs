import { registerBrowserBuiltins } from '../napi-bridge/browser-builtins.js';
import { builtinModules, createRequire, isBuiltin } from '../napi-bridge/module-shim.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('=== Node API Surface Tests ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL: ${name} — ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertThrows(fn, regex, message) {
  let thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  if (!thrown) {
    throw new Error(message || 'Expected function to throw');
  }
  if (regex && !regex.test(String(thrown.message || thrown))) {
    throw new Error(message || `Expected error message to match ${regex}, got ${thrown.message}`);
  }
}

const registered = new Map();
const fakeEdgeInstance = {
  _registerBuiltinOverride(name, mod) {
    registered.set(name, mod);
  },
  _memfsRequire(name) {
    throw new Error(`missing module: ${name}`);
  },
};

const builtins = registerBrowserBuiltins(fakeEdgeInstance);
const localRequire = createRequire('/app/index.js');
const testDir = fileURLToPath(new URL('.', import.meta.url));

test('registerBrowserBuiltins includes additional Node core modules', () => {
  assert(registered.has('cluster'), 'cluster should be registered');
  assert(registered.has('node:cluster'), 'node:cluster should be registered');
  assert(registered.has('vm'), 'vm should be registered');
  assert(registered.has('node:vm'), 'node:vm should be registered');
  assert(registered.has('wasi'), 'wasi should be registered');
  assert(registered.has('node:wasi'), 'node:wasi should be registered');
});

test('module shim builtinModules includes expanded surface', () => {
  assert(builtinModules.includes('cluster'), 'builtinModules should include cluster');
  assert(builtinModules.includes('vm'), 'builtinModules should include vm');
  assert(isBuiltin('node:cluster') === true, 'isBuiltin should accept node: prefix');
});

test('CJS createRequire resolves expanded surface modules', () => {
  const cluster = localRequire('cluster');
  assert(cluster && typeof cluster === 'object', 'cluster must be an object module');
  assert(typeof cluster.fork === 'function', 'cluster.fork should be present');
  assertThrows(
    () => cluster.fork(),
    /ERR_EDGEJS_NOT_IMPLEMENTED|not implemented/i,
    'cluster.fork should throw a clear not implemented error',
  );
});

test('existing implemented modules are still available', () => {
  const pathModule = localRequire('path');
  assert(typeof pathModule.join === 'function', 'path.join should remain available');
  assert(pathModule.join('/a', 'b') === '/a/b', 'path.join should still behave correctly');
});

test('default export is present for synthetic modules', () => {
  const vm = localRequire('vm');
  assert(vm.default === vm, 'synthetic modules should expose default self-export');
});

test('network-adjacent shims expose callable compatibility APIs', () => {
  const dns = localRequire('dns');
  const net = localRequire('net');
  const tls = localRequire('tls');
  assert(typeof dns.lookup === 'function', 'dns.lookup should be callable');
  assert(typeof dns.promises.lookup === 'function', 'dns.promises.lookup should be callable');
  assert(typeof net.createConnection === 'function', 'net.createConnection should be callable');
  assert(typeof tls.connect === 'function', 'tls.connect should be callable');
});

test('registerBrowserBuiltins return object is expanded', () => {
  assert(Object.prototype.hasOwnProperty.call(builtins, 'cluster'), 'returned builtins should include cluster');
  assert(Object.prototype.hasOwnProperty.call(builtins, 'trace_events'), 'returned builtins should include trace_events');
});

test('generated import map includes expanded ESM entries', () => {
  const importMapPath = join(testDir, '..', 'web', 'node-api-importmap.generated.json');
  const importMap = JSON.parse(readFileSync(importMapPath, 'utf8'));
  assert(importMap.imports.cluster, 'generated map should include cluster');
  assert(importMap.imports['node:cluster'], 'generated map should include node:cluster');
});

test('web import map uses generated wrappers for core modules', () => {
  const htmlPath = join(testDir, '..', 'web', 'index.html');
  const html = readFileSync(htmlPath, 'utf8');
  assert(html.includes('../napi-bridge/generated-node-api/process-exports.js'),
    'web import map should route process through generated-node-api');
  assert(html.includes('../napi-bridge/generated-node-api/child-process-exports.js'),
    'web import map should route child_process through generated-node-api');
  assert(html.includes('../napi-bridge/generated-node-api/module-exports.js'),
    'web import map should route module through generated-node-api');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);

