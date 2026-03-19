import { createHarness } from './_harness.mjs';
import { loadBufferModule, printConformanceTarget } from './_targets.mjs';

const { test, assert, assertEq, assertDeepEq, finish } = createHarness('Conformance: Buffer');

printConformanceTarget('buffer');
const { Buffer } = await loadBufferModule();

test('Buffer.from(string, encoding) supports utf8/base64/hex/ascii/latin1/binary/base64url', () => {
  assertEq(Buffer.from('héllo', 'utf8').toString('utf8'), 'héllo');
  assertEq(Buffer.from('aGVsbG8=', 'base64').toString('utf8'), 'hello');
  assertEq(Buffer.from('68656c6c6f', 'hex').toString('utf8'), 'hello');
  assertEq(Buffer.from('hello', 'ascii').toString('ascii'), 'hello');
  assertEq(Buffer.from('héllo', 'latin1').toString('latin1'), 'héllo');
  assertEq(Buffer.from('héllo', 'binary').toString('latin1'), 'héllo');
  assertEq(Buffer.from('aGVsbG8', 'base64url').toString('utf8'), 'hello');
});

test('Buffer.from("") returns an empty buffer', () => {
  const buf = Buffer.from('');
  assertEq(buf.length, 0);
});

test('Buffer.from(array) creates bytes and Buffer.from(buffer) creates a copy', () => {
  const fromArray = Buffer.from([1, 2, 3, 255]);
  assertDeepEq(Array.from(fromArray), [1, 2, 3, 255]);

  const source = Buffer.from([9, 8, 7]);
  const copy = Buffer.from(source);
  copy[0] = 1;
  assertEq(source[0], 9, 'Buffer.from(buffer) should create a copy');
});

test('Buffer.from(arrayBuffer, offset, length) shares memory', () => {
  const ab = new ArrayBuffer(8);
  const bytes = new Uint8Array(ab);
  bytes.set([10, 11, 12, 13, 14, 15, 16, 17]);
  const view = Buffer.from(ab, 2, 3);
  view[0] = 99;
  assertEq(bytes[2], 99);
});

test('Buffer.alloc() is zero-filled and Buffer.allocUnsafe() has requested length', () => {
  const zeroed = Buffer.alloc(4);
  assertDeepEq(Array.from(zeroed), [0, 0, 0, 0]);

  const unsafe = Buffer.allocUnsafe(12);
  assertEq(unsafe.length, 12);
});

test('Buffer.concat() combines all buffers in order', () => {
  const combined = Buffer.concat([Buffer.from('he'), Buffer.from('llo')]);
  assertEq(combined.toString('utf8'), 'hello');
});

test('Buffer.isBuffer() identifies buffers', () => {
  assertEq(Buffer.isBuffer(Buffer.from([1])), true);
  assertEq(Buffer.isBuffer(new Uint8Array([1])), false);
  assertEq(Buffer.isBuffer({}), false);
});

test('Buffer.byteLength() handles utf8 multibyte and hex-input semantics', () => {
  assertEq(Buffer.byteLength('é', 'utf8'), 2);
  assertEq(Buffer.byteLength('hello', 'hex'), 2);
  assertEq(Buffer.byteLength('68656c6c6f', 'hex'), 5);
});

test('toString() supports utf8/hex/base64/base64url output formats', () => {
  const buf = Buffer.from('hello', 'utf8');
  assertEq(buf.toString('utf8'), 'hello');
  assertEq(buf.toString('hex'), '68656c6c6f');
  assertEq(buf.toString('base64'), 'aGVsbG8=');
  assertEq(buf.toString('base64url'), 'aGVsbG8');
});

test('slice() and subarray() share memory with parent buffer', () => {
  const parent = Buffer.from([10, 11, 12, 13]);
  const sliced = parent.slice(1, 3);
  sliced[0] = 99;
  assertEq(parent[1], 99);

  const sub = parent.subarray(2, 4);
  sub[0] = 77;
  assertEq(parent[2], 77);
});

test('copy() copies bytes and returns number of bytes copied', () => {
  const src = Buffer.from('hello');
  const target = Buffer.alloc(5);
  const copied = src.copy(target, 0, 1, 4);
  assertEq(copied, 3);
  assertEq(target.toString('utf8', 0, 3), 'ell');
});

test('compare() and equals() provide byte-wise comparisons', () => {
  const a = Buffer.from('abc');
  const b = Buffer.from('abc');
  const c = Buffer.from('abd');
  assertEq(a.compare(b), 0);
  assert(a.compare(c) < 0, 'abc should sort before abd');
  assertEq(a.equals(b), true);
  assertEq(a.equals(c), false);
});

test('indexOf() and includes() find number/string/buffer values', () => {
  const numeric = Buffer.from([0, 1, 2, 3, 4]);
  assertEq(numeric.indexOf(2), 2);

  const text = Buffer.from('hello');
  assertEq(text.indexOf('ll'), 2);
  assertEq(text.indexOf(Buffer.from('lo')), 3);
  assertEq(text.includes('he'), true);
  assertEq(text.includes('zz'), false);
});

test('write() and fill() mutate buffer contents and return bytes written', () => {
  const buf = Buffer.alloc(6);
  const bytesWritten = buf.write('é', 0, 6, 'utf8');
  assertEq(bytesWritten, 2);
  assertEq(buf.toString('hex', 0, 2), 'c3a9');

  buf.fill('A', 2, 6, 'utf8');
  assertEq(buf.toString('utf8', 2, 6), 'AAAA');
});

test('length and index access read/write individual bytes', () => {
  const buf = Buffer.from([1, 2, 3]);
  assertEq(buf.length, 3);
  assertEq(buf[1], 2);
  buf[1] = 255;
  assertEq(buf[1], 255);
});

test('read/write unsigned integer helpers follow big-endian semantics', () => {
  const buf = Buffer.alloc(8);
  buf.writeUInt8(0xab, 0);
  assertEq(buf.readUInt8(0), 0xab);

  buf[1] = 0x12;
  buf[2] = 0x34;
  assertEq(buf.readUInt16BE(1), 0x1234);

  buf[3] = 0x01;
  buf[4] = 0x23;
  buf[5] = 0x45;
  buf[6] = 0x67;
  assertEq(buf.readUInt32BE(3), 0x01234567);
});

test('Buffer instances are also Uint8Array instances', () => {
  assertEq(Buffer.from([1]) instanceof Uint8Array, true);
});

finish();
