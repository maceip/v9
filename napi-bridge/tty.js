/**
 * tty — Node.js-compatible tty module for browser/Wasm.
 *
 * Our terminal IS a tty, so isatty returns true for fd 0/1/2.
 * ReadStream/WriteStream extend our Readable/Writable with TTY properties.
 */

import { Readable, Writable } from './streams.js';

export function isatty(fd) {
  return fd === 0 || fd === 1 || fd === 2;
}

export class ReadStream extends Readable {
  constructor(fd) {
    super({ read() {} });
    this.fd = fd;
    this.isTTY = true;
    this.isRaw = false;
    const stdinRef = this;
    const previousPush = globalThis._stdinPush;
    globalThis._stdinPush = (data) => {
      try {
        stdinRef.push(typeof data === 'string' ? data : new TextDecoder().decode(data));
      } catch {}
      stdinRef.emit('data', data);
      stdinRef.emit('readable');
      if (typeof previousPush === 'function') {
        previousPush(data);
      }
    };
  }

  setRawMode(mode) {
    this.isRaw = !!mode;
    return this;
  }

  ref() { return this; }
  unref() { return this; }
}

// Shared size state — updated by setTerminalSize() in initEdgeJS
let _termCols = 80;
let _termRows = 24;
const _writeStreams = new Set();

export function _updateTerminalSize(cols, rows) {
  _termCols = cols;
  _termRows = rows;
  for (const ws of _writeStreams) {
    ws.columns = cols;
    ws.rows = rows;
    ws.emit('resize');
  }
}

export class WriteStream extends Writable {
  constructor(fd) {
    super({
      write(chunk, encoding, callback) {
        const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        if (typeof globalThis._xtermWrite === 'function') {
          globalThis._xtermWrite(str);
        } else if (fd === 2) {
          console.error(str);
        } else {
          console.log(str);
        }
        callback();
      },
    });
    this.fd = fd;
    this.isTTY = true;
    this.columns = _termCols;
    this.rows = _termRows;
    _writeStreams.add(this);
  }

  getColorDepth() { return 24; }

  hasColors(count) {
    if (count === undefined) return true;
    return count <= (1 << 24);
  }

  getWindowSize() {
    return [this.columns, this.rows];
  }

  clearLine() {}
  clearScreenDown() {}
  cursorTo() {}
  moveCursor() {}
  ref() { return this; }
  unref() { return this; }
}

export default { isatty, ReadStream, WriteStream, _updateTerminalSize };
