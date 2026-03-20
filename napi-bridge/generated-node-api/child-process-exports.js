// Auto-generated ESM wrapper for node:child_process
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('child_process');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('child_process');
  _defaultExport = mod;
  ChildProcess = mod.ChildProcess;
  exec = mod.exec;
  execFile = mod.execFile;
  execFileSync = mod.execFileSync;
  execSync = mod.execSync;
  fork = mod.fork;
  spawn = mod.spawn;
  spawnSync = mod.spawnSync;
}
export let ChildProcess;
export let exec;
export let execFile;
export let execFileSync;
export let execSync;
export let fork;
export let spawn;
export let spawnSync;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('child_process', _syncNodeApiModuleBindings);
