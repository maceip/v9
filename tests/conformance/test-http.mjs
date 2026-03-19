import { createHarness } from './_harness.mjs';
import { printConformanceTarget, getConformanceTargetMode } from './_targets.mjs';

const mode = getConformanceTargetMode();
const { test, testAsync, assert, assertEq, assertDeepEq, finish } =
  createHarness('Conformance: http/fetch networking');

printConformanceTarget('http');

// Load http module based on mode
let http, https;
if (mode === 'node') {
  http = (await import('node:http')).default || await import('node:http');
  https = (await import('node:https')).default || await import('node:https');
} else {
  const mod = await import('../../napi-bridge/http.js');
  http = mod.http || mod.default?.http || mod;
  https = mod.https || mod.default?.https || mod;
}

// ─── Module shape ────────────────────────────────────────────────────

test('http module exports request and get', () => {
  assert(typeof http.request === 'function', 'http.request should be a function');
  assert(typeof http.get === 'function', 'http.get should be a function');
});

test('https module exports request and get', () => {
  assert(typeof https.request === 'function', 'https.request should be a function');
  assert(typeof https.get === 'function', 'https.get should be a function');
});

// ─── ClientRequest shape ─────────────────────────────────────────────

test('http.request returns ClientRequest with expected methods', () => {
  const req = http.request('http://localhost:1', () => {});
  req.on('error', () => {}); // suppress connection error
  assert(typeof req.setHeader === 'function', 'should have setHeader');
  assert(typeof req.getHeader === 'function', 'should have getHeader');
  assert(typeof req.write === 'function', 'should have write');
  assert(typeof req.end === 'function', 'should have end');
  assert(typeof req.abort === 'function' || typeof req.destroy === 'function',
    'should have abort or destroy');
  assert(typeof req.on === 'function', 'should have on (EventEmitter)');
  req.destroy?.() || req.abort?.();
});

test('ClientRequest setHeader/getHeader work', () => {
  const req = http.request('http://localhost:1', () => {});
  req.on('error', () => {}); // suppress connection error
  req.setHeader('Content-Type', 'application/json');
  assertEq(req.getHeader('Content-Type'), 'application/json');
  // Case-insensitive retrieval
  assertEq(req.getHeader('content-type'), 'application/json');
  req.destroy?.() || req.abort?.();
});

// ─── Live HTTP test (uses httpbin or similar) ────────────────────────

await testAsync('https.get fetches a real URL and receives response', async () => {
  const body = await new Promise((resolve, reject) => {
    const req = https.get('https://httpbin.org/get', (res) => {
      assert(typeof res.statusCode === 'number', 'res.statusCode should be number');
      assertEq(res.statusCode, 200);

      // Headers should be lowercased
      assert(typeof res.headers === 'object', 'res.headers should be object');
      assert(res.headers['content-type'], 'should have content-type header');

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat
          ? Buffer.concat(chunks).toString('utf8')
          : chunks.map(c => typeof c === 'string' ? c : new TextDecoder().decode(c)).join('');
        resolve(body);
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });

  const parsed = JSON.parse(body);
  assert(parsed.url === 'https://httpbin.org/get', `url should match, got ${parsed.url}`);
});

await testAsync('https.request POST sends body and receives response', async () => {
  const postData = JSON.stringify({ test: true });

  const body = await new Promise((resolve, reject) => {
    const req = https.request('https://httpbin.org/post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength
          ? Buffer.byteLength(postData)
          : new TextEncoder().encode(postData).length,
      },
    }, (res) => {
      assertEq(res.statusCode, 200);
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = chunks.map(c => typeof c === 'string' ? c : new TextDecoder().decode(c)).join('');
        resolve(body);
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  const parsed = JSON.parse(body);
  assertEq(parsed.json?.test, true);
});

await testAsync('streaming response delivers chunks via data events', async () => {
  // Use a URL that returns a known body
  const chunks = [];
  await new Promise((resolve, reject) => {
    const req = https.get('https://httpbin.org/bytes/1024', (res) => {
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', resolve);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });

  assert(chunks.length > 0, 'should have received at least one chunk');
  const totalBytes = chunks.reduce((sum, c) => sum + c.length, 0);
  assertEq(totalBytes, 1024);
});

await testAsync('IncomingMessage headers are lowercased', async () => {
  await new Promise((resolve, reject) => {
    const req = https.get('https://httpbin.org/response-headers?X-Custom-Header=test123', (res) => {
      // httpbin echoes custom headers back
      assert(typeof res.headers === 'object', 'headers should be object');
      // All header keys should be lowercase
      for (const key of Object.keys(res.headers)) {
        assertEq(key, key.toLowerCase(), `header key "${key}" should be lowercase`);
      }
      res.on('data', () => {});
      res.on('end', resolve);
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
});

// ─── Error handling ──────────────────────────────────────────────────

await testAsync('request to invalid host emits error event', async () => {
  await new Promise((resolve) => {
    const req = http.request('http://invalid.host.that.does.not.exist.test:1', () => {
      assert(false, 'should not get response');
    });
    req.on('error', (err) => {
      assert(err, 'should receive error');
      resolve();
    });
    req.end();
  });
});

// ─── Stub modules ────────────────────────────────────────────────────

if (mode !== 'node') {
  // Only test stubs against our implementation
  test('net module loads without error', async () => {
    const net = await import('../../napi-bridge/net-stubs.js');
    assert(net, 'net module should load');
  });
}

finish();
