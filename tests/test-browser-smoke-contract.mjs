#!/usr/bin/env node

import { loadBrowserSmokeContract } from './helpers/browser-smoke-contract.mjs';

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
  if (!condition) throw new Error(message);
}

console.log('=== Browser Smoke Contract Tests ===\n');

const contract = await loadBrowserSmokeContract();

test('schema version is v1', () => {
  assert(contract.schemaVersion === 1, `expected schemaVersion=1, got ${contract.schemaVersion}`);
});

test('scenario IDs are unique', () => {
  const ids = contract.scenarios.map((s) => s.id);
  assert(new Set(ids).size === ids.length, `duplicate scenario IDs: ${JSON.stringify(ids)}`);
});

test('scenario names are unique', () => {
  const names = contract.scenarios.map((s) => s.displayName);
  assert(new Set(names).size === names.length, `duplicate scenario names: ${JSON.stringify(names)}`);
});

test('conversation scenario points to existing scenario', () => {
  const found = contract.scenarios.some((s) => s.id === contract.conversation.scenarioId);
  assert(found, `conversation scenarioId ${contract.conversation.scenarioId} not found in scenarios`);
});

test('known skip entries include issue URLs and future expiry', () => {
  for (const scenario of contract.scenarios) {
    for (const skip of scenario.knownSkips || []) {
      assert(/^https?:\/\//.test(skip.issueUrl), `${scenario.id}:${skip.code} missing issueUrl`);
      const expiresMs = Date.parse(`${skip.expiresOn}T00:00:00Z`);
      const todayMs = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
      assert(expiresMs >= todayMs, `${scenario.id}:${skip.code} skip expired on ${skip.expiresOn}`);
    }
  }
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
