// Auto-generated ESM wrapper for node:inspector/promises
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('inspector/promises');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('inspector/promises');
  _defaultExport = mod;
  Network = mod.Network;
  NetworkResources = mod.NetworkResources;
  Session = mod.Session;
  close = mod.close;
  console = mod.console;
  open = mod.open;
  url = mod.url;
  waitForDebugger = mod.waitForDebugger;
}
export let Network;
export let NetworkResources;
export let Session;
export let close;
export let console;
export let open;
export let url;
export let waitForDebugger;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('inspector/promises', _syncNodeApiModuleBindings);
