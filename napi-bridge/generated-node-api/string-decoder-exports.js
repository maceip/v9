// Auto-generated ESM wrapper for node:string_decoder
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('string_decoder');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('string_decoder');
  _defaultExport = mod;
  StringDecoder = mod.StringDecoder;
}
export let StringDecoder;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('string_decoder', _syncNodeApiModuleBindings);
