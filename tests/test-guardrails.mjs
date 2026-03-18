/**
 * Static and behavioral guardrails:
 * - no suppressed test failures via `|| true` in test paths
 * - strict unknown-import mode throws instead of silently succeeding
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NapiBridge } from '../napi-bridge/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

console.log('=== Guardrail Tests ===\n');

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

test('Makefile test targets do not suppress failures with || true', () => {
  const makefile = readFileSync(join(rootDir, 'Makefile'), 'utf8');
  const lines = makefile.split('\n');
  const violations = lines.filter((line) =>
    /test[-\w]*:|node tests\//.test(line) && line.includes('|| true'));
  assert(violations.length === 0,
    `suppressed test failures found: ${violations.join(' | ')}`);
});

test('package test scripts do not suppress failures with || true', () => {
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
  const scripts = pkg.scripts || {};
  const violations = Object.entries(scripts)
    .filter(([name, command]) => name.startsWith('test') && String(command).includes('|| true'));
  assert(violations.length === 0,
    `suppressed test scripts found: ${JSON.stringify(violations)}`);
});

test('unknown N-API imports return callable stubs that fail (not NAPI_OK)', () => {
  const bridge = new NapiBridge(null);
  const imports = bridge.getImportModule();
  const stub = imports.__missing_import_for_guardrail;
  assert(typeof stub === 'function', 'unknown import must be callable (Wasm requires it)');
  const status = stub();
  assert(status !== 0, `unknown import must NOT return NAPI_OK (0), got ${status}`);
  const count = bridge.missingImports.get('__missing_import_for_guardrail') || 0;
  assert(count === 1, `expected missing import counter to be 1, got ${count}`);
});

test('integration/nightly test paths enforce strict import mode', () => {
  const makefile = readFileSync(join(rootDir, 'Makefile'), 'utf8');
  assert(makefile.includes('EDGEJS_STRICT_IMPORTS=1 node tests/test-wasm-load.mjs'),
    'Makefile integration tier must enable strict import mode');
  assert(makefile.includes('EDGEJS_STRICT_IMPORTS=1 node tests/test-soak.mjs --profile nightly'),
    'Makefile nightly tier must enable strict import mode');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
