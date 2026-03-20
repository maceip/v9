// Auto-generated ESM wrapper for node:async_hooks
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('async_hooks');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('async_hooks');
  _defaultExport = mod;
  AsyncLocalStorage = mod.AsyncLocalStorage;
  AsyncResource = mod.AsyncResource;
  asyncWrapProviders = mod.asyncWrapProviders;
  createHook = mod.createHook;
  executionAsyncId = mod.executionAsyncId;
  executionAsyncResource = mod.executionAsyncResource;
  triggerAsyncId = mod.triggerAsyncId;
}
export let AsyncLocalStorage;
export let AsyncResource;
export let asyncWrapProviders;
export let createHook;
export let executionAsyncId;
export let executionAsyncResource;
export let triggerAsyncId;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('async_hooks', _syncNodeApiModuleBindings);
