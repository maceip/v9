// Auto-generated ESM wrapper for node:assert/strict
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('assert/strict');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('assert/strict');
  _defaultExport = mod;
  AssertionError = mod.AssertionError;
  CallTracker = mod.CallTracker;
  deepStrictEqual = mod.deepStrictEqual;
  ok = mod.ok;
  strict = mod.strict;
  strictEqual = mod.strictEqual;
}
export let AssertionError;
export let CallTracker;
export let deepStrictEqual;
export let ok;
export let strict;
export let strictEqual;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('assert/strict', _syncNodeApiModuleBindings);
