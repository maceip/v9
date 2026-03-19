/**
 * child_process — Node.js-compatible child_process module for browser/Wasm.
 *
 * Provides spawn, exec, execSync, execFile backed by shell shims + MEMFS.
 * Fork throws (not available in browser).
 *
 * SECURITY: All commands execute against MEMFS shims, not real system commands.
 * The `new Function` boundary in _memfsRequire is the trust boundary —
 * child_process shims operate within the same sandbox.
 */

import { EventEmitter } from './eventemitter.js';
import { Readable, Writable } from './streams.js';
import { executeCommandString } from './shell-parser.js';
import { hasCommand, runCommand } from './shell-commands.js';
import { runGit } from './git-shim.js';

let _pidCounter = 1000;

// ─── Shell escaping ──────────────────────────────────────────────────
// C1: Properly quote arguments for shell execution to prevent injection.

function _shellEscape(arg) {
  // If the arg contains no special chars, return as-is
  if (/^[a-zA-Z0-9_./:=@%^,+-]+$/.test(arg)) return arg;
  // Wrap in single quotes; escape existing single quotes
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

function _buildShellCommand(command, args) {
  if (args.length === 0) return command;
  return command + ' ' + args.map(_shellEscape).join(' ');
}

// ─── Git command parsing ─────────────────────────────────────────────
// M1: Parse git commands respecting quotes, not just split on whitespace.

function _parseGitArgs(commandStr) {
  const trimmed = commandStr.trim();
  if (!trimmed.startsWith('git ') && trimmed !== 'git') return null;
  // Reuse shell tokenizer logic: split respecting quotes
  const args = [];
  let i = 4; // skip 'git '
  const len = trimmed.length;
  while (i < len) {
    if (trimmed[i] === ' ' || trimmed[i] === '\t') { i++; continue; }
    let word = '';
    while (i < len && trimmed[i] !== ' ' && trimmed[i] !== '\t') {
      if (trimmed[i] === "'") {
        i++;
        while (i < len && trimmed[i] !== "'") { word += trimmed[i]; i++; }
        if (i < len) i++; // skip closing quote
      } else if (trimmed[i] === '"') {
        i++;
        while (i < len && trimmed[i] !== '"') {
          if (trimmed[i] === '\\' && i + 1 < len) { word += trimmed[i + 1]; i += 2; }
          else { word += trimmed[i]; i++; }
        }
        if (i < len) i++; // skip closing quote
      } else {
        word += trimmed[i]; i++;
      }
    }
    if (word) args.push(word);
  }
  return args;
}

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
    // Node.js: exitCode is null when killed by signal
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

// ─── Internal dispatcher ─────────────────────────────────────────────
// Single dispatch point for running a command with args (no shell).

function _dispatchDirect(command, args, options) {
  if (command === 'git') {
    return runGit(args);
  }
  if (hasCommand(command)) {
    return runCommand(command, args, { cwd: options.cwd });
  }
  // C2: When shell:false, unknown commands emit error — do NOT fall through
  // to executeCommandString which would interpret shell metacharacters.
  return { stdout: '', stderr: `spawn ${command}: ENOENT\n`, exitCode: 127 };
}

// Dispatch through the shell parser (for exec/execSync/shell:true).
function _dispatchShell(commandStr, options) {
  const gitArgs = _parseGitArgs(commandStr);
  if (gitArgs) return runGit(gitArgs);
  return executeCommandString(commandStr, { cwd: options.cwd });
}

// ─── spawn ───────────────────────────────────────────────────────────

export function spawn(command, args, options) {
  if (!Array.isArray(args)) { options = args; args = []; }
  options = options || {};

  const child = new ChildProcess();

  // Execute asynchronously via microtask
  Promise.resolve().then(() => {
    try {
      let result;

      if (options.shell) {
        // C1: Shell-escape args before joining
        const fullCmd = _buildShellCommand(command, args);
        result = _dispatchShell(fullCmd, options);
      } else {
        result = _dispatchDirect(command, args, options);
      }

      // H2: Check for null/undefined, not truthiness (empty string is valid output)
      if (result.stdout != null && result.stdout !== '') {
        child.stdout.push(result.stdout);
      }
      if (result.stderr != null && result.stderr !== '') {
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
      const result = _dispatchShell(command, options);

      if (result.stdout != null && result.stdout !== '') {
        child.stdout.push(result.stdout);
        stdoutChunks.push(result.stdout);
      }
      if (result.stderr != null && result.stderr !== '') {
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
  const result = _dispatchShell(command, options);

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

  // H8: Return a Buffer-like object that behaves like Node.js Buffer.
  // Uint8Array with a toString() that defaults to utf8.
  const buf = new TextEncoder().encode(result.stdout);
  const bufferLike = new Uint8Array(buf);
  bufferLike.toString = function(encoding) {
    if (!encoding || encoding === 'utf8' || encoding === 'utf-8') {
      return new TextDecoder().decode(this);
    }
    if (encoding === 'hex') {
      let hex = '';
      for (let i = 0; i < this.length; i++) hex += this[i].toString(16).padStart(2, '0');
      return hex;
    }
    if (encoding === 'base64') {
      let binary = '';
      for (let i = 0; i < this.length; i++) binary += String.fromCharCode(this[i]);
      return btoa(binary);
    }
    return new TextDecoder().decode(this);
  };
  return bufferLike;
}

// ─── execFile ────────────────────────────────────────────────────────

export function execFile(file, args, options, callback) {
  if (typeof args === 'function') { callback = args; args = []; options = {}; }
  if (typeof options === 'function') { callback = options; options = {}; }
  args = args || [];
  options = options || {};

  // C1: Shell-escape args for safety
  const cmdStr = _buildShellCommand(file, args);
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

  let result;
  if (command === 'git') {
    result = runGit(args);
  } else if (hasCommand(command)) {
    result = runCommand(command, args, { cwd: options.cwd });
  } else {
    // Shell path for unknown commands
    const cmdStr = _buildShellCommand(command, args);
    result = _dispatchShell(cmdStr, options);
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
    // Node.js spawnSync only sets error for spawn failures, not non-zero exit
    error: result.exitCode === 127 ? new Error(`spawnSync ${command} ENOENT`) : undefined,
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
