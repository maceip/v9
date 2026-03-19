/**
 * async_hooks — Node.js-compatible async_hooks for browser/Wasm.
 *
 * Provides working AsyncLocalStorage (critical for Claude Code's request
 * context tracking) and stub AsyncResource/createHook.
 *
 * AsyncLocalStorage implementation uses synchronous run()/exit() propagation
 * (same approach as unenv).
 */

import { EventEmitter } from './eventemitter.js';

// ─── AsyncLocalStorage ──────────────────────────────────────────────
// Uses AsyncContext-style propagation: each instance stores context in a
// global slot that is captured at promise-creation time via patched
// Promise.then/catch/finally. This ensures context survives across await.

// Global registry of active AsyncLocalStorage instances so promise hooks
// can snapshot/restore all of them.
const _alsInstances = new Set();

// Patch Promise once to propagate ALS context across microtask boundaries.
const _OrigPromise = Promise;
let _patched = false;

function _patchPromise() {
  if (_patched) return;
  _patched = true;

  const origThen = _OrigPromise.prototype.then;

  _OrigPromise.prototype.then = function(onFulfilled, onRejected) {
    // Capture current context for all ALS instances
    const snapshot = _captureSnapshot();
    const wrappedFulfilled = typeof onFulfilled === 'function'
      ? (...a) => _runWithSnapshot(snapshot, () => onFulfilled(...a))
      : onFulfilled;
    const wrappedRejected = typeof onRejected === 'function'
      ? (...a) => _runWithSnapshot(snapshot, () => onRejected(...a))
      : onRejected;
    return origThen.call(this, wrappedFulfilled, wrappedRejected);
  };

  // catch and finally are built on then, but re-patch for safety
  _OrigPromise.prototype.catch = function(onRejected) {
    return this.then(undefined, onRejected);
  };

  _OrigPromise.prototype.finally = function(onFinally) {
    return this.then(
      (value) => _OrigPromise.resolve(typeof onFinally === 'function' ? onFinally() : onFinally).then(() => value),
      (reason) => _OrigPromise.resolve(typeof onFinally === 'function' ? onFinally() : onFinally).then(() => { throw reason; }),
    );
  };
}

function _captureSnapshot() {
  const snap = new Map();
  for (const als of _alsInstances) {
    snap.set(als, { store: als._store, enabled: als._enabled });
  }
  return snap;
}

function _runWithSnapshot(snapshot, fn) {
  const prev = _captureSnapshot();
  for (const [als, state] of snapshot) {
    als._store = state.store;
    als._enabled = state.enabled;
  }
  try {
    return fn();
  } finally {
    for (const [als, state] of prev) {
      als._store = state.store;
      als._enabled = state.enabled;
    }
  }
}

export class AsyncLocalStorage {
  constructor() {
    this._store = undefined;
    this._enabled = false;
    _alsInstances.add(this);
    _patchPromise();
  }

  disable() {
    this._store = undefined;
    this._enabled = false;
  }

  getStore() {
    return this._enabled ? this._store : undefined;
  }

  run(store, callback, ...args) {
    const prev = this._store;
    const wasEnabled = this._enabled;
    this._store = store;
    this._enabled = true;
    try {
      return callback(...args);
    } finally {
      this._store = prev;
      this._enabled = wasEnabled;
    }
  }

  exit(callback, ...args) {
    const prev = this._store;
    const wasEnabled = this._enabled;
    this._store = undefined;
    this._enabled = false;
    try {
      return callback(...args);
    } finally {
      this._store = prev;
      this._enabled = wasEnabled;
    }
  }

  enterWith(store) {
    this._store = store;
    this._enabled = true;
  }

  static bind(fn) {
    const snapshot = _captureSnapshot();
    return (...args) => _runWithSnapshot(snapshot, () => fn(...args));
  }

  static snapshot() {
    const snapshot = _captureSnapshot();
    return (fn, ...args) => _runWithSnapshot(snapshot, () => fn(...args));
  }
}

// ─── AsyncResource ──────────────────────────────────────────────────

export class AsyncResource {
  constructor(type, triggerAsyncId) {
    this.type = type;
    this._asyncId = _nextAsyncId++;
    this._triggerAsyncId = triggerAsyncId || 0;
  }

  asyncId() {
    return this._asyncId;
  }

  triggerAsyncId() {
    return this._triggerAsyncId;
  }

  runInAsyncScope(fn, thisArg, ...args) {
    return fn.apply(thisArg, args);
  }

  emitDestroy() {
    return this;
  }

  bind(fn, thisArg) {
    const resource = this;
    const bound = function(...args) {
      return resource.runInAsyncScope(fn, thisArg || this, ...args);
    };
    bound.asyncResource = resource;
    return bound;
  }

  static bind(fn, type, thisArg) {
    type = type || fn.name || 'bound-anonymous-fn';
    return new AsyncResource(type).bind(fn, thisArg);
  }
}

let _nextAsyncId = 1;

// ─── createHook / executionAsyncId / triggerAsyncId ─────────────────

export function createHook(callbacks) {
  return {
    enable() { return this; },
    disable() { return this; },
  };
}

export function executionAsyncId() { return 0; }
export function triggerAsyncId() { return 0; }
export function executionAsyncResource() { return {}; }

export default {
  AsyncLocalStorage,
  AsyncResource,
  createHook,
  executionAsyncId,
  triggerAsyncId,
  executionAsyncResource,
};
