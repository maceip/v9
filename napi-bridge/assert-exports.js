// Auto-generated ESM wrapper for node:assert
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 22 exports from Node.js assert

import * as _mod from './assert.js';
const _impl = _mod.default || _mod;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const Assert = typeof _impl.Assert !== 'undefined' ? _impl.Assert : _notImplemented('assert.Assert');
export const AssertionError = typeof _impl.AssertionError !== 'undefined' ? _impl.AssertionError : _notImplemented('assert.AssertionError');
export const CallTracker = typeof _impl.CallTracker !== 'undefined' ? _impl.CallTracker : _notImplemented('assert.CallTracker');
export const deepEqual = typeof _impl.deepEqual !== 'undefined' ? _impl.deepEqual : _notImplemented('assert.deepEqual');
export const deepStrictEqual = typeof _impl.deepStrictEqual !== 'undefined' ? _impl.deepStrictEqual : _notImplemented('assert.deepStrictEqual');
export const doesNotMatch = typeof _impl.doesNotMatch !== 'undefined' ? _impl.doesNotMatch : _notImplemented('assert.doesNotMatch');
export const doesNotReject = typeof _impl.doesNotReject !== 'undefined' ? _impl.doesNotReject : _notImplemented('assert.doesNotReject');
export const doesNotThrow = typeof _impl.doesNotThrow !== 'undefined' ? _impl.doesNotThrow : _notImplemented('assert.doesNotThrow');
export const equal = typeof _impl.equal !== 'undefined' ? _impl.equal : _notImplemented('assert.equal');
export const fail = typeof _impl.fail !== 'undefined' ? _impl.fail : _notImplemented('assert.fail');
export const ifError = typeof _impl.ifError !== 'undefined' ? _impl.ifError : _notImplemented('assert.ifError');
export const match = typeof _impl.match !== 'undefined' ? _impl.match : _notImplemented('assert.match');
export const notDeepEqual = typeof _impl.notDeepEqual !== 'undefined' ? _impl.notDeepEqual : _notImplemented('assert.notDeepEqual');
export const notDeepStrictEqual = typeof _impl.notDeepStrictEqual !== 'undefined' ? _impl.notDeepStrictEqual : _notImplemented('assert.notDeepStrictEqual');
export const notEqual = typeof _impl.notEqual !== 'undefined' ? _impl.notEqual : _notImplemented('assert.notEqual');
export const notStrictEqual = typeof _impl.notStrictEqual !== 'undefined' ? _impl.notStrictEqual : _notImplemented('assert.notStrictEqual');
export const ok = typeof _impl.ok !== 'undefined' ? _impl.ok : _notImplemented('assert.ok');
export const partialDeepStrictEqual = typeof _impl.partialDeepStrictEqual !== 'undefined' ? _impl.partialDeepStrictEqual : _notImplemented('assert.partialDeepStrictEqual');
export const rejects = typeof _impl.rejects !== 'undefined' ? _impl.rejects : _notImplemented('assert.rejects');
export const strict = typeof _impl.strict !== 'undefined' ? _impl.strict : _notImplemented('assert.strict');
export const strictEqual = typeof _impl.strictEqual !== 'undefined' ? _impl.strictEqual : _notImplemented('assert.strictEqual');
export const throws = typeof _impl.throws !== 'undefined' ? _impl.throws : _notImplemented('assert.throws');

const _module = { Assert, AssertionError, CallTracker, deepEqual, deepStrictEqual, doesNotMatch, doesNotReject, doesNotThrow, equal, fail, ifError, match, notDeepEqual, notDeepStrictEqual, notEqual, notStrictEqual, ok, partialDeepStrictEqual, rejects, strict, strictEqual, throws };
export default _module;
