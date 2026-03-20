// Auto-generated ESM wrapper for node:querystring
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('querystring');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('querystring');
  _defaultExport = mod;
  decode = mod.decode;
  encode = mod.encode;
  escape = mod.escape;
  parse = mod.parse;
  stringify = mod.stringify;
  unescape = mod.unescape;
  unescapeBuffer = mod.unescapeBuffer;
}
export let decode;
export let encode;
export let escape;
export let parse;
export let stringify;
export let unescape;
export let unescapeBuffer;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('querystring', _syncNodeApiModuleBindings);
