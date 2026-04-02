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
  stream._keypressBuffer = '';
  stream.on('data', (data) => {
    const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
    stream._keypressBuffer += str;
    while (stream._keypressBuffer.length > 0) {
      const parsed = parseKeypress(stream._keypressBuffer);
      if (!parsed) break;
      stream._keypressBuffer = stream._keypressBuffer.slice(parsed.length);
      stream.emit('keypress', parsed.sequence, parsed.key);
    }
  });
}

function parseKeypress(input) {
  if (!input) return null;

  const bracketedPasteStart = '\x1b[200~';
  const bracketedPasteEnd = '\x1b[201~';
  if (input.startsWith(bracketedPasteStart)) {
    const end = input.indexOf(bracketedPasteEnd);
    if (end === -1) return null;
    const pasted = input.slice(bracketedPasteStart.length, end);
    return {
      length: end + bracketedPasteEnd.length,
      sequence: pasted,
      key: { sequence: pasted, name: 'paste', ctrl: false, meta: false, shift: false, pasted: true },
    };
  }

  const csiMap = new Map([
    ['\x1b[A', 'up'], ['\x1b[B', 'down'], ['\x1b[C', 'right'], ['\x1b[D', 'left'],
    ['\x1b[H', 'home'], ['\x1b[F', 'end'], ['\x1b[Z', 'tab'],
    ['\x1b[3~', 'delete'], ['\x1b[2~', 'insert'], ['\x1b[5~', 'pageup'], ['\x1b[6~', 'pagedown'],
    ['\x1bOP', 'f1'], ['\x1bOQ', 'f2'], ['\x1bOR', 'f3'], ['\x1bOS', 'f4'],
  ]);
  for (const [sequence, name] of csiMap) {
    if (input.startsWith(sequence)) {
      return { length: sequence.length, sequence, key: { sequence, name, ctrl: false, meta: false, shift: sequence === '\x1b[Z' } };
    }
  }

  const modifiedCsi = input.match(/^\x1b\[(\d+);(\d+)([A-Za-z~])/);
  if (modifiedCsi) {
    const sequence = modifiedCsi[0];
    const modifier = Number(modifiedCsi[2]);
    const suffix = modifiedCsi[3];
    const nameMap = { A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end', '~': 'delete' };
    return {
      length: sequence.length,
      sequence,
      key: {
        sequence,
        name: nameMap[suffix] || suffix.toLowerCase(),
        ctrl: modifier === 5 || modifier === 6 || modifier === 7 || modifier === 8,
        meta: modifier === 3 || modifier === 4 || modifier === 7 || modifier === 8,
        shift: modifier === 2 || modifier === 4 || modifier === 6 || modifier === 8,
      },
    };
  }

  const ch = input[0];
  const key = {
    sequence: ch,
    name: ch === '\r' || ch === '\n' ? 'return'
      : ch === '\t' ? 'tab'
      : ch === '\x7f' ? 'backspace'
      : ch === '\x1b' ? 'escape'
      : undefined,
    ctrl: false,
    meta: false,
    shift: false,
  };

  if (input.startsWith('\x1b') && input.length >= 2 && !input.startsWith('\x1b[') && !input.startsWith('\x1bO')) {
    const next = input[1];
    return {
      length: 2,
      sequence: input.slice(0, 2),
      key: {
        sequence: input.slice(0, 2),
        name: next.toLowerCase(),
        ctrl: false,
        meta: true,
        shift: next !== next.toLowerCase(),
      },
    };
  }

  if (ch.charCodeAt(0) < 32 && ch !== '\r' && ch !== '\n' && ch !== '\t' && ch !== '\x1b') {
    key.ctrl = true;
    key.name = String.fromCharCode(ch.charCodeAt(0) + 96);
  }

  return { length: 1, sequence: ch, key };
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
