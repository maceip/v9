/**
 * readline — Node.js-compatible readline module for browser/Wasm.
 *
 * Implements createInterface, Interface (EventEmitter), and promises API.
 * ~80 lines, no external dependencies.
 */

import { EventEmitter } from './eventemitter.js';

export class Interface extends EventEmitter {
  constructor({ input, output, terminal, prompt: promptStr, historySize, completer } = {}) {
    super();
    this.input = input || null;
    this.output = output || null;
    this.terminal = terminal !== undefined ? terminal : true;
    this._prompt = promptStr || '> ';
    this._closed = false;
    this._buffer = '';
    this._history = [];
    this._historySize = historySize || 100;
    this._completer = completer || null;

    if (this.input) {
      this._onData = (data) => {
        if (this._closed) return;
        const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
        this._buffer += str;
        let idx;
        while ((idx = this._buffer.indexOf('\n')) !== -1) {
          const line = this._buffer.slice(0, idx).replace(/\r$/, '');
          this._buffer = this._buffer.slice(idx + 1);
          if (line && this._history[0] !== line) {
            this._history.unshift(line);
            if (this._history.length > this._historySize) this._history.pop();
          }
          this.emit('line', line);
        }
      };
      this.input.on('data', this._onData);

      this._onEnd = () => { if (!this._closed) this.close(); };
      this.input.on('end', this._onEnd);
    }
  }

  question(query, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    if (this.output) this.output.write(query);
    // Wait for next 'line' event
    const handler = (line) => {
      if (callback) callback(line);
    };
    this.once('line', handler);
  }

  prompt(preserveCursor) {
    if (this.output && !this._closed) {
      this.output.write(this._prompt);
    }
  }

  setPrompt(prompt) {
    this._prompt = prompt;
  }

  getPrompt() {
    return this._prompt;
  }

  write(data, key) {
    if (this._closed) return;
    if (data != null) {
      if (this.input && typeof this.input.push === 'function') {
        this.input.push(typeof data === 'string' ? data : data);
      }
    }
  }

  close() {
    if (this._closed) return;
    this._closed = true;
    if (this._buffer) {
      this.emit('line', this._buffer.replace(/\r$/, ''));
      this._buffer = '';
    }
    if (this.input && this._onData) {
      this.input.removeListener('data', this._onData);
      this.input.removeListener('end', this._onEnd);
    }
    this.emit('close');
  }

  pause() {
    if (this.input && typeof this.input.pause === 'function') this.input.pause();
    return this;
  }

  resume() {
    if (this.input && typeof this.input.resume === 'function') this.input.resume();
    return this;
  }

  [Symbol.asyncIterator]() {
    const lines = [];
    let resolve = null;
    let closed = false;

    this.on('line', (line) => {
      if (resolve) { const r = resolve; resolve = null; r({ value: line, done: false }); }
      else lines.push(line);
    });
    this.on('close', () => {
      closed = true;
      if (resolve) { const r = resolve; resolve = null; r({ value: undefined, done: true }); }
    });

    return {
      next() {
        if (lines.length > 0) return Promise.resolve({ value: lines.shift(), done: false });
        if (closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise(r => { resolve = r; });
      },
      return() {
        closed = true;
        return Promise.resolve({ value: undefined, done: true });
      },
      [Symbol.asyncIterator]() { return this; },
    };
  }
}

export function createInterface(options) {
  if (arguments.length > 1) {
    // createInterface(input, output, completer, terminal)
    options = { input: arguments[0], output: arguments[1], completer: arguments[2], terminal: arguments[3] };
  }
  return new Interface(options);
}

export function clearLine(stream, dir, callback) {
  if (callback) callback();
}
export function clearScreenDown(stream, callback) {
  if (callback) callback();
}
export function cursorTo(stream, x, y, callback) {
  if (typeof y === 'function') { callback = y; }
  if (callback) callback();
}
export function moveCursor(stream, dx, dy, callback) {
  if (callback) callback();
}

export function emitKeypressEvents(stream, iface) {
  if (stream._keypressDecoder) return; // already wired
  stream._keypressDecoder = true;
  stream.on('data', (data) => {
    const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
    for (const ch of str) {
      const key = {
        sequence: ch,
        name: ch === '\r' ? 'return' : ch === '\n' ? 'return' : ch === '\t' ? 'tab' : ch === '\x7f' ? 'backspace' : ch === '\x1b' ? 'escape' : undefined,
        ctrl: false,
        meta: false,
        shift: false,
      };
      if (ch.charCodeAt(0) < 32 && ch !== '\r' && ch !== '\n' && ch !== '\t' && ch !== '\x1b') {
        key.ctrl = true;
        key.name = String.fromCharCode(ch.charCodeAt(0) + 96);
      }
      stream.emit('keypress', ch, key);
    }
  });
}

// readline/promises API
export const promises = {
  createInterface(options) {
    const rl = createInterface(options);
    // Wrap question to return a Promise
    const origQuestion = rl.question.bind(rl);
    rl.question = (query, options) => {
      return new Promise((resolve) => {
        origQuestion(query, options, resolve);
      });
    };
    return rl;
  },
};

export default {
  Interface,
  createInterface,
  clearLine,
  clearScreenDown,
  cursorTo,
  moveCursor,
  emitKeypressEvents,
  promises,
};
