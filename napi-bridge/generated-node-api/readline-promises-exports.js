// Auto-generated ESM wrapper for node:readline/promises
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('readline/promises');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('readline/promises');
  _defaultExport = mod;
  Interface = mod.Interface;
  Readline = mod.Readline;
  createInterface = mod.createInterface;
}
export let Interface;
export let Readline;
export let createInterface;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('readline/promises', _syncNodeApiModuleBindings);
