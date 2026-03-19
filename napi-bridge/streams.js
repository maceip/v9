/**
 * Streams — Node.js-compatible stream module for browser/Wasm.
 *
 * Implements the full stream contract per the conformance catalog (CORE-03).
 * Readable, Writable, Transform, Duplex, pipeline(), finished().
 *
 * CRITICAL: Backpressure MUST work. write() returns false when buffer > highWaterMark.
 * pipe() wires pause/resume/drain automatically.
 */

import { EventEmitter } from './eventemitter.js';

// ─── Readable ───────────────────────────────────────────────────────

export class Readable extends EventEmitter {
  constructor(opts = {}) {
    super();
    this._readableState = {
      highWaterMark: opts.highWaterMark !== undefined ? opts.highWaterMark : 16384,
      buffer: [],
      length: 0,           // total bytes buffered
      flowing: null,        // null = initial, true = flowing, false = paused
      ended: false,         // push(null) received
      endEmitted: false,
      destroyed: false,
      reading: false,       // _read in progress
      pipes: [],
      objectMode: opts.objectMode || false,
      encoding: opts.encoding || null,
    };
    this.readable = true;

    if (typeof opts.read === 'function') {
      this._read = opts.read;
    }
    if (typeof opts.destroy === 'function') {
      this._destroy = opts.destroy;
    }
  }

  _read(size) {
    // Default no-op — subclass or opts.read overrides
  }

  push(chunk) {
    const state = this._readableState;
    if (state.ended) {
      this.emit('error', new Error('stream.push() after EOF'));
      return false;
    }
    if (chunk === null) {
      state.ended = true;
      _maybeEnd(this);
      return false;
    }
    // Strings pass through as-is — do NOT convert to Uint8Array.
    // Only measure byte length for buffer-management purposes.
    const chunkLen = state.objectMode ? 1
      : (typeof chunk === 'string' ? Buffer.byteLength(chunk, state.encoding || 'utf8')
      : chunk.length);
    state.buffer.push(chunk);
    state.length += chunkLen;

    // If flowing, emit data immediately
    if (state.flowing === true) {
      _emitData(this);
    }

    return state.length < state.highWaterMark;
  }

  read(size) {
    const state = this._readableState;
    if (size === 0) return null;

    if (state.buffer.length === 0) {
      if (state.ended) {
        if (!state.endEmitted) {
          state.endEmitted = true;
          this.emit('end');
        }
        return null;
      }
      state.reading = true;
      this._read(state.highWaterMark);
      state.reading = false;
    }

    if (state.buffer.length === 0) return null;

    // Return from buffer
    const chunk = state.buffer.shift();
    const chunkLen = state.objectMode ? 1 : chunk.length;
    state.length -= chunkLen;

    if (state.ended && state.buffer.length === 0 && !state.endEmitted) {
      state.endEmitted = true;
      this.emit('end');
    }

    return chunk;
  }

  pipe(dest, opts) {
    const source = this;
    const state = this._readableState;
    state.pipes.push(dest);

    const ondata = (chunk) => {
      const ret = dest.write(chunk);
      // BACKPRESSURE: if write returns false, pause the source
      if (ret === false) {
        source.pause();
      }
    };

    const ondrain = () => {
      source.resume();
    };

    const onend = () => {
      if (!opts || opts.end !== false) {
        dest.end();
      }
    };

    const onerror = (err) => {
      cleanup();
      if (EventEmitter.listenerCount
        ? EventEmitter.listenerCount(dest, 'error') === 0
        : dest.listenerCount('error') === 0
      ) {
        dest.destroy(err);
      }
    };

    const onclose = () => {
      source.unpipe(dest);
    };

    source.on('data', ondata);
    dest.on('drain', ondrain);
    source.on('end', onend);
    source.on('error', onerror);
    dest.on('close', onclose);

    // Emit 'pipe' on destination
    dest.emit('pipe', source);

    const cleanup = () => {
      source.off('data', ondata);
      dest.off('drain', ondrain);
      source.off('end', onend);
      source.off('error', onerror);
      dest.off('close', onclose);
    };

    // Store cleanup for unpipe
    if (!dest._pipeCleanups) dest._pipeCleanups = new Map();
    dest._pipeCleanups.set(source, cleanup);

    // Start flowing
    if (state.flowing !== false) {
      this.resume();
    }

    return dest;
  }

  unpipe(dest) {
    const state = this._readableState;
    if (!dest) {
      // Unpipe all
      const dests = state.pipes.slice();
      state.pipes.length = 0;
      this.pause();
      for (const d of dests) {
        d.emit('unpipe', this);
        if (d._pipeCleanups && d._pipeCleanups.has(this)) {
          d._pipeCleanups.get(this)();
          d._pipeCleanups.delete(this);
        }
      }
      return this;
    }
    const idx = state.pipes.indexOf(dest);
    if (idx === -1) return this;
    state.pipes.splice(idx, 1);
    dest.emit('unpipe', this);
    if (dest._pipeCleanups && dest._pipeCleanups.has(this)) {
      dest._pipeCleanups.get(this)();
      dest._pipeCleanups.delete(this);
    }
    return this;
  }

  pause() {
    const state = this._readableState;
    if (state.flowing !== false) {
      state.flowing = false;
      this.emit('pause');
    }
    return this;
  }

  resume() {
    const state = this._readableState;
    if (!state.flowing) {
      state.flowing = true;
      this.emit('resume');
      // Defer the initial flow to next microtask so listeners can be registered
      // (Node.js does this too — on('data') then on('end') must both work)
      Promise.resolve().then(() => {
        if (state.flowing) _emitData(this);
      });
    }
    return this;
  }

  destroy(err) {
    const state = this._readableState;
    if (state.destroyed) return this;
    state.destroyed = true;

    const doDestroy = (e) => {
      if (e) this.emit('error', e);
      this.emit('close');
    };

    if (this._destroy) {
      this._destroy(err, doDestroy);
    } else {
      doDestroy(err);
    }
    return this;
  }

  // Switch to flowing on 'data' listener
  on(event, fn) {
    const ret = super.on(event, fn);
    if (event === 'data') {
      const state = this._readableState;
      if (state.flowing === null || state.flowing === false) {
        this.resume();
      }
    } else if (event === 'readable') {
      const state = this._readableState;
      if (state.flowing === null) {
        state.flowing = false;
      }
    }
    return ret;
  }

  setEncoding(enc) {
    this._readableState.encoding = enc;
    return this;
  }

  get readableLength() {
    return this._readableState.length;
  }

  get readableHighWaterMark() {
    return this._readableState.highWaterMark;
  }

  get readableFlowing() {
    return this._readableState.flowing;
  }

  get readableEnded() {
    return this._readableState.ended;
  }

  [Symbol.asyncIterator]() {
    const stream = this;
    return {
      next() {
        return new Promise((resolve, reject) => {
          const onData = (chunk) => {
            cleanup();
            resolve({ value: chunk, done: false });
          };
          const onEnd = () => {
            cleanup();
            resolve({ value: undefined, done: true });
          };
          const onError = (err) => {
            cleanup();
            reject(err);
          };
          const cleanup = () => {
            stream.off('data', onData);
            stream.off('end', onEnd);
            stream.off('error', onError);
          };
          stream.once('data', onData);
          stream.once('end', onEnd);
          stream.once('error', onError);
        });
      },
      return() {
        stream.destroy();
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}

function _emitData(stream) {
  const state = stream._readableState;

  // If flowing and buffer empty, call _read to fill it
  if (state.flowing && state.buffer.length === 0 && !state.ended && !state.reading) {
    state.reading = true;
    stream._read(state.highWaterMark);
    state.reading = false;
  }

  while (state.flowing && state.buffer.length > 0) {
    const chunk = state.buffer.shift();
    const chunkLen = state.objectMode ? 1 : chunk.length;
    state.length -= chunkLen;
    stream.emit('data', chunk);
    // flowing may have been set to false by a listener (e.g., pause())
    if (!state.flowing) break;
  }

  // After draining buffer, check if we need more data or if we're done
  if (state.flowing && state.buffer.length === 0 && !state.ended && !state.reading) {
    // Request more data
    state.reading = true;
    stream._read(state.highWaterMark);
    state.reading = false;
    // If _read pushed data synchronously, keep draining
    if (state.buffer.length > 0) {
      _emitData(stream);
      return;
    }
  }

  _maybeEnd(stream);
}

function _maybeEnd(stream) {
  const state = stream._readableState;
  if (state.ended && state.buffer.length === 0 && !state.endEmitted) {
    state.endEmitted = true;
    stream.emit('end');
  }
}


// ─── Writable ───────────────────────────────────────────────────────

export class Writable extends EventEmitter {
  constructor(opts = {}) {
    super();
    this._writableState = {
      highWaterMark: opts.highWaterMark !== undefined ? opts.highWaterMark : 16384,
      length: 0,           // bytes buffered
      writing: false,       // currently in _write
      buffer: [],           // queued writes
      ended: false,         // end() called
      finished: false,      // 'finish' emitted
      destroyed: false,
      corked: 0,
      objectMode: opts.objectMode || false,
      finalCalled: false,
      needDrain: false,
      defaultEncoding: opts.defaultEncoding || 'utf8',
    };
    this.writable = true;

    if (typeof opts.write === 'function') {
      this._write = opts.write;
    }
    if (typeof opts.writev === 'function') {
      this._writev = opts.writev;
    }
    if (typeof opts.final === 'function') {
      this._final = opts.final;
    }
    if (typeof opts.destroy === 'function') {
      this._destroy = opts.destroy;
    }
  }

  _write(chunk, encoding, callback) {
    callback();
  }

  write(chunk, encoding, callback) {
    const state = this._writableState;
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = state.defaultEncoding;
    }
    if (!encoding) encoding = state.defaultEncoding;
    if (typeof callback !== 'function') callback = () => {};

    if (state.ended) {
      const err = new Error('write after end');
      this.emit('error', err);
      callback(err);
      return false;
    }

    if (state.destroyed) {
      const err = new Error('Cannot call write after a stream was destroyed');
      callback(err);
      return false;
    }

    // Strings pass through as-is — _write receives them with the encoding arg.
    const chunkLen = state.objectMode ? 1
      : (typeof chunk === 'string' ? Buffer.byteLength(chunk, encoding)
      : (chunk ? chunk.length : 0));

    if (state.corked || state.writing) {
      // Queue the write
      state.buffer.push({ chunk, encoding, callback });
      state.length += chunkLen;
    } else {
      state.writing = true;
      state.length += chunkLen;
      _doWrite(this, chunk, encoding, callback);
    }

    const ret = state.length < state.highWaterMark;
    if (!ret) {
      state.needDrain = true;
    }
    return ret;
  }

  end(chunk, encoding, callback) {
    const state = this._writableState;
    if (typeof chunk === 'function') {
      callback = chunk;
      chunk = null;
      encoding = null;
    } else if (typeof encoding === 'function') {
      callback = encoding;
      encoding = null;
    }

    if (callback) this.once('finish', callback);

    if (chunk !== null && chunk !== undefined) {
      this.write(chunk, encoding);
    }

    state.ended = true;

    // If not currently writing, finish now
    if (!state.writing && state.buffer.length === 0) {
      _finishMaybe(this);
    }

    return this;
  }

  cork() {
    this._writableState.corked++;
  }

  uncork() {
    const state = this._writableState;
    if (state.corked > 0) {
      state.corked--;
      if (!state.writing && !state.corked && state.buffer.length > 0) {
        _clearBuffer(this);
      }
    }
  }

  destroy(err) {
    const state = this._writableState;
    if (state.destroyed) return this;
    state.destroyed = true;

    const doDestroy = (e) => {
      if (e) this.emit('error', e);
      this.emit('close');
    };

    if (this._destroy && this._destroy !== Writable.prototype._destroy) {
      this._destroy(err, doDestroy);
    } else {
      doDestroy(err);
    }
    return this;
  }

  setDefaultEncoding(enc) {
    this._writableState.defaultEncoding = enc;
    return this;
  }

  get writableLength() {
    return this._writableState.length;
  }

  get writableHighWaterMark() {
    return this._writableState.highWaterMark;
  }

  get writableFinished() {
    return this._writableState.finished;
  }

  get writableEnded() {
    return this._writableState.ended;
  }
}

function _doWrite(stream, chunk, encoding, callback) {
  const state = stream._writableState;

  stream._write(chunk, encoding, (err) => {
    const chunkLen = state.objectMode ? 1 : (chunk ? chunk.length : 0);
    state.length -= chunkLen;
    state.writing = false;

    if (err) {
      stream.emit('error', err);
      callback(err);
      return;
    }

    callback();

    // Process buffer
    if (state.buffer.length > 0 && !state.corked) {
      _clearBuffer(stream);
    } else if (state.ended && state.buffer.length === 0) {
      _finishMaybe(stream);
    }

    // Drain event: emitted when length drops below highWaterMark
    if (state.needDrain && state.length < state.highWaterMark) {
      state.needDrain = false;
      stream.emit('drain');
    }
  });
}

function _clearBuffer(stream) {
  const state = stream._writableState;
  if (state.writing || state.buffer.length === 0) return;

  const entry = state.buffer.shift();
  state.writing = true;
  _doWrite(stream, entry.chunk, entry.encoding, entry.callback);
}

function _finishMaybe(stream) {
  const state = stream._writableState;
  if (state.ended && !state.finished && !state.writing && state.buffer.length === 0) {
    if (stream._final && !state.finalCalled) {
      state.finalCalled = true;
      state.writing = true;
      stream._final((err) => {
        state.writing = false;
        if (err) {
          stream.emit('error', err);
          return;
        }
        _doFinish(stream);
      });
    } else {
      _doFinish(stream);
    }
  }
}

function _doFinish(stream) {
  stream._writableState.finished = true;
  // Duplex: ending the writable side also ends the readable side
  // (unless _final already pushed null, e.g. Transform)
  if (stream._readableState && !stream._readableState.ended) {
    stream.push(null);
  }
  // Defer finish to allow listeners to be registered after end()
  Promise.resolve().then(() => stream.emit('finish'));
}

// ─── Duplex ─────────────────────────────────────────────────────────

export class Duplex extends Readable {
  constructor(opts = {}) {
    super(opts);

    // Mixin Writable state and methods
    this._writableState = {
      highWaterMark: opts.writableHighWaterMark !== undefined
        ? opts.writableHighWaterMark
        : (opts.highWaterMark !== undefined ? opts.highWaterMark : 16384),
      length: 0,
      writing: false,
      buffer: [],
      ended: false,
      finished: false,
      destroyed: false,
      corked: 0,
      objectMode: opts.writableObjectMode || opts.objectMode || false,
      finalCalled: false,
      needDrain: false,
      defaultEncoding: opts.defaultEncoding || 'utf8',
    };
    this.writable = true;

    if (typeof opts.write === 'function') {
      this._write = opts.write;
    }
    if (typeof opts.writev === 'function') {
      this._writev = opts.writev;
    }
    if (typeof opts.final === 'function') {
      this._final = opts.final;
    }
  }

  // Writable methods delegated
  _write(chunk, encoding, callback) { callback(); }
  write(chunk, encoding, callback) { return Writable.prototype.write.call(this, chunk, encoding, callback); }
  end(chunk, encoding, callback) { return Writable.prototype.end.call(this, chunk, encoding, callback); }
  cork() { Writable.prototype.cork.call(this); }
  uncork() { Writable.prototype.uncork.call(this); }
  setDefaultEncoding(enc) { return Writable.prototype.setDefaultEncoding.call(this, enc); }

  get writableLength() { return this._writableState.length; }
  get writableHighWaterMark() { return this._writableState.highWaterMark; }
  get writableFinished() { return this._writableState.finished; }
  get writableEnded() { return this._writableState.ended; }

  destroy(err) {
    const rState = this._readableState;
    const wState = this._writableState;
    if (rState.destroyed) return this;
    rState.destroyed = true;
    wState.destroyed = true;

    const doDestroy = (e) => {
      if (e) this.emit('error', e);
      this.emit('close');
    };

    if (this._destroy && this._destroy !== Duplex.prototype._destroy) {
      this._destroy(err, doDestroy);
    } else {
      doDestroy(err);
    }
    return this;
  }
}

// ─── Transform ──────────────────────────────────────────────────────

export class Transform extends Duplex {
  constructor(opts = {}) {
    super(opts);
    this._transformState = {
      afterTransform: null,
      transforming: false,
      writechunk: null,
      writeencoding: null,
    };

    if (typeof opts.transform === 'function') {
      this._transform = opts.transform;
    }
    if (typeof opts.flush === 'function') {
      this._flush = opts.flush;
    }

    // Override _write to route through _transform
    this._write = (chunk, encoding, callback) => {
      this._transformState.afterTransform = callback;
      this._transform(chunk, encoding, (err, data) => {
        if (err) {
          callback(err);
          return;
        }
        if (data !== null && data !== undefined) {
          this.push(data);
        }
        callback();
      });
    };

    // Override _final to call _flush, then end the readable side
    this._final = (callback) => {
      const endReadable = () => {
        // Signal end of readable side
        this.push(null);
        callback();
      };
      if (this._flush) {
        this._flush((err, data) => {
          if (err) {
            callback(err);
            return;
          }
          if (data !== null && data !== undefined) {
            this.push(data);
          }
          endReadable();
        });
      } else {
        endReadable();
      }
    };
  }

  _transform(chunk, encoding, callback) {
    callback(null, chunk);
  }
}

// ─── PassThrough ────────────────────────────────────────────────────

export class PassThrough extends Transform {
  constructor(opts) {
    super({ ...opts, transform(chunk, encoding, cb) { cb(null, chunk); } });
  }
}

// ─── pipeline() ─────────────────────────────────────────────────────

export function pipeline(...args) {
  let callback;
  if (typeof args[args.length - 1] === 'function') {
    callback = args.pop();
  }

  const streams = args.flat ? args.flat() : args;

  if (streams.length < 2) {
    throw new Error('pipeline requires at least two streams');
  }

  let error;
  const destroys = [];

  function onError(err) {
    if (!error) {
      error = err;
      // Destroy all streams in the pipeline
      for (const s of streams) {
        if (typeof s.destroy === 'function') {
          s.destroy();
        }
      }
      if (callback) callback(err);
    }
  }

  function onFinish() {
    if (!error && callback) {
      callback();
    }
  }

  // Wire up the pipe chain
  let current = streams[0];
  for (let i = 1; i < streams.length; i++) {
    const next = streams[i];
    current.on('error', onError);
    current.pipe(next);
    current = next;
  }

  // Last stream: listen for finish (writable) or end (readable)
  const last = streams[streams.length - 1];
  last.on('error', onError);
  if (typeof last.on === 'function') {
    if (last._writableState) {
      last.on('finish', onFinish);
    } else {
      last.on('end', onFinish);
    }
  }

  return last;
}

// ─── finished() ─────────────────────────────────────────────────────

export function finished(stream, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  opts = opts || {};

  let called = false;
  function done(err) {
    if (called) return;
    called = true;
    callback(err);
  }

  const readable = stream._readableState;
  const writable = stream._writableState;

  const onFinish = () => done();
  const onEnd = () => done();
  const onError = (err) => done(err);
  const onClose = () => {
    // Check if stream ended properly
    if (readable && !readable.endEmitted) {
      done(new Error('premature close'));
    } else if (writable && !writable.finished) {
      done(new Error('premature close'));
    } else {
      done();
    }
  };

  if (writable && !writable.finished) {
    stream.on('finish', onFinish);
  }
  if (readable && !readable.endEmitted) {
    stream.on('end', onEnd);
  }
  stream.on('error', onError);
  stream.on('close', onClose);

  // Return a cleanup function
  return () => {
    stream.off('finish', onFinish);
    stream.off('end', onEnd);
    stream.off('error', onError);
    stream.off('close', onClose);
  };
}

// ─── Exports (match Node.js stream module shape) ────────────────────

const Stream = Readable; // Base class alias
Stream.Readable = Readable;
Stream.Writable = Writable;
Stream.Duplex = Duplex;
Stream.Transform = Transform;
Stream.PassThrough = PassThrough;
Stream.pipeline = pipeline;
Stream.finished = finished;

export default Stream;
