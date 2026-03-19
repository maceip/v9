// Auto-generated ESM wrapper for node:child_process
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 8 exports from Node.js child_process

import * as _mod from './child-process.js';
const _impl = _mod.default || _mod;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const ChildProcess = typeof _impl.ChildProcess !== 'undefined' ? _impl.ChildProcess : _notImplemented('child_process.ChildProcess');
export const exec = typeof _impl.exec !== 'undefined' ? _impl.exec : _notImplemented('child_process.exec');
export const execFile = typeof _impl.execFile !== 'undefined' ? _impl.execFile : _notImplemented('child_process.execFile');
export const execFileSync = typeof _impl.execFileSync !== 'undefined' ? _impl.execFileSync : _notImplemented('child_process.execFileSync');
export const execSync = typeof _impl.execSync !== 'undefined' ? _impl.execSync : _notImplemented('child_process.execSync');
export const fork = typeof _impl.fork !== 'undefined' ? _impl.fork : _notImplemented('child_process.fork');
export const spawn = typeof _impl.spawn !== 'undefined' ? _impl.spawn : _notImplemented('child_process.spawn');
export const spawnSync = typeof _impl.spawnSync !== 'undefined' ? _impl.spawnSync : _notImplemented('child_process.spawnSync');

const _module = { ChildProcess, exec, execFile, execFileSync, execSync, fork, spawn, spawnSync };
export default _module;
