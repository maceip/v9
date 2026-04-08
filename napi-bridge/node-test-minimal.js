/**
 * In-tab `node:test` subset: nested `describe`, async tests, suite-scoped hooks.
 * Not spec-complete (no TAP stream, no concurrency limits, no snapshot).
 */

/** @type {{ before: Function[], after: Function[], beforeEach: Function[], afterEach: Function[], _beforeRan?: boolean, _pending?: (() => Promise<void>)[] } | null} */
let _activeHookFrame = null;

function emptyFrame() {
  return {
    before: [],
    after: [],
    beforeEach: [],
    afterEach: [],
    _beforeRan: false,
    _pending: /** @type {(() => Promise<void>)[]} */ ([]),
  };
}

function hookFrame() {
  return _activeHookFrame || emptyFrame();
}

async function maybeAwait(v) {
  if (v != null && typeof v.then === 'function') await v;
}

async function runFn(name, fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('test() requires a function');
  }
  const hooks = hookFrame();
  if (!hooks._beforeRan && hooks.before.length) {
    hooks._beforeRan = true;
    for (const h of hooks.before) await maybeAwait(h());
  }
  const ctx = {
    name,
    signal: { aborted: false },
    diagnostic: () => {},
  };
  for (const h of hooks.beforeEach) await maybeAwait(h());
  try {
    const ret = fn(ctx);
    await maybeAwait(ret);
  } finally {
    for (const h of hooks.afterEach) await maybeAwait(h());
  }
}

/**
 * Queues the test on the active suite; `describe` runs queued tests in order so hooks do not interleave.
 * @returns {void}
 */
export function test(name, options, fn) {
  if (typeof name !== 'string') throw new TypeError('test name must be a string');
  if (typeof options === 'function') {
    fn = options;
    options = undefined;
  }
  if (options && typeof options === 'object' && options.skip) return;
  if (_activeHookFrame?._pending) {
    _activeHookFrame._pending.push(() => runFn(name, fn));
  }
}

export async function describe(name, options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = undefined;
  }
  if (typeof fn !== 'function') return;
  const frame = emptyFrame();
  const prev = _activeHookFrame;
  _activeHookFrame = frame;
  try {
    const ret = fn();
    await maybeAwait(ret);
    for (const runQueued of frame._pending) await runQueued();
  } finally {
    for (const h of frame.after) await maybeAwait(h());
    _activeHookFrame = prev;
  }
}

export function it(name, options, fn) {
  test(name, options, fn);
}

export function before(fn) {
  if (typeof fn === 'function' && _activeHookFrame) _activeHookFrame.before.push(fn);
}

export function after(fn) {
  if (typeof fn === 'function' && _activeHookFrame) _activeHookFrame.after.push(fn);
}

export function beforeEach(fn) {
  if (typeof fn === 'function' && _activeHookFrame) _activeHookFrame.beforeEach.push(fn);
}

export function afterEach(fn) {
  if (typeof fn === 'function' && _activeHookFrame) _activeHookFrame.afterEach.push(fn);
}

/**
 * Run a block with a fresh hook frame (for tests that need `before`/`after` outside `describe`).
 */
export async function run(options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = undefined;
  }
  if (typeof fn !== 'function') return;
  const frame = emptyFrame();
  const prev = _activeHookFrame;
  _activeHookFrame = frame;
  try {
    const ret = fn();
    await maybeAwait(ret);
    for (const runQueued of frame._pending) await runQueued();
  } finally {
    for (const h of frame.after) await maybeAwait(h());
    _activeHookFrame = prev;
  }
}

const mod = {
  test,
  describe,
  it,
  before,
  after,
  beforeEach,
  afterEach,
  run,
  default: {
    test, describe, it, before, after, beforeEach, afterEach, run,
  },
};

export default mod;
