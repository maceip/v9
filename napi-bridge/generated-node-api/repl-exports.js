// Auto-generated ESM wrapper for node:repl
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('repl');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('repl');
  _defaultExport = mod;
  REPLServer = mod.REPLServer;
  REPL_MODE_SLOPPY = mod.REPL_MODE_SLOPPY;
  REPL_MODE_STRICT = mod.REPL_MODE_STRICT;
  Recoverable = mod.Recoverable;
  isValidSyntax = mod.isValidSyntax;
  start = mod.start;
  writer = mod.writer;
}
export let REPLServer;
export let REPL_MODE_SLOPPY;
export let REPL_MODE_STRICT;
export let Recoverable;
export let isValidSyntax;
export let start;
export let writer;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('repl', _syncNodeApiModuleBindings);
