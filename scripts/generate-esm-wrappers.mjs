#!/usr/bin/env node
/**
 * Generate ESM wrapper files for every Node.js built-in module.
 *
 * Reads scripts/node-exports-reference.json (dumped from real Node.js)
 * and creates napi-bridge/*-exports.js wrappers that:
 * 1. Import from our existing implementation
 * 2. Re-export everything we implement as named exports
 * 3. Stub everything we don't with a function that throws "not implemented"
 * 4. Provide a default export matching the full module shape
 *
 * Usage: node scripts/generate-esm-wrappers.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BRIDGE = join(ROOT, 'napi-bridge');

const reference = JSON.parse(readFileSync(join(__dirname, 'node-exports-reference.json'), 'utf8'));

// Map: module name → our implementation file + what it exports
const moduleMap = {
  fs: { file: './fs.js', importStyle: 'default', defaultName: 'fs' },
  path: { file: './browser-builtins.js', importStyle: 'named', namedImport: 'pathBridge' },
  os: { file: './os.js', importStyle: 'default-and-named' },
  crypto: { file: './browser-builtins.js', importStyle: 'named', namedImport: 'cryptoBridge' },
  http: { file: './http.js', importStyle: 'named', namedImport: 'http' },
  https: { file: './http.js', importStyle: 'named', namedImport: 'https' },
  http2: { file: './http.js', importStyle: 'named', namedImport: 'http' }, // stub as http
  net: { file: './net-stubs.js', importStyle: 'named', namedImport: 'net' },
  tls: { file: './net-stubs.js', importStyle: 'named', namedImport: 'tls' },
  dns: { file: './net-stubs.js', importStyle: 'named', namedImport: 'dns' },
  url: { file: './browser-builtins.js', importStyle: 'named', namedImport: 'urlBridge' },
  util: { file: './util.js', importStyle: 'default', defaultName: 'util' },
  buffer: { file: './browser-builtins.js', importStyle: 'custom', customImport: "import { bufferBridge as Buffer } from './browser-builtins.js';\nconst _impl = { Buffer, kMaxLength: 2 ** 31 - 1, constants: { MAX_LENGTH: 2 ** 31 - 1, MAX_STRING_LENGTH: 2 ** 28 - 16 }, SlowBuffer: Buffer, Blob: globalThis.Blob, File: globalThis.File, atob: globalThis.atob, btoa: globalThis.btoa, isAscii: () => false, isUtf8: () => true, transcode: () => { throw new Error('transcode not implemented'); } };" },
  stream: { file: './streams.js', importStyle: 'namespace' },
  events: { file: './eventemitter.js', importStyle: 'namespace' },
  child_process: { file: './child-process.js', importStyle: 'namespace' },
  process: { file: './browser-builtins.js', importStyle: 'named', namedImport: 'processBridge' },
  readline: { file: './readline.js', importStyle: 'namespace' },
  tty: { file: './tty.js', importStyle: 'namespace' },
  zlib: { file: './zlib.js', importStyle: 'namespace' },
  assert: { file: './assert.js', importStyle: 'namespace' },
  module: { file: './module-shim.js', importStyle: 'namespace' },
  string_decoder: { file: './string-decoder.js', importStyle: 'namespace' },
  constants: { file: './constants.js', importStyle: 'namespace' },
  worker_threads: { file: './worker-threads.js', importStyle: 'namespace' },
  async_hooks: { file: './async-hooks.js', importStyle: 'namespace' },
  timers: { file: './timers-promises.js', importStyle: 'default', defaultName: 'timersModule' },
  v8: { file: './inspector.js', importStyle: 'stub-only' },
};

// Skip internal/private exports
function shouldSkip(name) {
  return name.startsWith('_') || name === 'default';
}

function generateWrapper(modName) {
  const ref = reference[modName] || [];
  const config = moduleMap[modName];
  if (!config) return null;

  const exports = ref.filter(n => !shouldSkip(n));
  const lines = [];

  lines.push(`// Auto-generated ESM wrapper for node:${modName}`);
  lines.push(`// Source: scripts/generate-esm-wrappers.mjs`);
  lines.push(`// Reference: ${exports.length} exports from Node.js ${modName}`);
  lines.push('');

  // Import our implementation
  if (config.importStyle === 'default') {
    lines.push(`import ${config.defaultName} from '${config.file}';`);
  } else if (config.importStyle === 'named') {
    lines.push(`import { ${config.namedImport} } from '${config.file}';`);
    lines.push(`const _impl = ${config.namedImport};`);
  } else if (config.importStyle === 'namespace') {
    lines.push(`import * as _mod from '${config.file}';`);
    lines.push(`const _impl = _mod.default || _mod;`);
  } else if (config.importStyle === 'default-and-named') {
    lines.push(`import _impl from '${config.file}';`);
  } else if (config.importStyle === 'stub-only') {
    lines.push(`const _impl = {};`);
  }

  lines.push('');
  lines.push(`function _notImplemented(name) {`);
  lines.push(`  return function() { throw new Error(\`\${name} is not implemented in the browser runtime\`); };`);
  lines.push(`}`);
  lines.push('');

  // Determine the source object name
  let src;
  if (config.importStyle === 'default') src = config.defaultName;
  else src = '_impl';

  // Generate named exports
  for (const name of exports) {
    // Check if it's a valid JS identifier
    if (!/^[a-zA-Z$_][a-zA-Z0-9$_]*$/.test(name)) continue;

    lines.push(`export const ${name} = typeof ${src}.${name} !== 'undefined' ? ${src}.${name} : _notImplemented('${modName}.${name}');`);
  }

  lines.push('');

  // Build the full module object for default export
  lines.push(`const _module = { ${exports.filter(n => /^[a-zA-Z$_][a-zA-Z0-9$_]*$/.test(n)).join(', ')} };`);
  lines.push(`export default _module;`);

  return lines.join('\n') + '\n';
}

// Generate all wrappers
let count = 0;
for (const modName of Object.keys(moduleMap)) {
  const content = generateWrapper(modName);
  if (!content) continue;

  const outFile = join(BRIDGE, `${modName.replace('/', '-')}-exports.js`);
  writeFileSync(outFile, content);
  console.log(`  ✓ ${modName} → ${outFile.replace(ROOT, '.')} (${reference[modName]?.length || 0} exports)`);
  count++;
}

console.log(`\nGenerated ${count} ESM wrapper files.`);
console.log('Update web/index.html import map to point to these files.');
