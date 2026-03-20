// Auto-generated ESM wrapper for node:stream/promises
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('stream/promises');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('stream/promises');
  _defaultExport = mod;
  finished = mod.finished;
  pipeline = mod.pipeline;
}
export let finished;
export let pipeline;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('stream/promises', _syncNodeApiModuleBindings);
