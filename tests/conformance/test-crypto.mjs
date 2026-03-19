import { createHarness } from './_harness.mjs';
import { printConformanceTarget, getConformanceTargetMode } from './_targets.mjs';

const mode = getConformanceTargetMode();
const { test, testAsync, assert, assertEq, finish } =
  createHarness('Conformance: crypto');

printConformanceTarget('crypto');

// Load crypto based on mode
let crypto;
if (mode === 'node') {
  crypto = (await import('node:crypto')).default || await import('node:crypto');
} else {
  const mod = await import('../../napi-bridge/browser-builtins.js');
  crypto = mod.cryptoBridge;
}

// ─── createHash ──────────────────────────────────────────────────────

test('createHash("sha256") returns a hash object with update and digest', () => {
  const hash = crypto.createHash('sha256');
  assert(hash, 'createHash should return an object');
  assert(typeof hash.update === 'function', 'hash should have update()');
  assert(typeof hash.digest === 'function', 'hash should have digest()');
});

test('createHash("sha256").update().digest("hex") is synchronous', () => {
  const result = crypto.createHash('sha256').update('hello').digest('hex');
  assert(typeof result === 'string', `digest should return string, got ${typeof result}`);
  assertEq(result.length, 64); // SHA-256 = 32 bytes = 64 hex chars
  // Known SHA-256 of "hello"
  assertEq(result, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

test('createHash("sha256") with Buffer input', () => {
  const buf = new TextEncoder().encode('hello');
  const result = crypto.createHash('sha256').update(buf).digest('hex');
  assertEq(result, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

test('createHash("sha256").digest("base64") returns base64', () => {
  const result = crypto.createHash('sha256').update('hello').digest('base64');
  assert(typeof result === 'string', 'should be string');
  // Base64 of SHA-256("hello")
  assertEq(result, 'LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=');
});

test('createHash("sha512") produces correct output', () => {
  const result = crypto.createHash('sha512').update('hello').digest('hex');
  assertEq(result.length, 128); // SHA-512 = 64 bytes = 128 hex chars
  assert(result.startsWith('9b71d224bd62f378'), 'should match known SHA-512 prefix');
});

test('createHash with multiple updates', () => {
  const result = crypto.createHash('sha256')
    .update('hel')
    .update('lo')
    .digest('hex');
  assertEq(result, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

test('createHash("sha1") works', () => {
  const result = crypto.createHash('sha1').update('hello').digest('hex');
  assertEq(result, 'aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
});

// ─── createHmac ──────────────────────────────────────────────────────

test('createHmac("sha256", key) returns hmac object', () => {
  const hmac = crypto.createHmac('sha256', 'secret');
  assert(hmac, 'createHmac should return an object');
  assert(typeof hmac.update === 'function', 'hmac should have update()');
  assert(typeof hmac.digest === 'function', 'hmac should have digest()');
});

test('createHmac("sha256", key).update().digest("hex") is synchronous', () => {
  const result = crypto.createHmac('sha256', 'secret').update('hello').digest('hex');
  assert(typeof result === 'string', `should be string, got ${typeof result}`);
  assertEq(result.length, 64);
  // Known HMAC-SHA256("hello", "secret")
  assertEq(result, '88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b');
});

test('createHmac with Buffer key', () => {
  const key = new TextEncoder().encode('secret');
  const result = crypto.createHmac('sha256', key).update('hello').digest('hex');
  assertEq(result, '88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b');
});

// ─── randomBytes ─────────────────────────────────────────────────────

test('randomBytes returns Uint8Array of correct size', () => {
  const buf = crypto.randomBytes(32);
  assert(buf instanceof Uint8Array, 'should return Uint8Array');
  assertEq(buf.length, 32);
});

test('randomBytes returns different values', () => {
  const a = crypto.randomBytes(16);
  const b = crypto.randomBytes(16);
  let same = true;
  for (let i = 0; i < 16; i++) {
    if (a[i] !== b[i]) { same = false; break; }
  }
  assert(!same, 'two random buffers should not be identical');
});

finish();
