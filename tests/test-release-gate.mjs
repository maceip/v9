import {
  evaluateChecklistDocument,
  evaluateRuntimeWrapperFallbacks,
  evaluateTestSuppressions,
  evaluateVerificationCommands,
  findForbiddenTestSuppressions,
} from '../scripts/release-gate.mjs';

console.log('=== Release Gate Tests ===\n');

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
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

test('checklist document passes when all required checkpoint IDs exist', () => {
  const markdown = [
    'P1-GATE-STRICT-BUILD',
    'P1-GATE-BROWSER-INSTANTIATION',
    'P2-GATE-NAPI-CONFORMANCE',
    'P2-GATE-RUNTIME-CONTRACT',
    'P2-GATE-SOAK-EVIDENCE',
    'P2-GATE-RELEASE-GUARDS',
  ].join('\n');
  const result = evaluateChecklistDocument(markdown);
  assertEq(result.ok, true);
});

test('checklist document fails when required checkpoint IDs are missing', () => {
  const result = evaluateChecklistDocument('P1-GATE-STRICT-BUILD');
  assertEq(result.ok, false);
  assert(result.details.some((detail) => detail.includes('P2-GATE-NAPI-CONFORMANCE')),
    'missing phase 2 checkpoint should be reported');
});

test('test suppression detection finds || true in test targets', () => {
  const matches = findForbiddenTestSuppressions({
    Makefile: 'test-napi:\n\tnode tests/test-napi-bridge.mjs || true\n',
    'package.json': '{"scripts":{"test":"node tests/test-basic.mjs"}}',
  });
  assertEq(matches.length, 1);
  assert(matches[0].snippet.includes('|| true'));
});

test('test suppression evaluation passes when test commands are strict', () => {
  const result = evaluateTestSuppressions({
    Makefile: 'test-napi:\n\tnode tests/test-napi-bridge.mjs\n',
    'package.json': '{"scripts":{"test":"node tests/test-basic.mjs && node tests/test-napi-bridge.mjs"}}',
  });
  assertEq(result.ok, true);
});

test('runtime wrapper fallback detection flags temp-script markers', () => {
  const result = evaluateRuntimeWrapperFallbacks('const evalPath = `/__edge_eval_123`; process.exit(0);');
  assertEq(result.ok, false);
  assert(result.details.some((detail) => detail.includes('process.exit(0);')));
});

test('runtime wrapper fallback detection passes when wrapper markers are absent', () => {
  const result = evaluateRuntimeWrapperFallbacks('export function evalCode(code) { return code.length; }');
  assertEq(result.ok, true);
});

test('verification command evaluation reports failures', () => {
  const result = evaluateVerificationCommands([
    { command: 'node tests/test-basic.mjs', ok: true, status: 0 },
    { command: 'node tests/test-napi-bridge.mjs', ok: false, status: 1 },
  ]);
  assertEq(result.ok, false);
  assert(result.details[0].includes('test-napi-bridge'));
});

test('verification command evaluation passes when all commands succeed', () => {
  const result = evaluateVerificationCommands([
    { command: 'node tests/test-basic.mjs', ok: true, status: 0 },
    { command: 'node tests/test-napi-bridge.mjs', ok: true, status: 0 },
  ]);
  assertEq(result.ok, true);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
