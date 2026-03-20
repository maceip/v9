import { registerBrowserBuiltins } from '../napi-bridge/browser-builtins.js';
import { builtinModules, createRequire, isBuiltin } from '../napi-bridge/module-shim.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as processEsm from '../napi-bridge/generated-node-api/process-exports.js';
import * as moduleEsm from '../napi-bridge/generated-node-api/module-exports.js';
import * as pathEsm from '../napi-bridge/generated-node-api/path-exports.js';
import * as fsEsm from '../napi-bridge/generated-node-api/fs-exports.js';
import * as childProcessEsm from '../napi-bridge/generated-node-api/child-process-exports.js';
import * as netEsm from '../napi-bridge/generated-node-api/net-exports.js';
import * as dnsEsm from '../napi-bridge/generated-node-api/dns-exports.js';
import * as tlsEsm from '../napi-bridge/generated-node-api/tls-exports.js';
import * as streamEsm from '../napi-bridge/generated-node-api/stream-exports.js';
import * as bufferEsm from '../napi-bridge/generated-node-api/buffer-exports.js';
import * as urlEsm from '../napi-bridge/generated-node-api/url-exports.js';
import * as utilEsm from '../napi-bridge/generated-node-api/util-exports.js';
import * as eventsEsm from '../napi-bridge/generated-node-api/events-exports.js';
import * as timersEsm from '../napi-bridge/generated-node-api/timers-exports.js';
import * as osEsm from '../napi-bridge/generated-node-api/os-exports.js';
import * as cryptoEsm from '../napi-bridge/generated-node-api/crypto-exports.js';
import * as httpEsm from '../napi-bridge/generated-node-api/http-exports.js';
import * as httpsEsm from '../napi-bridge/generated-node-api/https-exports.js';

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

test('module shim exposes compatibility APIs without stub throws', () => {
  const mod = localRequire('module');
  assert(typeof mod.createRequire === 'function', 'module.createRequire should be callable');
  assert(typeof mod.syncBuiltinESMExports === 'function', 'module.syncBuiltinESMExports should be callable');
  assert(typeof mod.findPackageJSON === 'function', 'module.findPackageJSON should be callable');
  assert(typeof mod.getSourceMapsSupport === 'function', 'module.getSourceMapsSupport should be callable');
  assert(typeof mod.setSourceMapsSupport === 'function', 'module.setSourceMapsSupport should be callable');
  mod.syncBuiltinESMExports();
  mod.setSourceMapsSupport(true, { nodeModules: true });
  const sm = mod.getSourceMapsSupport();
  assert(sm.enabled === true, 'source maps support should update through module shim');
});

test('generated ESM wrappers and CJS require share same registry objects', () => {
  const proc = localRequire('process');
  const mod = localRequire('module');
  assert(typeof processEsm.assert === 'function', 'ESM process wrapper should expose assert');
  processEsm.assert(true);
  assert(processEsm.default === proc, 'ESM process default should match CJS process object');
  assert(moduleEsm.default === mod, 'ESM module default should match CJS module object');
  assert(moduleEsm.createRequire === mod.createRequire, 'createRequire should be shared between ESM and CJS');
});

test('litany: generated wrappers match CJS defaults across core modules', () => {
  const wrapperChecks = [
    ['process', processEsm],
    ['module', moduleEsm],
    ['path', pathEsm],
    ['fs', fsEsm],
    ['child_process', childProcessEsm],
    ['net', netEsm],
    ['dns', dnsEsm],
    ['tls', tlsEsm],
    ['stream', streamEsm],
    ['buffer', bufferEsm],
    ['url', urlEsm],
    ['util', utilEsm],
    ['events', eventsEsm],
    ['timers', timersEsm],
    ['os', osEsm],
    ['crypto', cryptoEsm],
    ['http', httpEsm],
    ['https', httpsEsm],
  ];

  for (const [moduleName, esmNamespace] of wrapperChecks) {
    const cjsModule = localRequire(moduleName);
    assert(
      esmNamespace.default === cjsModule,
      `generated ESM default for ${moduleName} should reference CJS registry object`,
    );
  }
});

test('litany: high-traffic named exports stay aligned between ESM and CJS', () => {
  assert(pathEsm.join === localRequire('path').join, 'path.join should stay aligned');
  assert(fsEsm.readFile === localRequire('fs').readFile, 'fs.readFile should stay aligned');
  assert(childProcessEsm.spawn === localRequire('child_process').spawn, 'child_process.spawn should stay aligned');
  assert(netEsm.createConnection === localRequire('net').createConnection, 'net.createConnection should stay aligned');
  assert(dnsEsm.lookup === localRequire('dns').lookup, 'dns.lookup should stay aligned');
  assert(tlsEsm.connect === localRequire('tls').connect, 'tls.connect should stay aligned');
  assert(streamEsm.Readable === localRequire('stream').Readable, 'stream.Readable should stay aligned');
  assert(bufferEsm.Buffer === localRequire('buffer').Buffer, 'buffer.Buffer should stay aligned');
  assert(urlEsm.pathToFileURL === localRequire('url').pathToFileURL, 'url.pathToFileURL should stay aligned');
  assert(utilEsm.format === localRequire('util').format, 'util.format should stay aligned');
  assert(eventsEsm.EventEmitter === localRequire('events').EventEmitter, 'events.EventEmitter should stay aligned');
  assert(timersEsm.setTimeout === localRequire('timers').setTimeout, 'timers.setTimeout should stay aligned');
  assert(osEsm.cpus === localRequire('os').cpus, 'os.cpus should stay aligned');
  assert(cryptoEsm.createHash === localRequire('crypto').createHash, 'crypto.createHash should stay aligned');
  assert(httpEsm.request === localRequire('http').request, 'http.request should stay aligned');
  assert(httpsEsm.request === localRequire('https').request, 'https.request should stay aligned');
});

test('process shim exposes high-frequency APIs without stubs', () => {
  const proc = localRequire('process');
  assert(typeof proc.binding === 'function', 'process.binding should exist');
  assert(typeof proc.getBuiltinModule === 'function', 'process.getBuiltinModule should exist');
  assert(typeof proc.availableMemory === 'function', 'process.availableMemory should exist');
  assert(typeof proc.resourceUsage === 'function', 'process.resourceUsage should exist');
  assert(typeof proc.assert === 'function', 'process.assert should exist');
  proc.assert(true);
  const usage = proc.resourceUsage();
  assert(typeof usage === 'object' && usage !== null, 'resourceUsage should return object');
  assert(typeof proc.binding('fs') === 'object', 'binding shim should return object');
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
  const legacyExportsPathPattern = /"\w[^"]*"\s*:\s*"\.\.\/napi-bridge\/(?!generated-node-api\/)[^"]*-exports\.js"/g;
  assert(!legacyExportsPathPattern.test(html),
    'web import map should not reference legacy *-exports.js wrappers');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);

