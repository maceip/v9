// Auto-generated ESM wrapper for node:buffer
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('buffer');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('buffer');
  _defaultExport = mod;
  Blob = mod.Blob;
  Buffer = mod.Buffer;
  File = mod.File;
  INSPECT_MAX_BYTES = mod.INSPECT_MAX_BYTES;
  SlowBuffer = mod.SlowBuffer;
  atob = mod.atob;
  btoa = mod.btoa;
  constants = mod.constants;
  isAscii = mod.isAscii;
  isUtf8 = mod.isUtf8;
  kMaxLength = mod.kMaxLength;
  kStringMaxLength = mod.kStringMaxLength;
  resolveObjectURL = mod.resolveObjectURL;
  transcode = mod.transcode;
}
export let Blob;
export let Buffer;
export let File;
export let INSPECT_MAX_BYTES;
export let SlowBuffer;
export let atob;
export let btoa;
export let constants;
export let isAscii;
export let isUtf8;
export let kMaxLength;
export let kStringMaxLength;
export let resolveObjectURL;
export let transcode;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('buffer', _syncNodeApiModuleBindings);
