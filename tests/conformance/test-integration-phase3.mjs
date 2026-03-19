import { createHarness } from './_harness.mjs';
import { loadFsModule, loadStreamsModule, loadBufferModule } from './_targets.mjs';

const { test, testAsync, assert, assertEq, finish } =
  createHarness('Conformance: Phase 3 Integration');

const { fs } = await loadFsModule();
const { Readable, Writable, Transform } = await loadStreamsModule();
const { Buffer } = await loadBufferModule();

// End-to-end: create file → read → stream through Transform → write result → verify

await testAsync('file → stream → transform → file roundtrip', async () => {
  // Write source file
  fs.writeFileSync('/tmp/integ_src.txt', 'hello world from integration test');

  // Read it
  const content = fs.readFileSync('/tmp/integ_src.txt', 'utf8');
  assertEq(content, 'hello world from integration test');

  // Stream through an uppercase Transform
  const input = new Readable({
    read() {
      this.push(content);
      this.push(null);
    },
  });

  const upper = new Transform({
    transform(chunk, _enc, cb) {
      cb(null, String(chunk).toUpperCase());
    },
  });

  const outputChunks = [];
  const output = new Writable({
    write(chunk, _enc, cb) {
      outputChunks.push(String(chunk));
      cb();
    },
  });

  await new Promise((resolve, reject) => {
    output.on('finish', resolve);
    output.on('error', reject);
    input.pipe(upper).pipe(output);
  });

  const result = outputChunks.join('');
  assertEq(result, 'HELLO WORLD FROM INTEGRATION TEST');

  // Write result to a new file
  fs.writeFileSync('/tmp/integ_dst.txt', result);
  assertEq(fs.readFileSync('/tmp/integ_dst.txt', 'utf8'), 'HELLO WORLD FROM INTEGRATION TEST');
});

test('Buffer encoding roundtrip through fs', () => {
  const original = 'binary data: \x00\x01\x02\xff';
  const buf = Buffer.from(original, 'latin1');
  fs.writeFileSync('/tmp/integ_bin.dat', buf);
  const read = fs.readFileSync('/tmp/integ_bin.dat');
  assert(read instanceof Uint8Array, 'should return buffer');
  assertEq(read.length, buf.length);
  for (let i = 0; i < buf.length; i++) {
    assertEq(read[i], buf[i]);
  }
});

test('fs.existsSync + stat + readdir work together', () => {
  fs.mkdirSync('/tmp/integ_dir', { recursive: true });
  fs.writeFileSync('/tmp/integ_dir/one.txt', '1');
  fs.writeFileSync('/tmp/integ_dir/two.txt', '2');

  assert(fs.existsSync('/tmp/integ_dir'), 'dir should exist');
  assert(fs.statSync('/tmp/integ_dir').isDirectory(), 'should be directory');

  const names = fs.readdirSync('/tmp/integ_dir').sort();
  assertEq(names.length, 2);
  assertEq(names[0], 'one.txt');
  assertEq(names[1], 'two.txt');

  // Cleanup
  fs.unlinkSync('/tmp/integ_dir/one.txt');
  fs.unlinkSync('/tmp/integ_dir/two.txt');
  assertEq(fs.readdirSync('/tmp/integ_dir').length, 0);
});

finish();
