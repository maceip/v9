// Auto-generated ESM wrapper for node:dgram
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('dgram');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('dgram');
  _defaultExport = mod;
  Socket = mod.Socket;
  createSocket = mod.createSocket;
}
export let Socket;
export let createSocket;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('dgram', _syncNodeApiModuleBindings);
