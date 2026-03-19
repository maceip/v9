import { createHarness } from './_harness.mjs';
import { loadUtilModule, printConformanceTarget } from './_targets.mjs';

const { test, testAsync, assert, assertEq, finish } = createHarness('Conformance: util');

printConformanceTarget('util');
const { util } = await loadUtilModule();

await testAsync('util.promisify resolves callback-style functions', async () => {
  const callbackStyle = (a, b, cb) => cb(null, a + b);
  const promised = util.promisify(callbackStyle);
  const value = await promised(2, 3);
  assertEq(value, 5);
});

await testAsync('util.promisify rejects when callback receives an error', async () => {
  const callbackStyle = (_a, _b, cb) => cb(new Error('boom'));
  const promised = util.promisify(callbackStyle);

  let message = '';
  try {
    await promised(1, 2);
  } catch (error) {
    message = error.message;
  }
  assertEq(message, 'boom');
});

test('util.inherits sets up prototype chain', () => {
  function SuperType() {
    this.base = true;
  }
  SuperType.prototype.ping = function ping() {
    return 'pong';
  };

  function SubType() {
    SuperType.call(this);
    this.child = true;
  }

  util.inherits(SubType, SuperType);
  const instance = new SubType();

  assertEq(instance instanceof SubType, true);
  assertEq(instance instanceof SuperType, true);
  assertEq(instance.ping(), 'pong');
  assertEq(SubType.super_, SuperType);
});

test('util.types.isPromise identifies only Promise instances', () => {
  assertEq(util.types.isPromise(Promise.resolve(1)), true);
  assertEq(util.types.isPromise({ then() {} }), false);
});

test('util.types.isDate identifies Date instances', () => {
  assertEq(util.types.isDate(new Date()), true);
  assertEq(util.types.isDate('2020-01-01'), false);
});

test('util.types.isRegExp identifies RegExp instances', () => {
  assertEq(util.types.isRegExp(/abc/), true);
  assertEq(util.types.isRegExp('abc'), false);
});

test('util.inspect provides a basic string representation', () => {
  const inspected = util.inspect({ a: 1, b: 'x' });
  assertEq(typeof inspected, 'string');
  assert(inspected.includes('a'));
  assert(inspected.includes('1'));
});

test('util.inspect handles circular references', () => {
  const obj = { name: 'root' };
  obj.self = obj;
  const inspected = util.inspect(obj);
  assertEq(typeof inspected, 'string');
  assert(inspected.includes('Circular'));
});

finish();
