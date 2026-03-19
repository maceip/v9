import { inspect, isDeepStrictEqual } from 'node:util';

export function createHarness(title) {
  console.log(`=== ${title} ===\n`);

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
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  function assertEq(actual, expected, message) {
    if (!Object.is(actual, expected)) {
      throw new Error(message || `Expected ${inspect(expected)}, got ${inspect(actual)}`);
    }
  }

  function assertDeepEq(actual, expected, message) {
    if (!isDeepStrictEqual(actual, expected)) {
      throw new Error(message || `Expected deep equality.\nexpected: ${inspect(expected)}\nactual: ${inspect(actual)}`);
    }
  }

  function assertThrows(fn, messageOrPattern, message) {
    let thrown = null;
    try {
      fn();
    } catch (error) {
      thrown = error;
    }
    if (!thrown) {
      throw new Error(message || 'Expected function to throw');
    }

    if (messageOrPattern instanceof RegExp) {
      assert(messageOrPattern.test(String(thrown?.message || thrown)),
        message || `Expected error message to match ${messageOrPattern}, got ${thrown?.message}`);
    } else if (typeof messageOrPattern === 'string') {
      assert(String(thrown?.message || thrown).includes(messageOrPattern),
        message || `Expected error message to include ${messageOrPattern}, got ${thrown?.message}`);
    }

    return thrown;
  }

  function finish() {
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
  }

  return {
    test,
    testAsync,
    assert,
    assertEq,
    assertDeepEq,
    assertThrows,
    finish,
  };
}
