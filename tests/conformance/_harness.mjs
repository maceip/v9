import { inspect, isDeepStrictEqual } from 'node:util';

/** Throw from inside testAsync() to skip (no network, wrong platform, etc.). */
export class HarnessSkip extends Error {
  constructor(reason) {
    super(reason || '');
    this.name = 'HarnessSkip';
  }
}

export function createHarness(title) {
  console.log(`=== ${title} ===\n`);

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  /** Log a skipped test (e.g. offline / wrong host); does not count as pass or fail. */
  function skip(name, reason) {
    const tail = reason ? ` — ${reason}` : '';
    console.log(`  SKIP: ${name}${tail}`);
    skipped++;
  }

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
      if (error instanceof HarnessSkip) {
        const tail = error.message ? ` — ${error.message}` : '';
        console.log(`  SKIP: ${name}${tail}`);
        skipped++;
        return;
      }
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
    const skipPart = skipped ? `, ${skipped} skipped` : '';
    console.log(`\n=== Results: ${passed} passed${skipPart}, ${failed} failed ===`);
    if (globalThis.__HARNESS_BROWSER_FINISH__) {
      globalThis.__HARNESS_BROWSER_RESULT__ = { passed, skipped, failed, ok: failed === 0 };
      return;
    }
    process.exit(failed > 0 ? 1 : 0);
  }

  return {
    test,
    testAsync,
    skip,
    assert,
    assertEq,
    assertDeepEq,
    assertThrows,
    finish,
  };
}
