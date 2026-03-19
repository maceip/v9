/**
 * process — ESM re-exports for browser import process from "node:process"
 * or import { env, cwd } from "node:process".
 *
 * Thin wrapper around processBridge from browser-builtins.js.
 * Note: processBridge is a class instance, so we re-export bound accessors.
 */
import { processBridge } from './browser-builtins.js';

export const env = processBridge.env;
export const argv = processBridge.argv;
export const pid = processBridge.pid;
export const ppid = processBridge.ppid;
export const platform = processBridge.platform;
export const arch = processBridge.arch;
export const version = processBridge.version;
export const versions = processBridge.versions;
export const title = processBridge.title;
export const stdout = processBridge.stdout;
export const stderr = processBridge.stderr;
export const stdin = processBridge.stdin;
export const exitCode = processBridge.exitCode;
export const cwd = processBridge.cwd.bind(processBridge);
export const chdir = processBridge.chdir.bind(processBridge);
export const exit = processBridge.exit.bind(processBridge);
export const nextTick = processBridge.nextTick.bind(processBridge);
export const hrtime = processBridge.hrtime;
export const umask = processBridge.umask.bind(processBridge);
export const uptime = processBridge.uptime.bind(processBridge);
export const memoryUsage = processBridge.memoryUsage.bind(processBridge);
export const cpuUsage = processBridge.cpuUsage.bind(processBridge);
export const emitWarning = processBridge.emitWarning.bind(processBridge);

export default processBridge;
