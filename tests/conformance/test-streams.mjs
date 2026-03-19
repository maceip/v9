import { createHarness } from './_harness.mjs';
import {
  getConformanceTargetMode,
  loadStreamsModule,
  printConformanceTarget,
} from './_targets.mjs';

const mode = getConformanceTargetMode();
const { test, testAsync, assert, assertEq, assertDeepEq, finish } =
  createHarness('Conformance: streams');

printConformanceTarget('stream');
const {
  Readable,
  Writable,
  Transform,
  Duplex,
  PassThrough,
  pipeline,
  finished,
} = await loadStreamsModule();

function waitForEvent(emitter, eventName) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onEvent = (...args) => {
      cleanup();
      resolve(args);
    };
    const cleanup = () => {
      if (eventName !== 'error') {
        emitter.off?.('error', onError);
      }
      emitter.off?.(eventName, onEvent);
    };
    if (eventName !== 'error') {
      emitter.once?.('error', onError);
    }
    emitter.once?.(eventName, onEvent);
  });
}

function pipelineAsync(streams) {
  return new Promise((resolve, reject) => {
    if (typeof pipeline !== 'function') {
      reject(new Error('pipeline() is not available'));
      return;
    }

    let settled = false;
    const done = (error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    try {
      const maybePromise = pipeline(...streams, done);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(() => done(), done);
      }
    } catch (error) {
      done(error);
    }
  });
}

function finishedAsync(stream) {
  return new Promise((resolve, reject) => {
    if (typeof finished !== 'function') {
      stream.once?.('finish', resolve);
      stream.once?.('end', resolve);
      stream.once?.('error', reject);
      return;
    }
    finished(stream, (error) => (error ? reject(error) : resolve()));
  });
}

class ChunkReadable extends Readable {
  constructor(chunks, options = {}) {
    super(options);
    this._chunks = chunks.slice();
  }

  _read() {
    while (this._chunks.length > 0) {
      const next = this._chunks.shift();
      if (!this.push(next)) return;
    }
    this.push(null);
  }
}

await testAsync('Readable emits data in order and end after all data', async () => {
  const source = new ChunkReadable(['a', 'b', 'c']);
  const seen = [];
  source.on('data', (chunk) => seen.push(String(chunk)));
  await waitForEvent(source, 'end');
  assertDeepEq(seen, ['a', 'b', 'c']);
});

await testAsync('Readable pause() and resume() gate flowing data', async () => {
  const source = new ChunkReadable(['a', 'b', 'c', 'd']);
  const seen = [];
  let paused = false;
  source.on('data', (chunk) => {
    seen.push(String(chunk));
    if (!paused) {
      paused = true;
      source.pause();
      setTimeout(() => source.resume(), 15);
    }
  });
  await waitForEvent(source, 'end');
  assertEq(paused, true);
  assertEq(seen.join(''), 'abcd');
});

await testAsync('Writable write()/end() flush data and emit finish', async () => {
  const chunks = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });

  sink.write('hello');
  sink.end('!');
  await waitForEvent(sink, 'finish');
  assertEq(chunks.join(''), 'hello!');
});

await testAsync('pipe() connects Readable to Writable end-to-end', async () => {
  const source = new ChunkReadable(['he', 'll', 'o']);
  const chunks = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });

  source.pipe(sink);
  await waitForEvent(sink, 'finish');
  assertEq(chunks.join(''), 'hello');
});

await testAsync('Writable backpressure: write() can return false and drain fires', async () => {
  let drainObserved = false;
  const sink = new Writable({
    highWaterMark: 16,
    write(_chunk, _encoding, callback) {
      setTimeout(callback, 5);
    },
  });
  sink.once('drain', () => {
    drainObserved = true;
  });

  const accepted = sink.write(Buffer.alloc(128));
  assertEq(accepted, false, 'write() should return false when highWaterMark exceeded');
  await waitForEvent(sink, 'drain');
  sink.end();
  await waitForEvent(sink, 'finish');
  assertEq(drainObserved, true);
});

await testAsync('pipe() uses pause/resume around backpressure', async () => {
  const source = new ChunkReadable(new Array(200).fill(Buffer.alloc(1024)));
  let pauseCount = 0;
  let resumeCount = 0;
  const originalPause = source.pause.bind(source);
  const originalResume = source.resume.bind(source);
  source.pause = (...args) => {
    pauseCount++;
    return originalPause(...args);
  };
  source.resume = (...args) => {
    resumeCount++;
    return originalResume(...args);
  };

  const sink = new Writable({
    highWaterMark: 8 * 1024,
    write(_chunk, _encoding, callback) {
      setTimeout(callback, 1);
    },
  });

  source.pipe(sink);
  await waitForEvent(sink, 'finish');
  assert(pauseCount > 0, 'Readable should pause at least once due to backpressure');
  assert(resumeCount > 0, 'Readable should resume at least once after drain');
});

await testAsync('Transform _transform and _flush process stream data', async () => {
  const transformer = new Transform({
    transform(chunk, _encoding, callback) {
      callback(null, String(chunk).toUpperCase());
    },
    flush(callback) {
      this.push('!');
      callback();
    },
  });

  const source = new ChunkReadable(['ab', 'cd']);
  const output = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      output.push(String(chunk));
      callback();
    },
  });

  source.pipe(transformer).pipe(sink);
  await waitForEvent(sink, 'finish');
  assertEq(output.join(''), 'ABCD!');
});

await testAsync('Duplex supports writable input and readable output', async () => {
  class EchoDuplex extends Duplex {
    _read() {}

    _write(chunk, _encoding, callback) {
      this.push(chunk);
      callback();
    }

    _final(callback) {
      this.push(null);
      callback();
    }
  }

  const duplex = new EchoDuplex();
  const chunks = [];
  duplex.on('data', (chunk) => chunks.push(String(chunk)));
  duplex.write('x');
  duplex.end('y');
  await waitForEvent(duplex, 'end');
  assertEq(chunks.join(''), 'xy');
});

await testAsync('pipeline() utility composes stream chains', async () => {
  const source = new ChunkReadable(['a', 'b', 'c']);
  const upper = new Transform({
    transform(chunk, _encoding, callback) {
      callback(null, String(chunk).toUpperCase());
    },
  });
  const sinkChunks = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      sinkChunks.push(String(chunk));
      callback();
    },
  });

  await pipelineAsync([source, upper, sink]);
  assertEq(sinkChunks.join(''), 'ABC');
});

await testAsync('errors in a pipe chain propagate and reject pipeline()', async () => {
  const source = new ChunkReadable(['a', 'b']);
  const boom = new Transform({
    transform(_chunk, _encoding, callback) {
      callback(new Error('boom'));
    },
  });
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

  let message = '';
  try {
    await pipelineAsync([source, boom, sink]);
  } catch (error) {
    message = error.message;
  }
  assertEq(message, 'boom');
});

await testAsync('destroy() closes a stream in a pipe chain', async () => {
  const source = new ChunkReadable(['a', 'b', 'c']);
  const middle = new PassThrough();
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

  let closed = false;
  middle.once('close', () => {
    closed = true;
  });

  source.pipe(middle).pipe(sink);
  middle.destroy(new Error('manual-stop'));
  try {
    await finishedAsync(middle);
  } catch {
    // Expected: destroy with error should surface as stream error.
  }
  assertEq(closed, true);
});

await testAsync('push(null) marks EOF and push after EOF emits an error', async () => {
  const readable = new Readable({
    read() {},
  });

  readable.push('x');
  readable.push(null);
  const errorPromise = waitForEvent(readable, 'error');
  const result = readable.push('y');
  assertEq(result, false);
  const [error] = await errorPromise;
  assert(String(error.message).includes('after EOF'));
});

await testAsync('backpressure stress: 50MB pipe stays memory-buffer bounded', async () => {
  const totalBytes = 50 * 1024 * 1024;
  const chunkSize = 64 * 1024;
  const highWaterMark = 64 * 1024;
  let emittedBytes = 0;
  let consumedBytes = 0;
  let maxBufferedBytes = 0;

  class StressReadable extends Readable {
    constructor() {
      super({ highWaterMark });
    }

    _read() {
      while (emittedBytes < totalBytes) {
        const remaining = totalBytes - emittedBytes;
        const size = Math.min(chunkSize, remaining);
        emittedBytes += size;
        if (!this.push(Buffer.alloc(size, 0x61))) return;
      }
      this.push(null);
    }
  }

  const slowTransform = new Transform({
    highWaterMark,
    transform(chunk, _encoding, callback) {
      setTimeout(() => callback(null, chunk), 1);
    },
  });

  const sink = new Writable({
    highWaterMark,
    write(chunk, _encoding, callback) {
      consumedBytes += chunk.length;
      setTimeout(callback, 1);
    },
  });

  const source = new StressReadable();
  const monitor = setInterval(() => {
    const buffered = (source.readableLength || 0)
      + (slowTransform.readableLength || 0)
      + (slowTransform.writableLength || 0)
      + (sink.writableLength || 0);
    if (buffered > maxBufferedBytes) {
      maxBufferedBytes = buffered;
    }
  }, 5);

  try {
    await pipelineAsync([source, slowTransform, sink]);
  } finally {
    clearInterval(monitor);
  }

  assertEq(consumedBytes, totalBytes, 'all bytes should flow through pipeline');
  assert(
    maxBufferedBytes < 2 * 1024 * 1024,
    `buffered bytes grew too high (${maxBufferedBytes}); expected bounded backpressure`,
  );

  if (mode === 'node') {
    console.log(`  Stress metrics: consumed=${consumedBytes}, maxBuffered=${maxBufferedBytes}`);
  }
});

finish();
