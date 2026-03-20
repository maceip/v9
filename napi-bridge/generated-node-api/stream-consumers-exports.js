// Auto-generated ESM wrapper for node:stream/consumers
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('stream/consumers');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('stream/consumers');
  _defaultExport = mod;
  arrayBuffer = mod.arrayBuffer;
  blob = mod.blob;
  buffer = mod.buffer;
  json = mod.json;
  text = mod.text;
}
export let arrayBuffer;
export let blob;
export let buffer;
export let json;
export let text;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('stream/consumers', _syncNodeApiModuleBindings);
