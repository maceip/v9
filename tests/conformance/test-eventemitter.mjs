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

// ---- Static method tests ----

test('static once() resolves with event args', async () => {
  const emitter = new EventEmitter();
  const promise = EventEmitter.once(emitter, 'ready');
  emitter.emit('ready', 'arg1', 'arg2');
  const result = await promise;
  assertDeepEq(result, ['arg1', 'arg2']);
});

test('static once() rejects on error event', async () => {
  const emitter = new EventEmitter();
  const promise = EventEmitter.once(emitter, 'data');
  emitter.emit('error', new Error('fail'));
  let caught;
  try { await promise; } catch (e) { caught = e; }
  assert(caught instanceof Error, 'should reject with the error');
  assertEq(caught.message, 'fail');
});

test('static once() cleans up listeners after resolve', async () => {
  const emitter = new EventEmitter();
  const promise = EventEmitter.once(emitter, 'done');
  emitter.emit('done');
  await promise;
  assertEq(emitter.listenerCount('done'), 0, 'event listener should be removed');
  assertEq(emitter.listenerCount('error'), 0, 'error listener should be removed');
});

test('static on() returns async iterator that yields event args', async () => {
  const emitter = new EventEmitter();
  const iter = EventEmitter.on(emitter, 'data');

  emitter.emit('data', 'a');
  emitter.emit('data', 'b');

  const first = await iter.next();
  assertDeepEq(first.value, ['a']);
  assertEq(first.done, false);

  const second = await iter.next();
  assertDeepEq(second.value, ['b']);
  assertEq(second.done, false);

  const end = await iter.return();
  assertEq(end.done, true);
  assertEq(emitter.listenerCount('data'), 0, 'listeners cleaned up after return');
});

test('static on() rejects pending next() on error', async () => {
  const emitter = new EventEmitter();
  const iter = EventEmitter.on(emitter, 'msg');

  const pending = iter.next();
  emitter.emit('error', new Error('stream error'));
  let caught;
  try { await pending; } catch (e) { caught = e; }
  assert(caught instanceof Error);
  assertEq(caught.message, 'stream error');

  await iter.return();
});

test('static getEventListeners() returns listener copies', () => {
  const emitter = new EventEmitter();
  const fn = () => {};
  emitter.on('x', fn);
  const listeners = EventEmitter.getEventListeners(emitter, 'x');
  assertEq(listeners.length, 1);
  assertEq(listeners[0], fn);
});

test('static listenerCount() returns correct count', () => {
  const emitter = new EventEmitter();
  emitter.on('a', () => {});
  emitter.on('a', () => {});
  assertEq(EventEmitter.listenerCount(emitter, 'a'), 2);
  assertEq(EventEmitter.listenerCount(emitter, 'b'), 0);
});

test('errorMonitor fires before error listeners without consuming the error', () => {
  const emitter = new EventEmitter();
  const calls = [];

  emitter.on(EventEmitter.errorMonitor, (err) => {
    calls.push('monitor:' + err.message);
  });
  emitter.on('error', (err) => {
    calls.push('handler:' + err.message);
  });

  emitter.emit('error', new Error('boom'));
  assertDeepEq(calls, ['monitor:boom', 'handler:boom']);
});

test('errorMonitor fires even when error will throw (no error listener)', () => {
  const emitter = new EventEmitter();
  let monitored = false;

  emitter.on(EventEmitter.errorMonitor, () => {
    monitored = true;
  });

  assertThrows(() => emitter.emit('error', new Error('unhandled')), /unhandled/);
  assertEq(monitored, true, 'errorMonitor should fire before the throw');
});

test('captureRejections routes async errors to error event', async () => {
  const prev = EventEmitter.captureRejections;
  try {
    EventEmitter.captureRejections = true;
    const emitter = new EventEmitter();
    let capturedError = null;

    emitter.on('error', (err) => { capturedError = err; });
    emitter.on('data', async () => { throw new Error('async fail'); });

    emitter.emit('data');
    // Wait for microtask to process the rejection
    await new Promise(r => setTimeout(r, 10));
    assert(capturedError instanceof Error, 'error should be captured');
    assertEq(capturedError.message, 'async fail');
  } finally {
    EventEmitter.captureRejections = prev;
  }
});

test('captureRejectionSymbol handler is called for async rejections', async () => {
  const prev = EventEmitter.captureRejections;
  try {
    EventEmitter.captureRejections = true;
    const emitter = new EventEmitter();
    let handledErr = null;
    let handledEvent = null;

    emitter[EventEmitter.captureRejectionSymbol] = function(err, event) {
      handledErr = err;
      handledEvent = event;
    };
    emitter.on('req', async () => { throw new Error('rejected'); });

    emitter.emit('req');
    await new Promise(r => setTimeout(r, 10));
    assert(handledErr instanceof Error);
    assertEq(handledErr.message, 'rejected');
    assertEq(handledEvent, 'req');
  } finally {
    EventEmitter.captureRejections = prev;
  }
});

test('static setMaxListeners() sets default and per-emitter', () => {
  const prev = EventEmitter.defaultMaxListeners;
  try {
    EventEmitter.setMaxListeners(50);
    assertEq(EventEmitter.defaultMaxListeners, 50);

    const a = new EventEmitter();
    const b = new EventEmitter();
    EventEmitter.setMaxListeners(99, a, b);
    assertEq(a.getMaxListeners(), 99);
    assertEq(b.getMaxListeners(), 99);
    // Default should be unchanged
    assertEq(EventEmitter.defaultMaxListeners, 50);
  } finally {
    EventEmitter.defaultMaxListeners = prev;
  }
});

test('static getMaxListeners() returns emitter max', () => {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(42);
  assertEq(EventEmitter.getMaxListeners(emitter), 42);
});

finish();
