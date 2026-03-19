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
  }

  setRawMode(mode) {
    this.isRaw = !!mode;
    return this;
  }
}

export class WriteStream extends Writable {
  constructor(fd) {
    super({
      write(chunk, encoding, callback) {
        const str = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
        if (fd === 2) console.error(str);
        else console.log(str);
        callback();
      },
    });
    this.fd = fd;
    this.isTTY = true;
    this.columns = 80;
    this.rows = 24;
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
}

export default { isatty, ReadStream, WriteStream };
