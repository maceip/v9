import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  DEFAULT_POLICY_PATH,
  evaluateCheck,
  evaluateReleaseGate,
  getJsonValue,
  validatePolicy,
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

async function testAsync(name, fn) {
  try {
    await fn();
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

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function writeJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture(policyOverride = {}) {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'release-gate-'));
  const basePolicy = {
    version: 1,
    phase: 'fixture-phase',
    owner: 'Codex',
    checks: [
      {
        id: 'required-documents',
        type: 'required_files',
        description: 'required files exist',
        files: ['docs/a.md', 'docs/b.md'],
      },
      {
        id: 'no-test-suppression',
        type: 'forbidden_pattern',
        description: 'no || true in Makefile test targets',
        file: 'Makefile',
        pattern: '(^|\\n)[^\\n]*test[^\\n]*\\|\\|\\s*true',
        flags: 'g',
      },
      {
        id: 'evidence-pass',
        type: 'json_field_equals',
        description: 'evidence status is pass',
        file: '.planning/evidence/phase-close/fixture.json',
        path: ['artifacts', 'smoke', 'status'],
        expected: 'pass',
      },
      {
        id: 'command-pass',
        type: 'command',
        description: 'command succeeds',
        command: ['node', 'tests/test-basic.mjs'],
      },
      {
        id: 'custom-pass',
        type: 'custom',
        description: 'custom check passes',
        name: 'fixture_custom_check',
      },
    ],
    checkpoints: [
      {
        id: 'CP-ALL-GREEN',
        description: 'all fixture checks pass',
        requires: ['required-documents', 'no-test-suppression', 'evidence-pass', 'command-pass', 'custom-pass'],
      },
    ],
  };

  const policy = { ...basePolicy, ...policyOverride };
  const policyPath = path.join(rootDir, DEFAULT_POLICY_PATH);
  writeJson(policyPath, policy);
  mkdirSync(path.join(rootDir, 'docs'), { recursive: true });
  writeFileSync(path.join(rootDir, 'docs/a.md'), 'a\n');
  writeFileSync(path.join(rootDir, 'docs/b.md'), 'b\n');
  writeFileSync(path.join(rootDir, 'Makefile'), 'test:\n\tnode tests/test-basic.mjs\n');
  writeJson(path.join(rootDir, '.planning/evidence/phase-close/fixture.json'), {
    artifacts: {
      smoke: {
        status: 'pass',
      },
    },
  });
  return rootDir;
}

test('validatePolicy rejects unknown checkpoint dependencies', () => {
  try {
    validatePolicy({
      checks: [{ id: 'known', type: 'required_files', description: 'x', files: [] }],
      checkpoints: [{ id: 'cp', description: 'cp', requires: ['missing'] }],
    });
    throw new Error('validatePolicy should have thrown');
  } catch (error) {
    assert(String(error.message).includes('unknown check missing'));
  }
});

test('getJsonValue resolves nested values and reports missing paths', () => {
  const resolved = getJsonValue({ a: { b: 3 } }, ['a', 'b']);
  assertEq(resolved.found, true);
  assertEq(resolved.value, 3);

  const missing = getJsonValue({ a: {} }, ['a', 'c']);
  assertEq(missing.found, false);
});

await testAsync('evaluateCheck reports forbidden patterns with file context', async () => {
  const rootDir = createFixture();
  writeFileSync(path.join(rootDir, 'Makefile'), 'test:\n\tnode tests/test-basic.mjs || true\n');
  const result = await evaluateCheck(rootDir, {
    id: 'no-test-suppression',
    type: 'forbidden_pattern',
    description: 'no || true in Makefile test targets',
    file: 'Makefile',
    pattern: '(^|\\n)[^\\n]*test[^\\n]*\\|\\|\\s*true',
    flags: 'g',
  });
  assertEq(result.ok, false);
  assert(result.details[0].includes('Makefile'));
});

await testAsync('evaluateReleaseGate passes a green fixture with structured policy + evidence', async () => {
  const rootDir = createFixture();
  const report = await evaluateReleaseGate(rootDir, {
    runCommand(_fixtureRoot, argv) {
      return {
        command: argv.join(' '),
        ok: true,
        status: 0,
        stdout: '',
        stderr: '',
        error: '',
      };
    },
    customChecks: {
      fixture_custom_check() {
        return {
          id: 'custom-pass',
          ok: true,
          summary: 'custom check passes',
          details: [],
        };
      },
    },
  });

  assertEq(report.ok, true);
  assertEq(report.checkpoints[0].ok, true);
});

await testAsync('evaluateReleaseGate fails when structured evidence is missing', async () => {
  const rootDir = createFixture();
  writeJson(path.join(rootDir, '.planning/evidence/phase-close/fixture.json'), { artifacts: {} });
  const report = await evaluateReleaseGate(rootDir, {
    runCommand(_fixtureRoot, argv) {
      return {
        command: argv.join(' '),
        ok: true,
        status: 0,
        stdout: '',
        stderr: '',
        error: '',
      };
    },
    customChecks: {
      fixture_custom_check() {
        return {
          id: 'custom-pass',
          ok: true,
          summary: 'custom check passes',
          details: [],
        };
      },
    },
  });

  const evidenceCheck = report.checks.find((check) => check.id === 'evidence-pass');
  assertEq(evidenceCheck.ok, false);
  assertEq(report.ok, false);
});

await testAsync('evaluateReleaseGate fails when a custom check is unresolved', async () => {
  const rootDir = createFixture();
  let threw = false;
  try {
    await evaluateReleaseGate(rootDir, {
      runCommand(_fixtureRoot, argv) {
        return {
          command: argv.join(' '),
          ok: true,
          status: 0,
          stdout: '',
          stderr: '',
          error: '',
        };
      },
    });
  } catch (error) {
    threw = true;
    assert(String(error.message).includes('fixture_custom_check'));
  }
  assertEq(threw, true);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
