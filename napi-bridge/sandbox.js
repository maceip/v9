/**
 * Sandbox — bVisor-compatible API for in-tab command execution.
 *
 * Provides the same public interface as bVisor's Sandbox class:
 *   const sb = new Sandbox();
 *   const output = sb.runCmd("echo 'Hello, world!'");
 *   console.log(await output.stdout());
 *
 * Differences from bVisor:
 *   - Commands execute against MEMFS shell shims, not real Linux binaries.
 *   - Filesystem is in-memory (MEMFS), not a COW overlay on the host FS.
 *   - Output is buffered (synchronous shell execution), not incrementally streamed.
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
    this.#cwd = options.cwd || '/';
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
 * Create a bVisor-compatible Output object from buffered strings.
 * @param {string} stdoutStr
 * @param {string} stderrStr
 * @returns {Output}
 */
function _createOutput(stdoutStr, stderrStr) {
  // Pre-encode once; each stream reader gets its own copy via slice.
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

export default Sandbox;
