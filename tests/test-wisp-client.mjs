#!/usr/bin/env node
/**
 * Unit tests for napi-bridge/wisp-client.js.
 *
 * Tests:
 *   1. Packet encoders produce the exact byte layout from the spec
 *   2. Packet parser round-trips
 *   3. WispStream honors credit-based flow control
 *   4. WispStream propagates remote DATA to .push()
 *   5. WispStream end() sends CLOSE
 *   6. Multi-stream multiplexing via WispConnection (using a mock WebSocket)
 *
 * Run: node tests/test-wisp-client.mjs
 */

import assert from 'node:assert/strict';

// ─── Mock WebSocket ─────────────────────────────────────────────────
// The wisp-client uses the global WebSocket constructor. We install a mock
// before importing it.

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.binaryType = 'arraybuffer';
    this._sentFrames = [];
    this._listeners = { open: [], message: [], error: [], close: [] };
    MockWebSocket._instances.push(this);

    // Simulate async open
    queueMicrotask(() => {
      this.readyState = 1; // OPEN
      this._fire('open', {});
    });
  }
  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }
  removeEventListener(event, fn) {
    const arr = this._listeners[event];
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }
  send(data) {
    // Store as Uint8Array for inspection
    this._sentFrames.push(new Uint8Array(data));
  }
  close() {
    this.readyState = 3;
    this._fire('close', {});
  }

  _fire(event, arg) {
    for (const fn of this._listeners[event] || []) fn(arg);
  }

  /** Inject an inbound binary packet (as if from the server). */
  _inject(bytes) {
    // Wisp client expects ArrayBuffer in message events
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    this._fire('message', { data: ab });
  }

  static reset() {
    MockWebSocket._instances = [];
  }
}
MockWebSocket._instances = [];

globalThis.WebSocket = MockWebSocket;

// Now import the client (it captures globalThis.WebSocket at use time)
const {
  WispConnection,
  WispStream,
  buildConnect,
  buildData,
  buildClose,
  parsePacket,
  PKT_CONNECT,
  PKT_DATA,
  PKT_CONTINUE,
  PKT_CLOSE,
  STREAM_TYPE_TCP,
} = await import('../napi-bridge/wisp-client.js');

// ─── Test runner ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name} — ${err.message}`);
    if (process.env.DEBUG) console.log(err.stack);
    failed++;
  }
}

// Helpers
function u32le(buf, offset) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return dv.getUint32(offset, true);
}
function u16le(buf, offset) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return dv.getUint16(offset, true);
}

// Wait for a microtask turn (for the WispConnection open promise)
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// ─── Tests ──────────────────────────────────────────────────────────

console.log('\n=== Wisp Client Unit Tests ===\n');

// ─── Packet encoders ────────────────────────────────────────────────

await test('buildConnect produces spec-correct bytes', () => {
  const pkt = buildConnect(42, 'example.com', 443);
  assert.equal(pkt[0], PKT_CONNECT, 'type byte');
  assert.equal(u32le(pkt, 1), 42, 'stream id');
  assert.equal(pkt[5], STREAM_TYPE_TCP, 'stream type');
  assert.equal(u16le(pkt, 6), 443, 'port');
  const host = new TextDecoder().decode(pkt.subarray(8));
  assert.equal(host, 'example.com', 'hostname');
});

await test('buildData produces spec-correct bytes', () => {
  const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
  const pkt = buildData(7, payload);
  assert.equal(pkt[0], PKT_DATA);
  assert.equal(u32le(pkt, 1), 7);
  assert.deepEqual(Array.from(pkt.subarray(5)), [0xde, 0xad, 0xbe, 0xef]);
});

await test('buildClose produces spec-correct bytes', () => {
  const pkt = buildClose(9, 0x02);
  assert.equal(pkt[0], PKT_CLOSE);
  assert.equal(u32le(pkt, 1), 9);
  assert.equal(pkt[5], 0x02);
});

// ─── Packet parser ──────────────────────────────────────────────────

await test('parsePacket round-trips CONNECT', () => {
  const pkt = buildConnect(100, 'host.test', 8080);
  const parsed = parsePacket(pkt);
  assert.equal(parsed.type, PKT_CONNECT);
  assert.equal(parsed.streamId, 100);
});

await test('parsePacket round-trips DATA', () => {
  const payload = new Uint8Array([1, 2, 3]);
  const pkt = buildData(5, payload);
  const parsed = parsePacket(pkt);
  assert.equal(parsed.type, PKT_DATA);
  assert.equal(parsed.streamId, 5);
  assert.deepEqual(Array.from(parsed.payload), [1, 2, 3]);
});

await test('parsePacket returns null on too-short input', () => {
  assert.equal(parsePacket(new Uint8Array([1])), null);
  assert.equal(parsePacket(new Uint8Array([])), null);
});

// ─── Connection + stream (mock WebSocket) ──────────────────────────

await test('WispConnection opens and sends CONNECT for a stream', async () => {
  MockWebSocket.reset();
  const conn = new WispConnection('wss://test/wisp/');

  // Start connect, then simulate the initial CONTINUE on stream 0
  const streamPromise = conn.connectTcp('example.com', 443);
  await tick();
  const ws = MockWebSocket._instances[0];
  assert.ok(ws, 'WebSocket was created');

  // Server sends initial buffer advertisement on stream 0
  const initialContinue = new Uint8Array(1 + 4 + 4);
  initialContinue[0] = PKT_CONTINUE;
  new DataView(initialContinue.buffer).setUint32(1, 0, true);
  new DataView(initialContinue.buffer).setUint32(5, 8, true); // credit = 8
  ws._inject(initialContinue);

  const stream = await streamPromise;
  assert.ok(stream instanceof WispStream);

  // The client should have sent a CONNECT packet
  const connectFrame = ws._sentFrames.find((f) => f[0] === PKT_CONNECT);
  assert.ok(connectFrame, 'client sent CONNECT');
  const parsed = parsePacket(connectFrame);
  assert.equal(parsed.type, PKT_CONNECT);
  // stream id 1 (first stream)
  assert.equal(parsed.streamId, 1);
  // payload: stream_type + port + host
  assert.equal(parsed.payload[0], STREAM_TYPE_TCP);
  assert.equal(u16le(parsed.payload, 1), 443);
  assert.equal(new TextDecoder().decode(parsed.payload.subarray(3)), 'example.com');
});

await test('WispStream.write sends DATA packet on the stream', async () => {
  MockWebSocket.reset();
  const conn = new WispConnection('wss://test/wisp/');
  const streamPromise = conn.connectTcp('example.com', 443);
  await tick();
  const ws = MockWebSocket._instances[0];

  // Initial CONTINUE on stream 0
  const initial = new Uint8Array(9);
  initial[0] = PKT_CONTINUE;
  new DataView(initial.buffer).setUint32(5, 8, true);
  ws._inject(initial);

  const stream = await streamPromise;
  const framesBefore = ws._sentFrames.length;

  stream.write(new Uint8Array([0x41, 0x42, 0x43])); // "ABC"
  await tick();

  const dataFrames = ws._sentFrames.slice(framesBefore).filter((f) => f[0] === PKT_DATA);
  assert.equal(dataFrames.length, 1, 'one DATA frame sent');
  assert.equal(u32le(dataFrames[0], 1), 1, 'stream id is 1');
  assert.deepEqual(Array.from(dataFrames[0].subarray(5)), [0x41, 0x42, 0x43]);
});

await test('WispStream.push() fires on incoming DATA', async () => {
  MockWebSocket.reset();
  const conn = new WispConnection('wss://test/wisp/');
  const streamPromise = conn.connectTcp('example.com', 443);
  await tick();
  const ws = MockWebSocket._instances[0];
  const initial = new Uint8Array(9);
  initial[0] = PKT_CONTINUE;
  new DataView(initial.buffer).setUint32(5, 8, true);
  ws._inject(initial);
  const stream = await streamPromise;

  let receivedData = null;
  stream.on('data', (chunk) => { receivedData = chunk; });

  // Server sends DATA to stream 1
  const payload = new Uint8Array([0x58, 0x59, 0x5a]); // "XYZ"
  const dataFrame = buildData(1, payload);
  ws._inject(dataFrame);
  await tick();

  assert.ok(receivedData, 'data event fired');
  assert.deepEqual(Array.from(receivedData), [0x58, 0x59, 0x5a]);
  assert.equal(stream.bytesRead, 3);
});

await test('WispStream credit-limited: pauses writes when credit exhausted', async () => {
  MockWebSocket.reset();
  const conn = new WispConnection('wss://test/wisp/');
  const streamPromise = conn.connectTcp('example.com', 443);
  await tick();
  const ws = MockWebSocket._instances[0];

  // Initial buffer = 2 (we can send 2 DATA packets before needing CONTINUE)
  const initial = new Uint8Array(9);
  initial[0] = PKT_CONTINUE;
  new DataView(initial.buffer).setUint32(5, 2, true);
  ws._inject(initial);
  const stream = await streamPromise;
  const framesBefore = ws._sentFrames.length;

  // Write 4 packets — only 2 should go through immediately
  stream.write(new Uint8Array([1]));
  stream.write(new Uint8Array([2]));
  stream.write(new Uint8Array([3]));
  stream.write(new Uint8Array([4]));
  await tick();

  const dataFrames = ws._sentFrames.slice(framesBefore).filter((f) => f[0] === PKT_DATA);
  assert.equal(dataFrames.length, 2, 'only 2 DATA frames sent (credit-limited)');

  // Now server sends CONTINUE with more credit
  const cont = new Uint8Array(9);
  cont[0] = PKT_CONTINUE;
  new DataView(cont.buffer).setUint32(1, 1, true); // stream id 1
  new DataView(cont.buffer).setUint32(5, 5, true); // new credit = 5
  ws._inject(cont);
  await tick();

  const dataFramesAfter = ws._sentFrames.slice(framesBefore).filter((f) => f[0] === PKT_DATA);
  assert.equal(dataFramesAfter.length, 4, 'remaining 2 frames flushed after CONTINUE');
});

await test('WispStream emits close on remote CLOSE', async () => {
  MockWebSocket.reset();
  const conn = new WispConnection('wss://test/wisp/');
  const streamPromise = conn.connectTcp('example.com', 443);
  await tick();
  const ws = MockWebSocket._instances[0];
  const initial = new Uint8Array(9);
  initial[0] = PKT_CONTINUE;
  new DataView(initial.buffer).setUint32(5, 8, true);
  ws._inject(initial);
  const stream = await streamPromise;

  let closed = false;
  stream.on('end', () => { closed = true; });

  const closeFrame = buildClose(1, 0x02); // voluntary
  ws._inject(closeFrame);
  await tick();

  // Readable end event should fire (push(null))
  await new Promise((resolve) => setTimeout(resolve, 10));
  // Stream.read() to trigger 'end' in flowing mode
  stream.resume();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(closed, true, 'end event fired after remote CLOSE');
});

await test('Multiplexing: two streams get different stream IDs', async () => {
  MockWebSocket.reset();
  const conn = new WispConnection('wss://test/wisp/');
  const s1Promise = conn.connectTcp('host1.test', 80);
  const s2Promise = conn.connectTcp('host2.test', 443);
  await tick();
  const ws = MockWebSocket._instances[0];
  const initial = new Uint8Array(9);
  initial[0] = PKT_CONTINUE;
  new DataView(initial.buffer).setUint32(5, 8, true);
  ws._inject(initial);

  const [s1, s2] = await Promise.all([s1Promise, s2Promise]);
  assert.ok(s1 instanceof WispStream);
  assert.ok(s2 instanceof WispStream);
  assert.notEqual(s1._streamId, s2._streamId);

  const connectFrames = ws._sentFrames.filter((f) => f[0] === PKT_CONNECT);
  assert.equal(connectFrames.length, 2);
  const ids = connectFrames.map((f) => u32le(f, 1)).sort();
  assert.deepEqual(ids, [1, 2]);
});

// ─── Summary ────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
