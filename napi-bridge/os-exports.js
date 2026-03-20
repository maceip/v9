// Auto-generated ESM wrapper for node:os
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 23 exports from Node.js os

import _impl from './os.js';

function _notImplemented(name) {
  return class { constructor(...a) { /* os stub */ } };
}

export const EOL = typeof _impl.EOL !== 'undefined' ? _impl.EOL : _notImplemented('os.EOL');
export const arch = typeof _impl.arch !== 'undefined' ? _impl.arch : _notImplemented('os.arch');
export const availableParallelism = typeof _impl.availableParallelism !== 'undefined' ? _impl.availableParallelism : _notImplemented('os.availableParallelism');
export const constants = typeof _impl.constants !== 'undefined' ? _impl.constants : _notImplemented('os.constants');
export const cpus = typeof _impl.cpus !== 'undefined' ? _impl.cpus : _notImplemented('os.cpus');
export const devNull = typeof _impl.devNull !== 'undefined' ? _impl.devNull : _notImplemented('os.devNull');
export const endianness = typeof _impl.endianness !== 'undefined' ? _impl.endianness : _notImplemented('os.endianness');
export const freemem = typeof _impl.freemem !== 'undefined' ? _impl.freemem : _notImplemented('os.freemem');
export const getPriority = typeof _impl.getPriority !== 'undefined' ? _impl.getPriority : _notImplemented('os.getPriority');
export const homedir = typeof _impl.homedir !== 'undefined' ? _impl.homedir : _notImplemented('os.homedir');
export const hostname = typeof _impl.hostname !== 'undefined' ? _impl.hostname : _notImplemented('os.hostname');
export const loadavg = typeof _impl.loadavg !== 'undefined' ? _impl.loadavg : _notImplemented('os.loadavg');
export const machine = typeof _impl.machine !== 'undefined' ? _impl.machine : _notImplemented('os.machine');
export const networkInterfaces = typeof _impl.networkInterfaces !== 'undefined' ? _impl.networkInterfaces : _notImplemented('os.networkInterfaces');
export const platform = typeof _impl.platform !== 'undefined' ? _impl.platform : _notImplemented('os.platform');
export const release = typeof _impl.release !== 'undefined' ? _impl.release : _notImplemented('os.release');
export const setPriority = typeof _impl.setPriority !== 'undefined' ? _impl.setPriority : _notImplemented('os.setPriority');
export const tmpdir = typeof _impl.tmpdir !== 'undefined' ? _impl.tmpdir : _notImplemented('os.tmpdir');
export const totalmem = typeof _impl.totalmem !== 'undefined' ? _impl.totalmem : _notImplemented('os.totalmem');
export const type = typeof _impl.type !== 'undefined' ? _impl.type : _notImplemented('os.type');
export const uptime = typeof _impl.uptime !== 'undefined' ? _impl.uptime : _notImplemented('os.uptime');
export const userInfo = typeof _impl.userInfo !== 'undefined' ? _impl.userInfo : _notImplemented('os.userInfo');
export const version = typeof _impl.version !== 'undefined' ? _impl.version : _notImplemented('os.version');

const _module = { EOL, arch, availableParallelism, constants, cpus, devNull, endianness, freemem, getPriority, homedir, hostname, loadavg, machine, networkInterfaces, platform, release, setPriority, tmpdir, totalmem, type, uptime, userInfo, version };
export default _module;
