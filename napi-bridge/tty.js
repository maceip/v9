/**
 * tty — Node.js-compatible tty module for browser/Wasm.
 *
 * Our terminal IS a tty, so isatty returns true for fd 0/1/2.
 * ReadStream/WriteStream extend our Readable/Writable with TTY properties.
 */

import { Readable, Writable } from './streams.js';

function writeAnsi(text, fd) {
  if (typeof globalThis._xtermWrite === 'function') {
    globalThis._xtermWrite(text);
  } else if (fd === 2) {
    console.error(text);
  } else {
    console.log(text);
  }
}

export function isatty(fd) {
  return fd === 0 || fd === 1 || fd === 2;
}

export class ReadStream extends Readable {
  constructor(fd) {
    super({ read() {} });
    this.fd = fd;
    this.isTTY = true;
    this.isRaw = false;
    this.columns = _termCols;
    this.rows = _termRows;
    _readStreams.add(this);
    const stdinRef = this;
    const previousPush = globalThis._stdinPush;
    globalThis._stdinPush = (data) => {
      let normalized = data;
      try {
        normalized = typeof data === 'string' ? data : new TextDecoder().decode(data);
        stdinRef.push(normalized);
      } catch {}
      stdinRef.emit('readable');
      if (typeof previousPush === 'function') {
        previousPush(normalized);
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
const _readStreams = new Set();
const _writeStreams = new Set();

export function _updateTerminalSize(cols, rows) {
  _termCols = cols;
  _termRows = rows;
  for (const rs of _readStreams) {
    rs.columns = cols;
    rs.rows = rows;
  }
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

  clearLine(dir = 0, callback) {
    const code = dir < 0 ? 1 : dir > 0 ? 0 : 2;
    writeAnsi(`\x1b[${code}K`, this.fd);
    if (typeof callback === 'function') callback();
    return true;
  }
  clearScreenDown(callback) {
    writeAnsi('\x1b[0J', this.fd);
    if (typeof callback === 'function') callback();
    return true;
  }
  cursorTo(x, y, callback) {
    if (typeof y === 'function') {
      callback = y;
      y = undefined;
    }
    if (typeof y === 'number') {
      writeAnsi(`\x1b[${y + 1};${x + 1}H`, this.fd);
    } else {
      writeAnsi(`\x1b[${x + 1}G`, this.fd);
    }
    if (typeof callback === 'function') callback();
    return true;
  }
  moveCursor(dx = 0, dy = 0, callback) {
    if (dx < 0) writeAnsi(`\x1b[${Math.abs(dx)}D`, this.fd);
    if (dx > 0) writeAnsi(`\x1b[${dx}C`, this.fd);
    if (dy < 0) writeAnsi(`\x1b[${Math.abs(dy)}A`, this.fd);
    if (dy > 0) writeAnsi(`\x1b[${dy}B`, this.fd);
    if (typeof callback === 'function') callback();
    return true;
  }
  ref() { return this; }
  unref() { return this; }
  destroy(err, callback) {
    _writeStreams.delete(this);
    if (typeof callback === 'function') callback(err);
  }
}

export default { isatty, ReadStream, WriteStream, _updateTerminalSize };
