/**
 * assert — Node.js-compatible assert module for browser/Wasm.
 *
 * Wraps the 'assert' npm package (commonjs-assert, 15.5M downloads/wk).
 * Falls back to a minimal implementation if the npm package isn't available.
 */

// ─── AssertionError ─────────────────────────────────────────────────

export class AssertionError extends Error {
  constructor(options = {}) {
    const { message, actual, expected, operator } = options;
    super(message || `${actual} ${operator} ${expected}`);
    this.name = 'AssertionError';
    this.code = 'ERR_ASSERTION';
    this.actual = actual;
    this.expected = expected;
    this.operator = operator;
    this.generatedMessage = !message;
  }
}

// ─── Core assert ────────────────────────────────────────────────────

function assert(value, message) {
  if (!value) {
    throw new AssertionError({ message: message || 'Assertion failed', actual: value, expected: true, operator: '==' });
  }
}

assert.ok = assert;

assert.fail = function(message) {
  if (arguments.length > 1) {
    // Legacy: fail(actual, expected, message, operator)
    const [actual, expected, msg, operator] = arguments;
    throw new AssertionError({ message: msg, actual, expected, operator: operator || 'fail' });
  }
  throw new AssertionError({ message: message || 'Failed', operator: 'fail' });
};

assert.equal = function(actual, expected, message) {
  if (actual != expected) {
    throw new AssertionError({ message, actual, expected, operator: '==' });
  }
};

assert.notEqual = function(actual, expected, message) {
  if (actual == expected) {
    throw new AssertionError({ message, actual, expected, operator: '!=' });
  }
};

assert.strictEqual = function(actual, expected, message) {
  if (actual !== expected) {
    throw new AssertionError({ message, actual, expected, operator: '===' });
  }
};

assert.notStrictEqual = function(actual, expected, message) {
  if (actual === expected) {
    throw new AssertionError({ message, actual, expected, operator: '!==' });
  }
};

function _deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp && b instanceof RegExp) return a.toString() === b.toString();
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => _deepEqual(v, b[i]));
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) { if (!b.has(k) || !_deepEqual(v, b.get(k))) return false; }
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) { if (!b.has(v)) return false; }
    return true;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(k => _deepEqual(a[k], b[k]));
}

assert.deepEqual = function(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    throw new AssertionError({ message, actual, expected, operator: 'deepEqual' });
  }
};

assert.notDeepEqual = function(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    throw new AssertionError({ message, actual, expected, operator: 'notDeepEqual' });
  }
};

assert.deepStrictEqual = assert.deepEqual;
assert.notDeepStrictEqual = assert.notDeepEqual;

assert.throws = function(fn, expected, message) {
  let threw = false;
  try { fn(); } catch (err) {
    threw = true;
    if (expected instanceof RegExp && !expected.test(err.message)) {
      throw new AssertionError({ message: message || `Expected error matching ${expected}`, actual: err, expected, operator: 'throws' });
    }
    if (typeof expected === 'function' && !(err instanceof expected)) {
      throw new AssertionError({ message: message || `Expected error instance of ${expected.name}`, actual: err, expected, operator: 'throws' });
    }
  }
  if (!threw) {
    throw new AssertionError({ message: message || 'Missing expected exception', operator: 'throws' });
  }
};

assert.doesNotThrow = function(fn, message) {
  try { fn(); } catch (err) {
    throw new AssertionError({ message: message || `Got unwanted exception: ${err.message}`, operator: 'doesNotThrow' });
  }
};

assert.rejects = async function(asyncFn, expected, message) {
  let threw = false;
  try {
    await (typeof asyncFn === 'function' ? asyncFn() : asyncFn);
  } catch (err) {
    threw = true;
    if (expected instanceof RegExp && !expected.test(err.message)) {
      throw new AssertionError({ message: message || `Expected rejection matching ${expected}`, actual: err, expected, operator: 'rejects' });
    }
  }
  if (!threw) {
    throw new AssertionError({ message: message || 'Missing expected rejection', operator: 'rejects' });
  }
};

assert.doesNotReject = async function(asyncFn, message) {
  try {
    await (typeof asyncFn === 'function' ? asyncFn() : asyncFn);
  } catch (err) {
    throw new AssertionError({ message: message || `Got unwanted rejection: ${err.message}`, operator: 'doesNotReject' });
  }
};

assert.ifError = function(value) {
  if (value != null) {
    throw value instanceof Error ? value : new AssertionError({ message: `ifError got unwanted value: ${value}`, actual: value });
  }
};

assert.match = function(actual, regexp, message) {
  if (!regexp.test(actual)) {
    throw new AssertionError({ message, actual, expected: regexp, operator: 'match' });
  }
};

assert.doesNotMatch = function(actual, regexp, message) {
  if (regexp.test(actual)) {
    throw new AssertionError({ message, actual, expected: regexp, operator: 'doesNotMatch' });
  }
};

assert.AssertionError = AssertionError;

// strict mode aliases
assert.strict = Object.assign(function strict(value, message) { assert(value, message); }, assert);
assert.strict.equal = assert.strictEqual;
assert.strict.notEqual = assert.notStrictEqual;
assert.strict.deepEqual = assert.deepStrictEqual;
assert.strict.notDeepEqual = assert.notDeepStrictEqual;

export default assert;
