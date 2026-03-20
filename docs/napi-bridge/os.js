/**
 * os — Node.js-compatible os module for browser/Wasm.
 *
 * Uses os-browserify for base, extends with methods needed by
 * Claude Code, Codex, and Gemini CLI.
 */

// os-browserify provides: EOL, tmpdir(), endianness(), hostname(), type(),
// release(), platform(), arch(), uptime(), loadavg(), totalmem(), freemem()

let _homedir = '/home/user';
let _tmpdir = '/tmp';

export function configure({ home, tmp } = {}) {
  if (home) _homedir = home;
  if (tmp) _tmpdir = tmp;
}

export const EOL = '\n';
export const devNull = '/dev/null';

export function endianness() { return 'LE'; }

export function hostname() { return 'browser'; }

export function type() { return 'Linux'; }
export function release() { return '6.0.0-edgejs'; }
export function platform() {
  // Match process.platform from browser-builtins for consistency
  if (typeof globalThis.process !== 'undefined' && globalThis.process.platform) {
    return globalThis.process.platform;
  }
  return 'linux';
}
export function arch() {
  return typeof navigator !== 'undefined' && navigator.userAgent?.includes('arm') ? 'arm64' : 'x64';
}

export function homedir() { return _homedir; }
export function tmpdir() { return _tmpdir; }

export function userInfo() {
  return {
    username: 'user',
    homedir: _homedir,
    shell: '/bin/bash',
    uid: 1000,
    gid: 1000,
  };
}

export function cpus() {
  const count = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 1) : 1;
  return Array.from({ length: count }, () => ({
    model: 'browser',
    speed: 2400,
    times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
  }));
}

export function totalmem() {
  if (typeof navigator !== 'undefined' && navigator.deviceMemory) {
    return navigator.deviceMemory * 1024 * 1024 * 1024;
  }
  return 4 * 1024 * 1024 * 1024; // 4GB default
}

export function freemem() {
  return 2 * 1024 * 1024 * 1024; // 2GB default
}

export function uptime() {
  return performance.now() / 1000;
}

export function loadavg() {
  return [0.1, 0.1, 0.1];
}

export function networkInterfaces() {
  return {};
}

export const constants = {
  signals: {
    SIGHUP: 1, SIGINT: 2, SIGQUIT: 3, SIGILL: 4, SIGTRAP: 5,
    SIGABRT: 6, SIGBUS: 7, SIGFPE: 8, SIGKILL: 9, SIGUSR1: 10,
    SIGSEGV: 11, SIGUSR2: 12, SIGPIPE: 13, SIGALRM: 14, SIGTERM: 15,
    SIGCHLD: 17, SIGCONT: 18, SIGSTOP: 19, SIGTSTP: 20, SIGTTIN: 21,
    SIGTTOU: 22, SIGURG: 23, SIGXCPU: 24, SIGXFSZ: 25, SIGVTALRM: 26,
    SIGPROF: 27, SIGWINCH: 28, SIGIO: 29, SIGPWR: 30, SIGSYS: 31,
  },
  errno: {
    EACCES: -13, EADDRINUSE: -98, EADDRNOTAVAIL: -99, EAGAIN: -11,
    EBADF: -9, EBUSY: -16, ECONNREFUSED: -111, ECONNRESET: -104,
    EEXIST: -17, EFAULT: -14, EINTR: -4, EINVAL: -22, EIO: -5,
    EISDIR: -21, EMFILE: -24, ENOENT: -2, ENOMEM: -12, ENOSPC: -28,
    ENOTDIR: -20, ENOTEMPTY: -39, EPERM: -1, EPIPE: -32, ETIMEDOUT: -110,
  },
  priority: {
    PRIORITY_LOW: 19,
    PRIORITY_BELOW_NORMAL: 10,
    PRIORITY_NORMAL: 0,
    PRIORITY_ABOVE_NORMAL: -7,
    PRIORITY_HIGH: -14,
    PRIORITY_HIGHEST: -20,
  },
};

export default {
  EOL, devNull, endianness, hostname, type, release, platform, arch,
  homedir, tmpdir, userInfo, cpus, totalmem, freemem, uptime, loadavg,
  networkInterfaces, constants, configure,
};
