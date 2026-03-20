// Auto-generated ESM wrapper for node:process
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 55 exports from Node.js process

import { processBridge } from './browser-builtins.js';
const _impl = processBridge;

// Set globalThis.process so code that accesses process without importing works
if (typeof globalThis.process === 'undefined' || !globalThis.process.cwd) {
  globalThis.process = processBridge;
}

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const abort = typeof _impl.abort !== 'undefined' ? _impl.abort : _notImplemented('process.abort');
export const allowedNodeEnvironmentFlags = typeof _impl.allowedNodeEnvironmentFlags !== 'undefined' ? _impl.allowedNodeEnvironmentFlags : _notImplemented('process.allowedNodeEnvironmentFlags');
export const arch = typeof _impl.arch !== 'undefined' ? _impl.arch : _notImplemented('process.arch');
export const argv = typeof _impl.argv !== 'undefined' ? _impl.argv : _notImplemented('process.argv');
export const argv0 = typeof _impl.argv0 !== 'undefined' ? _impl.argv0 : _notImplemented('process.argv0');
export const availableMemory = typeof _impl.availableMemory !== 'undefined' ? _impl.availableMemory : _notImplemented('process.availableMemory');
export const binding = typeof _impl.binding !== 'undefined' ? _impl.binding : _notImplemented('process.binding');
export const chdir = typeof _impl.chdir !== 'undefined' ? _impl.chdir : _notImplemented('process.chdir');
export const config = typeof _impl.config !== 'undefined' ? _impl.config : _notImplemented('process.config');
export const constrainedMemory = typeof _impl.constrainedMemory !== 'undefined' ? _impl.constrainedMemory : _notImplemented('process.constrainedMemory');
export const cpuUsage = typeof _impl.cpuUsage !== 'undefined' ? _impl.cpuUsage : _notImplemented('process.cpuUsage');
export const cwd = typeof _impl.cwd !== 'undefined' ? _impl.cwd : _notImplemented('process.cwd');
export const debugPort = typeof _impl.debugPort !== 'undefined' ? _impl.debugPort : _notImplemented('process.debugPort');
export const dlopen = typeof _impl.dlopen !== 'undefined' ? _impl.dlopen : _notImplemented('process.dlopen');
export const domain = typeof _impl.domain !== 'undefined' ? _impl.domain : _notImplemented('process.domain');
export const emitWarning = typeof _impl.emitWarning !== 'undefined' ? _impl.emitWarning : _notImplemented('process.emitWarning');
export const env = typeof _impl.env !== 'undefined' ? _impl.env : _notImplemented('process.env');
export const execArgv = typeof _impl.execArgv !== 'undefined' ? _impl.execArgv : _notImplemented('process.execArgv');
export const execPath = typeof _impl.execPath !== 'undefined' ? _impl.execPath : _notImplemented('process.execPath');
export const execve = typeof _impl.execve !== 'undefined' ? _impl.execve : _notImplemented('process.execve');
export const exit = typeof _impl.exit !== 'undefined' ? _impl.exit : _notImplemented('process.exit');
export const exitCode = typeof _impl.exitCode !== 'undefined' ? _impl.exitCode : _notImplemented('process.exitCode');
export const features = typeof _impl.features !== 'undefined' ? _impl.features : _notImplemented('process.features');
export const finalization = typeof _impl.finalization !== 'undefined' ? _impl.finalization : _notImplemented('process.finalization');
export const getActiveResourcesInfo = typeof _impl.getActiveResourcesInfo !== 'undefined' ? _impl.getActiveResourcesInfo : _notImplemented('process.getActiveResourcesInfo');
export const getBuiltinModule = typeof _impl.getBuiltinModule !== 'undefined' ? _impl.getBuiltinModule : _notImplemented('process.getBuiltinModule');
export const hasUncaughtExceptionCaptureCallback = typeof _impl.hasUncaughtExceptionCaptureCallback !== 'undefined' ? _impl.hasUncaughtExceptionCaptureCallback : _notImplemented('process.hasUncaughtExceptionCaptureCallback');
export const hrtime = typeof _impl.hrtime !== 'undefined' ? _impl.hrtime : _notImplemented('process.hrtime');
export const kill = typeof _impl.kill !== 'undefined' ? _impl.kill : _notImplemented('process.kill');
export const loadEnvFile = typeof _impl.loadEnvFile !== 'undefined' ? _impl.loadEnvFile : _notImplemented('process.loadEnvFile');
export const memoryUsage = typeof _impl.memoryUsage !== 'undefined' ? _impl.memoryUsage : _notImplemented('process.memoryUsage');
export const moduleLoadList = typeof _impl.moduleLoadList !== 'undefined' ? _impl.moduleLoadList : _notImplemented('process.moduleLoadList');
export const nextTick = typeof _impl.nextTick !== 'undefined' ? _impl.nextTick : _notImplemented('process.nextTick');
export const openStdin = typeof _impl.openStdin !== 'undefined' ? _impl.openStdin : _notImplemented('process.openStdin');
export const pid = typeof _impl.pid !== 'undefined' ? _impl.pid : _notImplemented('process.pid');
export const platform = typeof _impl.platform !== 'undefined' ? _impl.platform : _notImplemented('process.platform');
export const ppid = typeof _impl.ppid !== 'undefined' ? _impl.ppid : _notImplemented('process.ppid');
export const reallyExit = typeof _impl.reallyExit !== 'undefined' ? _impl.reallyExit : _notImplemented('process.reallyExit');
export const ref = typeof _impl.ref !== 'undefined' ? _impl.ref : _notImplemented('process.ref');
export const release = typeof _impl.release !== 'undefined' ? _impl.release : _notImplemented('process.release');
export const report = typeof _impl.report !== 'undefined' ? _impl.report : _notImplemented('process.report');
export const resourceUsage = typeof _impl.resourceUsage !== 'undefined' ? _impl.resourceUsage : _notImplemented('process.resourceUsage');
export const setSourceMapsEnabled = typeof _impl.setSourceMapsEnabled !== 'undefined' ? _impl.setSourceMapsEnabled : _notImplemented('process.setSourceMapsEnabled');
export const setUncaughtExceptionCaptureCallback = typeof _impl.setUncaughtExceptionCaptureCallback !== 'undefined' ? _impl.setUncaughtExceptionCaptureCallback : _notImplemented('process.setUncaughtExceptionCaptureCallback');
export const sourceMapsEnabled = typeof _impl.sourceMapsEnabled !== 'undefined' ? _impl.sourceMapsEnabled : _notImplemented('process.sourceMapsEnabled');
export const stderr = typeof _impl.stderr !== 'undefined' ? _impl.stderr : _notImplemented('process.stderr');
export const stdin = typeof _impl.stdin !== 'undefined' ? _impl.stdin : _notImplemented('process.stdin');
export const stdout = typeof _impl.stdout !== 'undefined' ? _impl.stdout : _notImplemented('process.stdout');
export const threadCpuUsage = typeof _impl.threadCpuUsage !== 'undefined' ? _impl.threadCpuUsage : _notImplemented('process.threadCpuUsage');
export const title = typeof _impl.title !== 'undefined' ? _impl.title : _notImplemented('process.title');
export const umask = typeof _impl.umask !== 'undefined' ? _impl.umask : _notImplemented('process.umask');
export const unref = typeof _impl.unref !== 'undefined' ? _impl.unref : _notImplemented('process.unref');
export const uptime = typeof _impl.uptime !== 'undefined' ? _impl.uptime : _notImplemented('process.uptime');
export const version = typeof _impl.version !== 'undefined' ? _impl.version : _notImplemented('process.version');
export const versions = typeof _impl.versions !== 'undefined' ? _impl.versions : _notImplemented('process.versions');

const _module = { abort, allowedNodeEnvironmentFlags, arch, argv, argv0, availableMemory, binding, chdir, config, constrainedMemory, cpuUsage, cwd, debugPort, dlopen, domain, emitWarning, env, execArgv, execPath, execve, exit, exitCode, features, finalization, getActiveResourcesInfo, getBuiltinModule, hasUncaughtExceptionCaptureCallback, hrtime, kill, loadEnvFile, memoryUsage, moduleLoadList, nextTick, openStdin, pid, platform, ppid, reallyExit, ref, release, report, resourceUsage, setSourceMapsEnabled, setUncaughtExceptionCaptureCallback, sourceMapsEnabled, stderr, stdin, stdout, threadCpuUsage, title, umask, unref, uptime, version, versions };
export default _module;
