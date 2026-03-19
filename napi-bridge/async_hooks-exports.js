// Auto-generated ESM wrapper for node:async_hooks
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 7 exports from Node.js async_hooks

import * as _mod from './async-hooks.js';
const _impl = _mod.default || _mod;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const AsyncLocalStorage = typeof _impl.AsyncLocalStorage !== 'undefined' ? _impl.AsyncLocalStorage : _notImplemented('async_hooks.AsyncLocalStorage');
export const AsyncResource = typeof _impl.AsyncResource !== 'undefined' ? _impl.AsyncResource : _notImplemented('async_hooks.AsyncResource');
export const asyncWrapProviders = typeof _impl.asyncWrapProviders !== 'undefined' ? _impl.asyncWrapProviders : _notImplemented('async_hooks.asyncWrapProviders');
export const createHook = typeof _impl.createHook !== 'undefined' ? _impl.createHook : _notImplemented('async_hooks.createHook');
export const executionAsyncId = typeof _impl.executionAsyncId !== 'undefined' ? _impl.executionAsyncId : _notImplemented('async_hooks.executionAsyncId');
export const executionAsyncResource = typeof _impl.executionAsyncResource !== 'undefined' ? _impl.executionAsyncResource : _notImplemented('async_hooks.executionAsyncResource');
export const triggerAsyncId = typeof _impl.triggerAsyncId !== 'undefined' ? _impl.triggerAsyncId : _notImplemented('async_hooks.triggerAsyncId');

const _module = { AsyncLocalStorage, AsyncResource, asyncWrapProviders, createHook, executionAsyncId, executionAsyncResource, triggerAsyncId };
export default _module;
