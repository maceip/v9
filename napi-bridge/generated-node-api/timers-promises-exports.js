// Auto-generated ESM wrapper for node:timers/promises
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('timers/promises');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('timers/promises');
  _defaultExport = mod;
  scheduler = mod.scheduler;
  setImmediate = mod.setImmediate;
  setInterval = mod.setInterval;
  setTimeout = mod.setTimeout;
}
export let scheduler;
export let setImmediate;
export let setInterval;
export let setTimeout;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('timers/promises', _syncNodeApiModuleBindings);
