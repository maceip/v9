// Auto-generated ESM wrapper for node:https
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('https');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('https');
  _defaultExport = mod;
  Agent = mod.Agent;
  Server = mod.Server;
  createServer = mod.createServer;
  get = mod.get;
  globalAgent = mod.globalAgent;
  request = mod.request;
}
export let Agent;
export let Server;
export let createServer;
export let get;
export let globalAgent;
export let request;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('https', _syncNodeApiModuleBindings);
