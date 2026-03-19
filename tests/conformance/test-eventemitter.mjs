import { createHarness } from './_harness.mjs';
import { loadEventEmitterModule, printConformanceTarget } from './_targets.mjs';

const { test, assert, assertEq, assertDeepEq, assertThrows, finish } =
  createHarness('Conformance: EventEmitter');

printConformanceTarget('events');
const { EventEmitter } = await loadEventEmitterModule();

test('on() returns emitter and emit() is synchronous in registration order', () => {
  const emitter = new EventEmitter();
  const calls = [];

  const returnValue = emitter
    .on('ready', () => calls.push('first'))
    .on('ready', () => calls.push('second'));

  assertEq(returnValue, emitter, 'on() should return emitter for chaining');
  const emitted = emitter.emit('ready');
  assertEq(emitted, true, 'emit() should return true when listeners exist');
  assertDeepEq(calls, ['first', 'second']);
});

test('emit() returns false when no listeners exist', () => {
  const emitter = new EventEmitter();
  assertEq(emitter.emit('missing-event'), false);
});

test('once() fires callback exactly once', () => {
  const emitter = new EventEmitter();
  let count = 0;
  emitter.once('tick', () => count++);

  emitter.emit('tick');
  emitter.emit('tick');
  assertEq(count, 1);
});

test('off()/removeListener() remove a specific listener by reference', () => {
  const emitter = new EventEmitter();
  let count = 0;
  const listener = () => count++;

  emitter.on('evt', listener);
  emitter.off('evt', listener);
  emitter.emit('evt');
  assertEq(count, 0);

  emitter.on('evt', listener);
  emitter.removeListener('evt', listener);
  emitter.emit('evt');
  assertEq(count, 0);
});

test('removeAllListeners(event) and removeAllListeners() clear listeners', () => {
  const emitter = new EventEmitter();
  emitter.on('a', () => {});
  emitter.on('a', () => {});
  emitter.on('b', () => {});

  emitter.removeAllListeners('a');
  assertEq(emitter.listenerCount('a'), 0);
  assertEq(emitter.listenerCount('b'), 1);

  emitter.removeAllListeners();
  assertEq(emitter.listenerCount('b'), 0);
  assertEq(emitter.eventNames().length, 0);
});

test('listenerCount(), listeners(), and eventNames() expose listener state', () => {
  const emitter = new EventEmitter();
  const a = () => {};
  const b = () => {};
  const sym = Symbol('sym');
  emitter.on('x', a);
  emitter.on('x', b);
  emitter.on(sym, () => {});

  assertEq(emitter.listenerCount('x'), 2);
  const listeners = emitter.listeners('x');
  assertEq(listeners.length, 2);
  listeners.pop();
  assertEq(emitter.listenerCount('x'), 2, 'listeners() must return a copy');

  const names = emitter.eventNames();
  assert(names.includes('x'), 'eventNames should include string event');
  assert(names.includes(sym), 'eventNames should include symbol event');
});

test('prependListener() adds the callback to the beginning', () => {
  const emitter = new EventEmitter();
  const calls = [];
  emitter.on('ev', () => calls.push('second'));
  emitter.prependListener('ev', () => calls.push('first'));
  emitter.emit('ev');
  assertDeepEq(calls, ['first', 'second']);
});

test('setMaxListeners()/getMaxListeners() round-trip threshold value', () => {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(25);
  assertEq(emitter.getMaxListeners(), 25);
});

test("emit('error') throws when there is no error listener", () => {
  const emitter = new EventEmitter();
  assertThrows(
    () => emitter.emit('error', new Error('boom')),
    /boom/,
    'Unhandled error event should throw the provided error',
  );
});

test("emit('error') with a listener does not throw", () => {
  const emitter = new EventEmitter();
  let message = '';
  emitter.on('error', (error) => {
    message = error.message;
  });

  const emitted = emitter.emit('error', new Error('handled'));
  assertEq(emitted, true);
  assertEq(message, 'handled');
});

test('removeListener during emit still invokes removed listener for current emit', () => {
  const emitter = new EventEmitter();
  const calls = [];

  function first() {
    calls.push('first');
    emitter.off('ev', second);
  }

  function second() {
    calls.push('second');
  }

  emitter.on('ev', first);
  emitter.on('ev', second);

  emitter.emit('ev');
  emitter.emit('ev');
  assertDeepEq(calls, ['first', 'second', 'first']);
});

test('once listener is removed before callback executes', () => {
  const emitter = new EventEmitter();
  let countInsideCallback = -1;
  emitter.once('ev', () => {
    countInsideCallback = emitter.listenerCount('ev');
  });
  emitter.emit('ev');
  assertEq(countInsideCallback, 0);
});

test("'newListener' fires before listener is added", () => {
  const emitter = new EventEmitter();
  let observedCount = -1;
  emitter.on('newListener', (eventName) => {
    if (eventName === 'ev') {
      observedCount = emitter.listenerCount('ev');
    }
  });
  emitter.on('ev', () => {});
  assertEq(observedCount, 0);
});

test("'removeListener' fires after listener is removed", () => {
  const emitter = new EventEmitter();
  let observedCount = -1;
  const listener = () => {};
  emitter.on('removeListener', (eventName, removedListener) => {
    if (eventName === 'ev' && removedListener === listener) {
      observedCount = emitter.listenerCount('ev');
    }
  });
  emitter.on('ev', listener);
  emitter.off('ev', listener);
  assertEq(observedCount, 0);
});

test('Symbol event names are supported', () => {
  const emitter = new EventEmitter();
  const eventName = Symbol('event');
  let count = 0;
  emitter.on(eventName, () => count++);
  emitter.emit(eventName);
  assertEq(count, 1);
});

finish();
