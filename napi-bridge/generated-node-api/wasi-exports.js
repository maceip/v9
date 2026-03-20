// Auto-generated ESM wrapper for node:wasi
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('wasi');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('wasi');
  _defaultExport = mod;
  WASI = mod.WASI;
}
export let WASI;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('wasi', _syncNodeApiModuleBindings);
