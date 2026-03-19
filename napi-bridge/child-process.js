/**
 * child_process — Node.js-compatible child_process module for browser/Wasm.
 *
 * Provides spawn, exec, execSync, execFile backed by shell shims + MEMFS.
 * Fork throws (not available in browser).
 */

import { EventEmitter } from './eventemitter.js';
import { Readable, Writable } from './streams.js';
import { executeCommandString } from './shell-parser.js';
import { hasCommand, runCommand } from './shell-commands.js';
import { runGit } from './git-shim.js';

let _pidCounter = 1000;

// ─── ChildProcess ────────────────────────────────────────────────────

class ChildProcess extends EventEmitter {
  constructor() {
    super();
    this.pid = _pidCounter++;
    this.exitCode = null;
    this.signalCode = null;
    this.killed = false;
    this.connected = false;

    this.stdin = new Writable({
      write(chunk, encoding, callback) { callback(); },
    });

    this.stdout = new Readable({
      read() {},
    });

    this.stderr = new Readable({
      read() {},
    });

    this.stdio = [this.stdin, this.stdout, this.stderr];
  }

  kill(signal) {
    if (this.killed) return;
    this.killed = true;
    this.signalCode = signal || 'SIGTERM';
    this.exitCode = null;
    this._emitExit(null, this.signalCode);
  }

  _emitExit(code, signal) {
    this.exitCode = code;
    // Defer to allow listeners to be registered
    Promise.resolve().then(() => {
      // End the streams first
      this.stdout.push(null);
      this.stderr.push(null);
      this.emit('exit', code, signal || null);
      // close fires after exit
      Promise.resolve().then(() => {
        this.emit('close', code, signal || null);
      });
    });
  }

  ref() { return this; }
  unref() { return this; }
}

// ─── spawn ───────────────────────────────────────────────────────────

export function spawn(command, args, options) {
  if (!Array.isArray(args)) { options = args; args = []; }
  options = options || {};

  const child = new ChildProcess();

  // Build full command string
  let fullCmd;
  if (options.shell) {
    fullCmd = command + (args.length ? ' ' + args.join(' ') : '');
  } else {
    fullCmd = command;
  }

  // Execute asynchronously via microtask
  Promise.resolve().then(() => {
    try {
      let result;

      // Check for git commands
      if (command === 'git') {
        result = runGit(args);
      } else if (options.shell || hasCommand(command)) {
        if (options.shell) {
          result = executeCommandString(fullCmd, { cwd: options.cwd });
        } else {
          result = runCommand(command, args, { cwd: options.cwd });
          if (!result) {
            result = executeCommandString(command + ' ' + args.join(' '), { cwd: options.cwd });
          }
        }
      } else {
        // Try executing as a command string
        const cmdStr = args.length > 0 ? command + ' ' + args.join(' ') : command;
        result = executeCommandString(cmdStr, { cwd: options.cwd });
      }

      if (result.stdout) {
        child.stdout.push(result.stdout);
      }
      if (result.stderr) {
        child.stderr.push(result.stderr);
      }
      child._emitExit(result.exitCode, null);
    } catch (err) {
      child.emit('error', err);
      child._emitExit(1, null);
    }
  });

  return child;
}

// ─── exec ────────────────────────────────────────────────────────────

export function exec(command, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  options = options || {};

  const child = new ChildProcess();
  const stdoutChunks = [];
  const stderrChunks = [];

  // Execute asynchronously
  Promise.resolve().then(() => {
    try {
      let result;

      // Check if it's a git command
      const trimmed = command.trim();
      if (trimmed.startsWith('git ')) {
        const parts = trimmed.split(/\s+/);
        result = runGit(parts.slice(1));
      } else {
        result = executeCommandString(command, { cwd: options.cwd });
      }

      if (result.stdout) {
        child.stdout.push(result.stdout);
        stdoutChunks.push(result.stdout);
      }
      if (result.stderr) {
        child.stderr.push(result.stderr);
        stderrChunks.push(result.stderr);
      }

      child._emitExit(result.exitCode, null);

      if (callback) {
        const stdout = stdoutChunks.join('');
        const stderr = stderrChunks.join('');
        if (result.exitCode !== 0) {
          const err = new Error(`Command failed: ${command}`);
          err.code = result.exitCode;
          err.killed = false;
          err.stdout = stdout;
          err.stderr = stderr;
          callback(err, stdout, stderr);
        } else {
          callback(null, stdout, stderr);
        }
      }
    } catch (err) {
      child.emit('error', err);
      child._emitExit(1, null);
      if (callback) callback(err, '', '');
    }
  });

  return child;
}

// ─── execSync ────────────────────────────────────────────────────────

export function execSync(command, options) {
  options = options || {};

  let result;

  // Check if it's a git command
  const trimmed = command.trim();
  if (trimmed.startsWith('git ')) {
    const parts = trimmed.split(/\s+/);
    result = runGit(parts.slice(1));
  } else {
    result = executeCommandString(command, { cwd: options.cwd });
  }

  if (result.exitCode !== 0) {
    const err = new Error(`Command failed: ${command}`);
    err.status = result.exitCode;
    err.code = result.exitCode;
    err.stdout = result.stdout;
    err.stderr = result.stderr;
    err.output = [null, result.stdout, result.stderr];
    throw err;
  }

  if (options.encoding) {
    return result.stdout;
  }

  // Return as Buffer-like Uint8Array
  return new TextEncoder().encode(result.stdout);
}

// ─── execFile ────────────────────────────────────────────────────────

export function execFile(file, args, options, callback) {
  if (typeof args === 'function') { callback = args; args = []; options = {}; }
  if (typeof options === 'function') { callback = options; options = {}; }
  args = args || [];
  options = options || {};

  const cmdStr = file + (args.length ? ' ' + args.join(' ') : '');
  return exec(cmdStr, options, callback);
}

// ─── fork ────────────────────────────────────────────────────────────

export function fork() {
  throw new Error('child_process.fork() is not available in browser');
}

// ─── spawnSync ───────────────────────────────────────────────────────

export function spawnSync(command, args, options) {
  args = args || [];
  options = options || {};

  const cmdStr = command + (args.length ? ' ' + args.join(' ') : '');
  let result;

  const trimmed = cmdStr.trim();
  if (trimmed.startsWith('git ')) {
    const parts = trimmed.split(/\s+/);
    result = runGit(parts.slice(1));
  } else {
    result = executeCommandString(cmdStr, { cwd: options.cwd });
  }

  const stdout = options.encoding ? result.stdout : new TextEncoder().encode(result.stdout);
  const stderr = options.encoding ? result.stderr : new TextEncoder().encode(result.stderr);

  return {
    pid: _pidCounter++,
    output: [null, stdout, stderr],
    stdout,
    stderr,
    status: result.exitCode,
    signal: null,
    error: result.exitCode !== 0 ? new Error(`Command failed: ${cmdStr}`) : undefined,
  };
}

// ─── Exports ─────────────────────────────────────────────────────────

export default {
  spawn,
  exec,
  execSync,
  execFile,
  fork,
  spawnSync,
  ChildProcess,
};
