// Auto-generated ESM wrapper for node:punycode
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('punycode');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('punycode');
  _defaultExport = mod;
  decode = mod.decode;
  encode = mod.encode;
  toASCII = mod.toASCII;
  toUnicode = mod.toUnicode;
  ucs2 = mod.ucs2;
  version = mod.version;
}
export let decode;
export let encode;
export let toASCII;
export let toUnicode;
export let ucs2;
export let version;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('punycode', _syncNodeApiModuleBindings);
