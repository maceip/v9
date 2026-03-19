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

export class AsyncLocalStorage {
  constructor() {
    this._store = undefined;
    this._enabled = false;
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
    return fn;
  }

  static snapshot() {
    return (fn, ...args) => fn(...args);
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
