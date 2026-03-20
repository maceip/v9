// Auto-generated ESM wrapper for node:module
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('module');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('module');
  _defaultExport = mod;
  Module = mod.Module;
  SourceMap = mod.SourceMap;
  builtinModules = mod.builtinModules;
  constants = mod.constants;
  createRequire = mod.createRequire;
  enableCompileCache = mod.enableCompileCache;
  findPackageJSON = mod.findPackageJSON;
  findSourceMap = mod.findSourceMap;
  flushCompileCache = mod.flushCompileCache;
  getCompileCacheDir = mod.getCompileCacheDir;
  getSourceMapsSupport = mod.getSourceMapsSupport;
  globalPaths = mod.globalPaths;
  isBuiltin = mod.isBuiltin;
  register = mod.register;
  registerHooks = mod.registerHooks;
  runMain = mod.runMain;
  setSourceMapsSupport = mod.setSourceMapsSupport;
  stripTypeScriptTypes = mod.stripTypeScriptTypes;
  syncBuiltinESMExports = mod.syncBuiltinESMExports;
}
export let Module;
export let SourceMap;
export let builtinModules;
export let constants;
export let createRequire;
export let enableCompileCache;
export let findPackageJSON;
export let findSourceMap;
export let flushCompileCache;
export let getCompileCacheDir;
export let getSourceMapsSupport;
export let globalPaths;
export let isBuiltin;
export let register;
export let registerHooks;
export let runMain;
export let setSourceMapsSupport;
export let stripTypeScriptTypes;
export let syncBuiltinESMExports;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('module', _syncNodeApiModuleBindings);
