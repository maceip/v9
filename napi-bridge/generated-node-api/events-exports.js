// Auto-generated ESM wrapper for node:events
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('events');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('events');
  _defaultExport = mod;
  EventEmitter = mod.EventEmitter;
  EventEmitterAsyncResource = mod.EventEmitterAsyncResource;
  addAbortListener = mod.addAbortListener;
  captureRejectionSymbol = mod.captureRejectionSymbol;
  captureRejections = mod.captureRejections;
  defaultMaxListeners = mod.defaultMaxListeners;
  errorMonitor = mod.errorMonitor;
  getEventListeners = mod.getEventListeners;
  getMaxListeners = mod.getMaxListeners;
  init = mod.init;
  listenerCount = mod.listenerCount;
  on = mod.on;
  once = mod.once;
  setMaxListeners = mod.setMaxListeners;
  usingDomains = mod.usingDomains;
}
export let EventEmitter;
export let EventEmitterAsyncResource;
export let addAbortListener;
export let captureRejectionSymbol;
export let captureRejections;
export let defaultMaxListeners;
export let errorMonitor;
export let getEventListeners;
export let getMaxListeners;
export let init;
export let listenerCount;
export let on;
export let once;
export let setMaxListeners;
export let usingDomains;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('events', _syncNodeApiModuleBindings);
