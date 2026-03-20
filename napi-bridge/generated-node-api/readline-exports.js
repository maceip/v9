// Auto-generated ESM wrapper for node:readline
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('readline');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('readline');
  _defaultExport = mod;
  Interface = mod.Interface;
  clearLine = mod.clearLine;
  clearScreenDown = mod.clearScreenDown;
  createInterface = mod.createInterface;
  cursorTo = mod.cursorTo;
  emitKeypressEvents = mod.emitKeypressEvents;
  moveCursor = mod.moveCursor;
  promises = mod.promises;
}
export let Interface;
export let clearLine;
export let clearScreenDown;
export let createInterface;
export let cursorTo;
export let emitKeypressEvents;
export let moveCursor;
export let promises;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('readline', _syncNodeApiModuleBindings);
