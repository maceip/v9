// Auto-generated ESM wrapper for node:domain
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('domain');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('domain');
  _defaultExport = mod;
  Domain = mod.Domain;
  active = mod.active;
  create = mod.create;
  createDomain = mod.createDomain;
}
export let Domain;
export let active;
export let create;
export let createDomain;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('domain', _syncNodeApiModuleBindings);
