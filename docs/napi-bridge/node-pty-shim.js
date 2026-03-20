/**
 * node-pty — Pseudo-terminal shim for browser/Wasm.
 *
 * Gemini CLI imports node-pty. We delegate to child_process.spawn()
 * and expose the node-pty API surface.
 */

import { spawn as cpSpawn } from './child-process.js';
import { EventEmitter } from './eventemitter.js';

class PtyProcess extends EventEmitter {
  constructor(child, options) {
    super();
    this.pid = child.pid;
    this.process = options.name || 'pty';
    this._child = child;
    this.handleFlowControl = false;

    child.stdout.on('data', (data) => {
      const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
      this.emit('data', str);
    });

    child.stderr.on('data', (data) => {
      const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
      this.emit('data', str);
    });

    child.on('exit', (code, signal) => {
      this.emit('exit', code, signal ? 1 : 0);
    });

    child.on('error', (err) => {
      this.emit('data', `Error: ${err.message}\r\n`);
      this.emit('exit', 1, 0);
    });
  }

  write(data) {
    if (this._child && this._child.stdin) {
      this._child.stdin.write(data);
    }
  }

  resize(cols, rows) {
    // No-op — MEMFS commands don't care about terminal size
  }

  kill(signal) {
    if (this._child) this._child.kill(signal);
  }

  destroy() {
    this.kill('SIGKILL');
  }

  onData(callback) {
    this.on('data', callback);
    return { dispose: () => this.removeListener('data', callback) };
  }

  onExit(callback) {
    this.on('exit', callback);
    return { dispose: () => this.removeListener('exit', callback) };
  }

  clear() {}
  pause() {}
  resume() {}
}

export function spawn(shell, args, options) {
  const { cols, rows, cwd, env, name } = options || {};
  const child = cpSpawn(shell, args || [], {
    shell: true,
    cwd,
    env,
  });
  return new PtyProcess(child, { name: name || shell, cols, rows });
}

export { PtyProcess as IPty };

export default { spawn };
