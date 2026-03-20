// Auto-generated ESM wrapper for node:tty
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('tty');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('tty');
  _defaultExport = mod;
  ReadStream = mod.ReadStream;
  WriteStream = mod.WriteStream;
  isatty = mod.isatty;
}
export let ReadStream;
export let WriteStream;
export let isatty;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('tty', _syncNodeApiModuleBindings);
