/**
 * child_process — Node.js-compatible child_process module for browser/Wasm.
 *
 * Provides spawn, exec, execSync, execFile, fork backed by shell shims + MEMFS.
 *
 * Architecture:
 *   - ExecutionContext: per-child isolation of pid, ppid, cwd, env, cancellation
 *   - Cancellation-safe: kill() prevents all further stdout/stderr/exit emission
 *   - Per-child cwd/env: threaded through shell dispatch, not global mutations
 *   - fork(): in-process isolate with IPC message channels + return contract
 *
 * Execution contract:
 *   child_process is an in-process command shim with per-child isolation of
 *   cwd, env, and lifecycle. Commands run synchronously in the same JS realm
 *   against MEMFS shims. There is no true OS-level process isolation; the
 *   isolation boundary is logical (scoped cwd/env/cancellation).
 *
 *   fork() runs a module via require() in a new ExecutionContext with IPC
 *   message channels. The child gets process.send()/process.on('message')
 *   and the parent gets child.send()/child.on('message'). This provides
 *   real parent-child return semantics without OS-level processes.
 *
 * SECURITY: All commands execute against MEMFS shims, not real system commands.
 * The `new Function` boundary in _memfsRequire is the trust boundary —
 * child_process shims operate within the same sandbox.
 */

import { EventEmitter } from './eventemitter.js';
import { Readable, Writable } from './streams.js';
import { executeCommandString } from './shell-parser.js';
import { hasCommand, runCommand, withCwd } from './shell-commands.js';
import { runGit } from './git-shim.js';

let _pidCounter = 1000;

// Process table for waitpid-like lookups
const _processTable = new Map(); // pid → { ctx, child, exitCode, signal, settled }

// ─── ExecutionContext ──────────────────────────────────────────────────
// Per-child isolation object. Owns identity, environment, working directory,
// cancellation state, and parent/child linkage.

class ExecutionContext {
  constructor(options = {}, parent = null) {
    this.pid = _pidCounter++;
    this.ppid = parent ? parent.pid : (typeof process !== 'undefined' ? process.pid : 0);
    this.cwd = options.cwd || (parent ? parent.cwd :
      (typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : '/'));

    // Per-child env: inherit from parent, override with options.env
    if (options.env) {
      // When env is explicitly provided, use it exclusively (Node.js behavior)
      this.env = { ...options.env };
    } else {
      // Inherit parent env
      this.env = parent ? { ...parent.env } :
        (typeof process !== 'undefined' ? { ...process.env } : {});
    }

    this.cancelled = false;
    this.children = [];

    if (parent) {
      parent.children.push(this);
    }
  }

  cancel() {
    this.cancelled = true;
  }
}

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

function _stripOuterQuotes(value) {
  if (typeof value !== 'string') return value;
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function _tryOpenExternalUrl(command, args = []) {
  const normalized = String(command || '').trim().toLowerCase();
  const directOpeners = new Set(['open', 'xdg-open', 'explorer']);
  const isWindowsUrlOpen = normalized === 'rundll32'
    && String(args[0] || '').toLowerCase() === 'url,openurl';

  if (!directOpeners.has(normalized) && !isWindowsUrlOpen) return null;

  const rawTarget = isWindowsUrlOpen ? args[1] : args[0];
  const target = _stripOuterQuotes(rawTarget);
  if (typeof target !== 'string' || !/^https?:\/\//i.test(target)) {
    return { stdout: '', stderr: `spawn ${command}: ENOENT\n`, exitCode: 127 };
  }

  const opener = globalThis.__browserRuntimeOpenExternalUrl;
  if (typeof opener !== 'function') {
    return { stdout: '', stderr: `spawn ${command}: ENOSYS\n`, exitCode: 127 };
  }

  Promise.resolve().then(() => opener(target)).catch(() => {});
  return { stdout: '', stderr: '', exitCode: 0 };
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
  constructor(ctx) {
    super();
    this._ctx = ctx;
    this.pid = ctx.pid;
    this.exitCode = null;
    this.signalCode = null;
    this.killed = false;
    this.connected = false;
    this._exited = false; // guard against double exit/close emission

    // IPC channel (set up by fork())
    this._ipcChannel = null;

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

    // Register in process table
    _processTable.set(ctx.pid, {
      ctx, child: this, exitCode: null, signal: null, settled: false,
    });
  }

  kill(signal) {
    if (this.killed) return;
    this.killed = true;
    this._ctx.cancel();
    this.signalCode = signal || 'SIGTERM';
    // Node.js: exitCode is null when killed by signal
    this.exitCode = null;
    this._emitExit(null, this.signalCode);
  }

  /**
   * Send a message to the child process via IPC channel.
   * Only available on forked children.
   */
  send(message, sendHandle, options, callback) {
    if (typeof sendHandle === 'function') { callback = sendHandle; sendHandle = undefined; }
    if (typeof options === 'function') { callback = options; options = undefined; }

    if (!this._ipcChannel) {
      const err = new Error('channel closed');
      if (callback) callback(err);
      return false;
    }
    try {
      this._ipcChannel.postToChild(message);
      if (callback) callback(null);
      return true;
    } catch (err) {
      if (callback) callback(err);
      return false;
    }
  }

  /**
   * Close the IPC channel.
   */
  disconnect() {
    if (!this._ipcChannel) return;
    this.connected = false;
    this._ipcChannel = null;
    this.emit('disconnect');
  }

  _emitExit(code, signal) {
    // Guard: only emit exit/close once
    if (this._exited) return;
    this._exited = true;
    this.exitCode = code;

    // Update process table
    const entry = _processTable.get(this.pid);
    if (entry) {
      entry.exitCode = code;
      entry.signal = signal;
      entry.settled = true;
    }

    // Defer to allow listeners to be registered
    Promise.resolve().then(() => {
      // End the streams first
      if (!this.stdout.destroyed) this.stdout.push(null);
      if (!this.stderr.destroyed) this.stderr.push(null);
      this.emit('exit', code, signal || null);
      // close fires after exit
      Promise.resolve().then(() => {
        this.emit('close', code, signal || null);
        // Disconnect IPC if still connected
        if (this.connected) this.disconnect();
      });
    });
  }

  ref() { return this; }
  unref() { return this; }
}

// ─── IPC Channel ─────────────────────────────────────────────────────
// Lightweight in-process message channel for fork() parent-child IPC.

class IPCChannel {
  constructor() {
    this._parentListeners = []; // messages from child → parent
    this._childListeners = [];  // messages from parent → child
    this._closed = false;
  }

  /** Parent sends message to child */
  postToChild(message) {
    if (this._closed) throw new Error('channel closed');
    // Clone to simulate process boundary
    const cloned = JSON.parse(JSON.stringify(message));
    Promise.resolve().then(() => {
      for (const fn of this._childListeners) {
        try { fn(cloned); } catch {}
      }
    });
  }

  /** Child sends message to parent */
  postToParent(message) {
    if (this._closed) throw new Error('channel closed');
    const cloned = JSON.parse(JSON.stringify(message));
    Promise.resolve().then(() => {
      for (const fn of this._parentListeners) {
        try { fn(cloned); } catch {}
      }
    });
  }

  onParentMessage(fn) { this._parentListeners.push(fn); }
  onChildMessage(fn) { this._childListeners.push(fn); }

  close() {
    this._closed = true;
    this._parentListeners = [];
    this._childListeners = [];
  }
}

// ─── Internal dispatcher ─────────────────────────────────────────────
// Single dispatch point for running a command with args (no shell).
// Receives the full execution options including scoped cwd/env.

function _dispatchDirect(command, args, options) {
  return withCwd(options.cwd, () => {
    const externalOpen = _tryOpenExternalUrl(command, args);
    if (externalOpen) return externalOpen;
    if (command === 'git') {
      return runGit(args);
    }
    if (hasCommand(command)) {
      return runCommand(command, args, { cwd: options.cwd, env: options.env });
    }
    // C2: When shell:false, unknown commands emit error — do NOT fall through
    // to executeCommandString which would interpret shell metacharacters.
    return { stdout: '', stderr: `spawn ${command}: ENOENT\n`, exitCode: 127 };
  });
}

// Dispatch through the shell parser (for exec/execSync/shell:true).
// Threads cwd and env from the ExecutionContext into the shell parser.
// withCwd() sets a scoped cwd override so all path resolution within
// shell commands uses the child's cwd without mutating global state.
function _dispatchShell(commandStr, options) {
  return withCwd(options.cwd, () => {
    const openerMatch = String(commandStr || '').trim().match(/^(open|xdg-open|explorer)\s+(.+)$/i);
    if (openerMatch) {
      return _tryOpenExternalUrl(openerMatch[1], [_stripOuterQuotes(openerMatch[2].trim())]);
    }
    const rundllMatch = String(commandStr || '').trim().match(/^rundll32\s+url,OpenURL\s+(.+)$/i);
    if (rundllMatch) {
      return _tryOpenExternalUrl('rundll32', ['url,OpenURL', _stripOuterQuotes(rundllMatch[1].trim())]);
    }
    const gitArgs = _parseGitArgs(commandStr);
    if (gitArgs) return runGit(gitArgs);
    return executeCommandString(commandStr, { cwd: options.cwd, env: options.env });
  });
}

// ─── Build execution options from user options + ExecutionContext ─────

function _buildExecOptions(options, ctx) {
  return {
    ...options,
    cwd: ctx.cwd,
    env: ctx.env,
  };
}

// ─── spawn ───────────────────────────────────────────────────────────

export function spawn(command, args, options) {
  if (!Array.isArray(args)) { options = args; args = []; }
  options = options || {};

  const ctx = new ExecutionContext(options);
  const child = new ChildProcess(ctx);
  const execOpts = _buildExecOptions(options, ctx);

  // Execute asynchronously via microtask
  Promise.resolve().then(() => {
    // Cancellation check: if killed before execution, emit nothing
    if (ctx.cancelled) return;

    try {
      let result;

      if (options.shell) {
        // C1: Shell-escape args before joining
        const fullCmd = _buildShellCommand(command, args);
        result = _dispatchShell(fullCmd, execOpts);
      } else {
        result = _dispatchDirect(command, args, execOpts);
      }

      // Cancellation check: if killed during execution, suppress output
      if (ctx.cancelled) return;

      // H2: Check for null/undefined, not truthiness (empty string is valid output)
      if (result.stdout != null && result.stdout !== '') {
        child.stdout.push(result.stdout);
      }
      if (result.stderr != null && result.stderr !== '') {
        child.stderr.push(result.stderr);
      }
      child._emitExit(result.exitCode, null);
    } catch (err) {
      if (ctx.cancelled) return;
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

  const ctx = new ExecutionContext(options);
  const child = new ChildProcess(ctx);
  const execOpts = _buildExecOptions(options, ctx);
  const stdoutChunks = [];
  const stderrChunks = [];

  // Execute asynchronously
  Promise.resolve().then(() => {
    if (ctx.cancelled) return;

    try {
      const result = _dispatchShell(command, execOpts);

      if (ctx.cancelled) return;

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
      if (ctx.cancelled) return;
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
  const ctx = new ExecutionContext(options);
  const execOpts = _buildExecOptions(options, ctx);
  const result = _dispatchShell(command, execOpts);

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

// ─── execFileSync ────────────────────────────────────────────────────

export function execFileSync(file, args, options) {
  args = args || [];
  options = options || {};
  const cmdStr = _buildShellCommand(file, args);
  return execSync(cmdStr, options);
}

// ─── fork ────────────────────────────────────────────────────────────
// In-process fork: runs a module in a new ExecutionContext with IPC.
// The child gets process.send()/process.on('message') via a patched
// process object. The parent gets child.send()/child.on('message').
//
// Return contract: the child's exit code and IPC messages are available
// via the standard ChildProcess events (exit, close, message, disconnect).

// _forkRequire is set by the runtime during initialization to provide
// the module require function for forked children.
let _forkRequire = null;

export function setForkRequire(requireFn) {
  _forkRequire = requireFn;
}

export function fork(modulePath, args, options) {
  if (Array.isArray(args)) {
    options = options || {};
  } else if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
    options = args;
    args = [];
  } else {
    args = args || [];
    options = options || {};
  }

  if (!_forkRequire) {
    throw new Error('child_process.fork() requires runtime initialization — call setForkRequire() first');
  }

  const ctx = new ExecutionContext(options);
  const child = new ChildProcess(ctx);

  // Set up IPC channel
  const ipc = new IPCChannel();
  child._ipcChannel = ipc;
  child.connected = true;

  // Parent receives messages from child
  ipc.onParentMessage((msg) => {
    child.emit('message', msg);
  });

  // Execute the module asynchronously
  Promise.resolve().then(() => {
    if (ctx.cancelled) return;

    try {
      // Create a child process object with send/on('message') support
      const childProcess = {
        pid: ctx.pid,
        ppid: ctx.ppid,
        connected: true,
        send(message, sendHandle, options, callback) {
          if (typeof sendHandle === 'function') { callback = sendHandle; }
          if (typeof options === 'function') { callback = options; }
          try {
            ipc.postToParent(message);
            if (callback) callback(null);
            return true;
          } catch (err) {
            if (callback) callback(err);
            return false;
          }
        },
        disconnect() {
          childProcess.connected = false;
        },
        exit(code) {
          child._emitExit(code || 0, null);
        },
        argv: ['/usr/bin/node', modulePath, ...(args || [])],
        env: ctx.env,
        cwd: () => ctx.cwd,
      };

      // Register message listener for parent → child
      ipc.onChildMessage((msg) => {
        if (childProcess._messageHandler) {
          childProcess._messageHandler(msg);
        }
      });

      // Provide on('message', fn) for the child's process object
      childProcess._messageHandler = null;
      childProcess.on = function(event, fn) {
        if (event === 'message') {
          childProcess._messageHandler = fn;
        }
      };

      // Run the module with the child's process context injected
      // The module gets access to process.send via the MEMFS require system
      const savedProcess = globalThis.process;
      const patchedProcess = Object.create(savedProcess || {});
      patchedProcess.send = childProcess.send.bind(childProcess);
      patchedProcess.connected = true;
      patchedProcess.pid = ctx.pid;
      patchedProcess.ppid = ctx.ppid;
      patchedProcess.argv = childProcess.argv;
      patchedProcess.env = ctx.env;
      patchedProcess.on = function(event, fn) {
        if (event === 'message') {
          childProcess._messageHandler = fn;
          return patchedProcess;
        }
        return savedProcess?.on?.(event, fn) || patchedProcess;
      };

      globalThis.process = patchedProcess;
      try {
        _forkRequire(modulePath, ctx.cwd);
        if (!child._exited) {
          child._emitExit(0, null);
        }
      } catch (err) {
        if (ctx.cancelled) return;
        child.emit('error', err);
        if (!child._exited) {
          child._emitExit(1, null);
        }
      } finally {
        globalThis.process = savedProcess;
      }
    } catch (err) {
      if (ctx.cancelled) return;
      child.emit('error', err);
      child._emitExit(1, null);
    }
  });

  return child;
}

// ─── spawnSync ───────────────────────────────────────────────────────

export function spawnSync(command, args, options) {
  args = args || [];
  options = options || {};

  const ctx = new ExecutionContext(options);
  const execOpts = _buildExecOptions(options, ctx);

  let result;
  if (command === 'git') {
    result = runGit(args);
  } else if (hasCommand(command)) {
    result = runCommand(command, args, { cwd: execOpts.cwd, env: execOpts.env });
  } else {
    // Shell path for unknown commands
    const cmdStr = _buildShellCommand(command, args);
    result = _dispatchShell(cmdStr, execOpts);
  }

  const stdout = options.encoding ? result.stdout : new TextEncoder().encode(result.stdout);
  const stderr = options.encoding ? result.stderr : new TextEncoder().encode(result.stderr);

  return {
    pid: ctx.pid,
    output: [null, stdout, stderr],
    stdout,
    stderr,
    status: result.exitCode,
    signal: null,
    // Node.js spawnSync only sets error for spawn failures, not non-zero exit
    error: result.exitCode === 127 ? new Error(`spawnSync ${command} ENOENT`) : undefined,
  };
}

// ─── waitpid-like utility ────────────────────────────────────────────
// Returns a promise that resolves with the canonical return envelope
// when the child process exits.

export function waitForChild(pid) {
  return new Promise((resolve) => {
    const entry = _processTable.get(pid);
    if (!entry) {
      resolve({ exitCode: -1, signal: null, error: 'no such process' });
      return;
    }
    if (entry.settled) {
      resolve({
        exitCode: entry.exitCode,
        signal: entry.signal,
        pid: entry.ctx.pid,
      });
      return;
    }
    entry.child.on('exit', (code, signal) => {
      resolve({
        exitCode: code,
        signal,
        pid: entry.ctx.pid,
      });
    });
  });
}

// ─── Exports ─────────────────────────────────────────────────────────

export { ExecutionContext, ChildProcess, IPCChannel };

export default {
  spawn,
  exec,
  execSync,
  execFile,
  execFileSync,
  fork,
  spawnSync,
  ChildProcess,
  ExecutionContext,
  setForkRequire,
  waitForChild,
};
