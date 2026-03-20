// Auto-generated ESM wrapper for node:path
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('path');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('path');
  _defaultExport = mod;
  basename = mod.basename;
  delimiter = mod.delimiter;
  dirname = mod.dirname;
  extname = mod.extname;
  format = mod.format;
  isAbsolute = mod.isAbsolute;
  join = mod.join;
  matchesGlob = mod.matchesGlob;
  normalize = mod.normalize;
  parse = mod.parse;
  posix = mod.posix;
  relative = mod.relative;
  resolve = mod.resolve;
  sep = mod.sep;
  toNamespacedPath = mod.toNamespacedPath;
  win32 = mod.win32;
}
export let basename;
export let delimiter;
export let dirname;
export let extname;
export let format;
export let isAbsolute;
export let join;
export let matchesGlob;
export let normalize;
export let parse;
export let posix;
export let relative;
export let resolve;
export let sep;
export let toNamespacedPath;
export let win32;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('path', _syncNodeApiModuleBindings);
