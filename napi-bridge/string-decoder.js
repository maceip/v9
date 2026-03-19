/**
 * string_decoder — Node.js-compatible string_decoder for browser/Wasm.
 *
 * Handles incremental UTF-8 decoding across chunk boundaries.
 * The npm 'string_decoder' package is 90M+ downloads/wk but depends on
 * 'safe-buffer'. This minimal implementation covers the same API surface.
 */

export class StringDecoder {
  constructor(encoding) {
    this.encoding = (encoding || 'utf8').toLowerCase().replace('-', '');
    this._buffer = null;
    this._decoder = new TextDecoder(this._normalizeEncoding(this.encoding), { fatal: false });
  }

  _normalizeEncoding(enc) {
    switch (enc) {
      case 'utf8': return 'utf-8';
      case 'ucs2': case 'utf16le': return 'utf-16le';
      case 'ascii': case 'latin1': case 'binary': return 'utf-8'; // handled manually
      case 'base64': return 'utf-8'; // handled manually
      case 'hex': return 'utf-8'; // handled manually
      default: return 'utf-8';
    }
  }

  write(buf) {
    if (!buf || buf.length === 0) return '';

    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);

    // For simple encodings, handle manually
    if (this.encoding === 'ascii') {
      let str = '';
      for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i] & 0x7f);
      return str;
    }
    if (this.encoding === 'latin1' || this.encoding === 'binary') {
      let str = '';
      for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
      return str;
    }
    if (this.encoding === 'hex') {
      let str = '';
      for (let i = 0; i < bytes.length; i++) str += bytes[i].toString(16).padStart(2, '0');
      return str;
    }
    if (this.encoding === 'base64') {
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }

    // For UTF-8: handle incomplete multi-byte sequences across chunk boundaries
    let input;
    if (this._buffer) {
      input = new Uint8Array(this._buffer.length + bytes.length);
      input.set(this._buffer);
      input.set(bytes, this._buffer.length);
      this._buffer = null;
    } else {
      input = bytes;
    }

    // Check if the last bytes form an incomplete UTF-8 sequence
    const incomplete = this._incompleteEnd(input);
    if (incomplete > 0) {
      this._buffer = input.slice(input.length - incomplete);
      input = input.slice(0, input.length - incomplete);
    }

    if (input.length === 0) return '';
    return this._decoder.decode(input, { stream: true });
  }

  end(buf) {
    let result = '';
    if (buf) result = this.write(buf);
    if (this._buffer) {
      // Flush remaining bytes (may produce replacement characters for invalid sequences)
      result += this._decoder.decode(this._buffer);
      this._buffer = null;
    }
    return result;
  }

  // Detect incomplete UTF-8 sequence at end of buffer
  _incompleteEnd(buf) {
    if (this.encoding !== 'utf8') return 0;
    const len = buf.length;
    if (len === 0) return 0;

    // Check last 1-3 bytes for incomplete sequence start
    for (let i = Math.min(3, len - 1); i >= 0; i--) {
      const b = buf[len - 1 - i];
      if (i === 0 && (b & 0x80) === 0) return 0; // ASCII, complete
      if ((b & 0xE0) === 0xC0) return (i + 1 < 2) ? i + 1 : 0; // 2-byte
      if ((b & 0xF0) === 0xE0) return (i + 1 < 3) ? i + 1 : 0; // 3-byte
      if ((b & 0xF8) === 0xF0) return (i + 1 < 4) ? i + 1 : 0; // 4-byte
      if ((b & 0xC0) !== 0x80) return 0; // Not continuation, not start
    }
    return 0;
  }
}

export default { StringDecoder };
