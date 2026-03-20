// Auto-generated ESM wrapper for node:trace_events
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('trace_events');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('trace_events');
  _defaultExport = mod;
  createTracing = mod.createTracing;
  getEnabledCategories = mod.getEnabledCategories;
}
export let createTracing;
export let getEnabledCategories;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('trace_events', _syncNodeApiModuleBindings);
