// Auto-generated ESM wrapper for node:timers
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('timers');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('timers');
  _defaultExport = mod;
  active = mod.active;
  clearImmediate = mod.clearImmediate;
  clearInterval = mod.clearInterval;
  clearTimeout = mod.clearTimeout;
  enroll = mod.enroll;
  promises = mod.promises;
  setImmediate = mod.setImmediate;
  setInterval = mod.setInterval;
  setTimeout = mod.setTimeout;
  unenroll = mod.unenroll;
}
export let active;
export let clearImmediate;
export let clearInterval;
export let clearTimeout;
export let enroll;
export let promises;
export let setImmediate;
export let setInterval;
export let setTimeout;
export let unenroll;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('timers', _syncNodeApiModuleBindings);
