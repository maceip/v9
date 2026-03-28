// Auto-generated ESM wrapper for node:module
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 19 exports from Node.js module

import * as _mod from './module-shim.js';
const _impl = _mod.default || _mod;

export const createRequire = _mod.createRequire || _impl.createRequire;
export const builtinModules = _mod.builtinModules || _impl.builtinModules;
export const isBuiltin = _mod.isBuiltin || _impl.isBuiltin;
export const Module = _mod.Module || _impl.Module;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const SourceMap = typeof _impl.SourceMap !== 'undefined' ? _impl.SourceMap : _notImplemented('module.SourceMap');
export const constants = typeof _impl.constants !== 'undefined' ? _impl.constants : _notImplemented('module.constants');
export const enableCompileCache = typeof _impl.enableCompileCache !== 'undefined' ? _impl.enableCompileCache : _notImplemented('module.enableCompileCache');
export const findPackageJSON = typeof _impl.findPackageJSON !== 'undefined' ? _impl.findPackageJSON : _notImplemented('module.findPackageJSON');
export const findSourceMap = typeof _impl.findSourceMap !== 'undefined' ? _impl.findSourceMap : _notImplemented('module.findSourceMap');
export const flushCompileCache = typeof _impl.flushCompileCache !== 'undefined' ? _impl.flushCompileCache : _notImplemented('module.flushCompileCache');
export const getCompileCacheDir = typeof _impl.getCompileCacheDir !== 'undefined' ? _impl.getCompileCacheDir : _notImplemented('module.getCompileCacheDir');
export const getSourceMapsSupport = typeof _impl.getSourceMapsSupport !== 'undefined' ? _impl.getSourceMapsSupport : _notImplemented('module.getSourceMapsSupport');
export const globalPaths = typeof _impl.globalPaths !== 'undefined' ? _impl.globalPaths : _notImplemented('module.globalPaths');
export const register = typeof _impl.register !== 'undefined' ? _impl.register : _notImplemented('module.register');
export const registerHooks = typeof _impl.registerHooks !== 'undefined' ? _impl.registerHooks : _notImplemented('module.registerHooks');
export const runMain = typeof _impl.runMain !== 'undefined' ? _impl.runMain : _notImplemented('module.runMain');
export const setSourceMapsSupport = typeof _impl.setSourceMapsSupport !== 'undefined' ? _impl.setSourceMapsSupport : _notImplemented('module.setSourceMapsSupport');
export const stripTypeScriptTypes = typeof _impl.stripTypeScriptTypes !== 'undefined' ? _impl.stripTypeScriptTypes : _notImplemented('module.stripTypeScriptTypes');
export const syncBuiltinESMExports = typeof _impl.syncBuiltinESMExports !== 'undefined' ? _impl.syncBuiltinESMExports : _notImplemented('module.syncBuiltinESMExports');

const _module = { Module, SourceMap, builtinModules, constants, createRequire, enableCompileCache, findPackageJSON, findSourceMap, flushCompileCache, getCompileCacheDir, getSourceMapsSupport, globalPaths, isBuiltin, register, registerHooks, runMain, setSourceMapsSupport, stripTypeScriptTypes, syncBuiltinESMExports };
export default _module;
