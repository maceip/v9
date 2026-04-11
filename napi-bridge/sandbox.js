/**
 * Sandbox — bVisor-compatible API for in-tab command execution.
 *
 * Provides the same public interface as bVisor's Sandbox class:
 *   const sb = new Sandbox();
 *   const output = sb.runCmd("echo 'Hello, world!'");
 *   console.log(await output.stdout());
 *
 * Supports async commands (like npm install) transparently — the Output
 * promises resolve when the async work completes.
 *
 * Differences from bVisor:
 *   - Commands execute against MEMFS shell shims, not real Linux binaries.
 *   - Filesystem is in-memory (MEMFS), not a COW overlay on the host FS.
 *   - Runs in any browser — no Linux/seccomp dependency.
 *
 * See docs/BVISOR_API_EVALUATION.md for full compatibility analysis.
 */

import { executeCommandString } from './shell-parser.js';
import { withCwd } from './shell-commands.js';

const _encoder = new TextEncoder();

export class Sandbox {
  #logLevel;
  #cwd;

  constructor(options = {}) {
    this.#logLevel = 'OFF';
    this.#cwd = options.cwd || '/workspace';
  }

  /**
   * Set log verbosity.
   * @param {"OFF" | "DEBUG"} level
   */
  setLogLevel(level) {
    this.#logLevel = level;
  }

  /**
   * Execute a shell command in the sandbox.
   * @param {string} command — shell command string (passed to /bin/sh -c)
   * @returns {Output}
   */
  runCmd(command) {
    const result = withCwd(this.#cwd, () => {
      return executeCommandString(command, { cwd: this.#cwd });
    });

    if (this.#logLevel === 'DEBUG') {
      console.log(`[sandbox] runCmd: ${command} → exit ${result.exitCode}`);
    }

    // Track cwd changes from cd commands
    if (result.cwd) {
      this.#cwd = result.cwd;
    }

    // If the command returned an _async promise (e.g. npm install),
    // the Output streams resolve when the async work completes.
    if (result._async) {
      return _createAsyncOutput(result._async);
    }

    return _createOutput(result.stdout ?? '', result.stderr ?? '');
  }
}

/**
 * @typedef {Object} Output
 * @property {ReadableStream<Uint8Array>} stdoutStream
 * @property {ReadableStream<Uint8Array>} stderrStream
 * @property {() => Promise<string>} stdout
 * @property {() => Promise<string>} stderr
 */

/**
 * Create Output from buffered strings (sync commands).
 */
function _createOutput(stdoutStr, stderrStr) {
  const stdoutBytes = stdoutStr.length > 0 ? _encoder.encode(stdoutStr) : null;
  const stderrBytes = stderrStr.length > 0 ? _encoder.encode(stderrStr) : null;

  return {
    stdoutStream: new ReadableStream({
      start(controller) {
        if (stdoutBytes) controller.enqueue(stdoutBytes.slice());
        controller.close();
      },
    }),
    stderrStream: new ReadableStream({
      start(controller) {
        if (stderrBytes) controller.enqueue(stderrBytes.slice());
        controller.close();
      },
    }),
    stdout: () => Promise.resolve(stdoutStr),
    stderr: () => Promise.resolve(stderrStr),
  };
}

/**
 * Create Output from an async promise (e.g. npm install).
 * The promise resolves to { stdout, stderr, exitCode }.
 */
function _createAsyncOutput(asyncPromise) {
  const resultPromise = asyncPromise.then(r => r).catch(err => ({
    stdout: '',
    stderr: err.message + '\n',
    exitCode: 1,
  }));

  return {
    stdoutStream: new ReadableStream({
      async start(controller) {
        const r = await resultPromise;
        if (r.stdout) controller.enqueue(_encoder.encode(r.stdout));
        controller.close();
      },
    }),
    stderrStream: new ReadableStream({
      async start(controller) {
        const r = await resultPromise;
        if (r.stderr) controller.enqueue(_encoder.encode(r.stderr));
        controller.close();
      },
    }),
    stdout: () => resultPromise.then(r => r.stdout ?? ''),
    stderr: () => resultPromise.then(r => r.stderr ?? ''),
  };
}

export default Sandbox;
