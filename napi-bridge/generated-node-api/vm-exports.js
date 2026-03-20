// Auto-generated ESM wrapper for node:vm
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('vm');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('vm');
  _defaultExport = mod;
  Script = mod.Script;
  compileFunction = mod.compileFunction;
  constants = mod.constants;
  createContext = mod.createContext;
  createScript = mod.createScript;
  isContext = mod.isContext;
  measureMemory = mod.measureMemory;
  runInContext = mod.runInContext;
  runInNewContext = mod.runInNewContext;
  runInThisContext = mod.runInThisContext;
}
export let Script;
export let compileFunction;
export let constants;
export let createContext;
export let createScript;
export let isContext;
export let measureMemory;
export let runInContext;
export let runInNewContext;
export let runInThisContext;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('vm', _syncNodeApiModuleBindings);
