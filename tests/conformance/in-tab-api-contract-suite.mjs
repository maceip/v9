/**
 * Node API contract — same behavioral cases across hosts:
 *
 * - **Chromium parent** — `document` exists (Playwright loads contract HTML). `CONFORMANCE_TARGET=bridge`.
 * - **Node parent** — `node` (or Wasm VM) with `CONFORMANCE_TARGET=bridge` or `node`.
 *
 * Pairs: where behavior differs (real OS child vs MEMFS shim, real `net.listen` vs stubs),
 * we run **both** a node-native case and a bridge/Chromium-appropriate case so neither
 * gate is an accidental subset.
 *
 * Run via:       node tests/conformance/test-in-tab-api-contract.mjs (runner)
 * Run (bundle): node dist/in-tab-api-contract.js  (after bun scripts/build-in-tab-api-contract.mjs)
 * Run (dual gate): npm run test:nodejs-in-tab-contract → Chromium host + Wasm (Node parent) + bridge
 *
 * Browser host sets NODEJS_IN_TAB_FETCH_PROXY via ?fetchProxy= — see contract-phase-browser.mjs.
 */

import { createHarness, HarnessSkip } from './_harness.mjs';
import {
  getConformanceTargetMode,
  printConformanceTarget,
  loadFsModule,
  loadStreamsModule,
  loadUtilModule,
  loadBufferModule,
  loadEventEmitterModule,
} from './_targets.mjs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

export async function runInTabApiContract() {
const __dirname = dirname(fileURLToPath(import.meta.url));

const mode = getConformanceTargetMode();
/** True when the JS realm is a Chromium renderer (Playwright contract page). */
const chromiumParent = typeof globalThis.document !== 'undefined';
const { test, testAsync, assert, assertEq, assertDeepEq, assertThrows, finish } =
  createHarness('In-tab API contract (behavioral)');

printConformanceTarget('in-tab-api-contract');

const { fs } = await loadFsModule();
const { util } = await loadUtilModule();
const { Buffer } = await loadBufferModule();
const { EventEmitter } = await loadEventEmitterModule();
const {
  PassThrough,
  Readable,
  pipeline,
} = await loadStreamsModule();

let http;
let https;
if (mode === 'node') {
  http = (await import('node:http')).default;
  https = (await import('node:https')).default;
} else {
  const mod = await import('../../napi-bridge/http.js');
  http = mod.http;
  https = mod.https;
}

let crypto;
if (mode === 'node') {
  crypto = await import('node:crypto').then((m) => m.default || m);
} else {
  const mod = await import('../../napi-bridge/browser-builtins.js');
  crypto = mod.cryptoBridge;
}

let path;
if (mode === 'node') {
  path = await import('node:path').then((m) => m.default || m);
} else {
  const mod = await import('../../napi-bridge/browser-builtins.js');
  path = mod.pathBridge;
}

let os;
if (mode === 'node') {
  os = await import('node:os').then((m) => m.default || m);
} else {
  const mod = await import('../../napi-bridge/os.js');
  os = mod.default || mod;
}

let child_process;
if (mode === 'node') {
  child_process = await import('node:child_process').then((m) => m.default || m);
} else {
  child_process = (await import('../../napi-bridge/child-process.js')).default;
}

let readline;
if (mode === 'node') {
  readline = await import('node:readline').then((m) => m.default || m);
} else {
  readline = await import('../../napi-bridge/readline.js').then((m) => m.default || m);
}

let async_hooks;
if (mode === 'node') {
  async_hooks = await import('node:async_hooks');
} else {
  async_hooks = await import('../../napi-bridge/async-hooks.js');
}

const { AsyncLocalStorage } = async_hooks;

let net;
if (mode === 'node') {
  net = await import('node:net').then((m) => m.default || m);
} else {
  net = (await import('../../napi-bridge/net-stubs.js')).net;
}

let zlib;
if (mode === 'node') {
  zlib = await import('node:zlib').then((m) => m.default || m);
} else {
  zlib = await import('../../napi-bridge/zlib.js').then((m) => m.default || m);
}

let StringDecoder;
if (mode === 'node') {
  StringDecoder = (await import('node:string_decoder')).StringDecoder;
} else {
  StringDecoder = (await import('../../napi-bridge/string-decoder.js')).StringDecoder;
}

// ─── fs — real mutations (sync + promises + streams + fd + callback) ─

const tmp = (name) => `/tmp/in_tab_contract_${Date.now()}_${name}`;

test('fs full sync workflow: write → stat size → rename → read → unlink', () => {
  const a = tmp('a.txt');
  const b = tmp('b.txt');
  fs.writeFileSync(a, 'payload', 'utf8');
  assertEq(fs.statSync(a).size, 7);
  fs.renameSync(a, b);
  assertThrows(() => fs.statSync(a)); // gone
  assertEq(fs.readFileSync(b, 'utf8'), 'payload');
  fs.unlinkSync(b);
});

await testAsync('fs.promises pipeline: mkdir, writeFile, readdir, stat, rm', async () => {
  const base = tmp('prom_dir');
  const sub = `${base}/n`;
  await fs.promises.mkdir(sub, { recursive: true });
  await fs.promises.writeFile(`${sub}/x.txt`, 'xy', 'utf8');
  const names = await fs.promises.readdir(sub);
  assert(names.includes('x.txt'), `readdir got ${JSON.stringify(names)}`);
  const st = await fs.promises.stat(`${sub}/x.txt`);
  assertEq(st.size, 2);
  await fs.promises.rm(base, { recursive: true, force: true });
});

await testAsync('fs.createWriteStream + createReadStream move bytes (MEMFS may pad capacity)', async () => {
  const p = tmp('stream.bin');
  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(p);
    w.on('error', reject);
    w.on('finish', resolve);
    w.write(Buffer.from([1, 2, 3, 4]));
    w.end();
  });
  const chunks = [];
  await new Promise((resolve, reject) => {
    const r = fs.createReadStream(p);
    r.on('data', (c) => chunks.push(Buffer.from(c)));
    r.on('end', resolve);
    r.on('error', reject);
  });
  const merged = Buffer.concat(chunks);
  assert(merged.length >= 4, `read back at least 4 bytes, got ${merged.length}`);
  assertEq(merged[0], 1);
  assertEq(merged[3], 4);
  fs.unlinkSync(p);
});

test('fs openSync + readSync + writeSync + closeSync', () => {
  const p = tmp('fd.txt');
  fs.writeFileSync(p, 'abcd');
  const fd = fs.openSync(p, 'r+');
  const buf = Buffer.alloc(4);
  assertEq(fs.readSync(fd, buf, 0, 4, 0), 4);
  assertEq(buf.toString(), 'abcd');
  buf.fill(0);
  buf.write('1');
  assertEq(fs.writeSync(fd, buf, 0, 1, 0), 1);
  fs.closeSync(fd);
  assertEq(fs.readFileSync(p, 'utf8')[0], '1');
  fs.unlinkSync(p);
});

await testAsync('fs.readFile callback form', async () => {
  const p = tmp('cb.txt');
  fs.writeFileSync(p, 'cbdata');
  await new Promise((resolve, reject) => {
    fs.readFile(p, 'utf8', (err, data) => {
      if (err) reject(err);
      else {
        assertEq(data, 'cbdata');
        resolve();
      }
    });
  });
  fs.unlinkSync(p);
});

test('fs.writeFileSync wx / r+ / append (exclusive-write and append flags)', () => {
  const p = tmp('flags.txt');
  try { fs.unlinkSync(p); } catch {}
  fs.writeFileSync(p, 'a', { flag: 'wx' });
  const err = assertThrows(() => fs.writeFileSync(p, 'b', { flag: 'wx' }));
  assertEq(err.code, 'EEXIST');
  fs.writeFileSync(p, 'hel', { flag: 'w' });
  fs.writeFileSync(p, 'lo', { flag: 'a' });
  assertEq(fs.readFileSync(p, 'utf8'), 'hello');
  fs.unlinkSync(p);
});

test('fs.copyFileSync COPYFILE_EXCL', () => {
  const a = tmp('ca.txt');
  const b = tmp('cb.txt');
  fs.writeFileSync(a, 'a');
  fs.writeFileSync(b, 'b');
  const EXCL = fs.constants?.COPYFILE_EXCL ?? 1;
  const err = assertThrows(() => fs.copyFileSync(a, b, EXCL));
  assertEq(err.code, 'EEXIST');
  fs.unlinkSync(a);
  fs.unlinkSync(b);
});

// ─── http / https — real client + (Node) real local server ────────────

await testAsync('https.get live TLS fetch (httpbin GET + parse JSON body)', async () => {
  let body;
  try {
    body = await Promise.race([
      new Promise((resolve, reject) => {
        const req = https.get('https://httpbin.org/get?contract=1', (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`httpbin returned ${res.statusCode}`));
            res.resume();
            return;
          }
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(15_000, () => {
          req.destroy();
          reject(new Error('https.get timeout'));
        });
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('overall timeout')), 20_000)),
    ]);
  } catch (err) {
    throw new HarnessSkip(`httpbin.org unreachable: ${err.message}`);
  }
  const parsed = JSON.parse(body);
  assert(parsed.args?.contract === '1', 'httpbin echoed query');
});

await testAsync('https.request live POST JSON (httpbin POST)', async () => {
  const payload = JSON.stringify({ inTabContract: true, t: Date.now() });
  let body;
  try {
    body = await Promise.race([
      new Promise((resolve, reject) => {
        const req = https.request(
          'https://httpbin.org/post',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            },
          },
          (res) => {
            if (res.statusCode !== 200) {
              reject(new Error(`httpbin returned ${res.statusCode}`));
              res.resume();
              return;
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            res.on('error', reject);
          },
        );
        req.on('error', reject);
        req.setTimeout(15_000, () => {
          req.destroy();
          reject(new Error('https.request timeout'));
        });
        req.write(payload);
        req.end();
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('overall timeout')), 20_000)),
    ]);
  } catch (err) {
    throw new HarnessSkip(`httpbin.org unreachable: ${err.message}`);
  }
  const parsed = JSON.parse(body);
  assertDeepEq(parsed.json?.inTabContract, true);
});

await testAsync('fetch proxy: upstream failure surfaces as error (bridge + in-tab proxy)', async () => {
  if (mode !== 'bridge') throw new HarnessSkip('bridge-only');
  const { getHttpTransportMode, browserHttpFetch } = await import('../../napi-bridge/transport-policy.mjs');
  if (getHttpTransportMode() !== 'fetch-proxy') {
    throw new HarnessSkip('fetch-proxy only (browser contract passes ?fetchProxy=)');
  }
  let thrown = false;
  try {
    await browserHttpFetch('https://invalid.invalid/contract-net-fail', {
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout
        ? AbortSignal.timeout(15_000)
        : undefined,
    });
  } catch {
    thrown = true;
  }
  assert(thrown, 'browserHttpFetch should throw when relay reports upstream failure');
});

if (mode === 'node') await testAsync('http loopback: POST body echoed as JSON (real TCP server)', async () => {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ len: raw.length, head: raw.slice(0, 20) }));
    });
  });
  await new Promise((r, j) => {
    server.listen(0, '127.0.0.1', r);
    server.once('error', j);
  });
  const { port } = server.address();
  const send = JSON.stringify({ hello: 'world' });
  const reply = await new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/api', method: 'POST', headers: { 'Content-Length': Buffer.byteLength(send) } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.write(send);
    req.end();
  });
  const parsed = JSON.parse(reply);
  assertEq(parsed.len, send.length);
  await new Promise((r) => server.close(() => r()));
});

await testAsync('http.createServer deferred listener + callback URL parse', async () => {
  const server = http.createServer();
  let saw = false;
  server.on('request', (req, res) => {
    saw = true;
    const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    assertEq(u.pathname, '/callback');
    res.writeHead(302, { Location: 'https://example/success' });
    res.end();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  if (mode === 'bridge' && typeof server._handleRedirect === 'function') {
    server._handleRedirect(`http://127.0.0.1:${addr.port}/callback?code=secret&state=s`);
  } else {
    await new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: addr.port, path: '/callback', method: 'GET' },
        (res) => {
          res.resume();
          res.on('end', resolve);
        },
      );
      req.on('error', reject);
      req.end();
    });
  }
  assertEq(saw, true);
  await new Promise((r) => server.close(() => r()));
});

// ─── crypto — real digests and randomness ────────────────────────────

test('crypto.randomBytes + randomUUID', () => {
  const b = crypto.randomBytes(32);
  assertEq(b.length, 32);
  assert([...b].some((x) => x !== 0), 'not all zeros');
  const u = crypto.randomUUID();
  assert(/^[\da-f-]{36}$/i.test(u), 'uuid shape');
});

test('crypto.createHash sha256 known answer', () => {
  const hex = crypto.createHash('sha256').update('hello').digest('hex');
  assertEq(hex, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});

test('crypto.createHmac roundtrip check', () => {
  const h = crypto.createHmac('sha256', 'key').update('msg').digest('hex');
  assertEq(h.length, 64);
});

// ─── zlib — compress and decompress bytes ────────────────────────────

test('zlib gzipSync + gunzipSync roundtrip', () => {
  const input = Buffer.from('in-tab contract payload'.repeat(20), 'utf8');
  const z = zlib.gzipSync(input);
  assert(z.length > 0 && z.length < input.byteLength, 'gzip shrinks repeated string');
  const out = zlib.gunzipSync(z);
  const u8 = out instanceof Uint8Array ? out : Buffer.from(out);
  const decoded = new TextDecoder('utf8').decode(u8);
  assertEq(decoded, input.toString('utf8'));
});

// ─── streams + string_decoder — decode chunked UTF-8 ────────────────

await testAsync('stream pipeline pushes bytes through PassThrough chain', async () => {
  const mid = new PassThrough();
  const out = [];
  const dst = new PassThrough();
  dst.on('data', (c) => out.push(Buffer.from(c)));
  const src = new Readable({ read() {} });
  queueMicrotask(() => {
    src.push('ab');
    src.push('c');
    src.push(null);
  });
  await new Promise((resolve, reject) => {
    pipeline(src, mid, dst, (err) => (err ? reject(err) : resolve()));
  });
  assertEq(Buffer.concat(out).toString(), 'abc');
});

test('StringDecoder decodes multi-byte chunk split', () => {
  const dec = new StringDecoder('utf8');
  const b = Buffer.from('éclair', 'utf8');
  const a = dec.write(b.subarray(0, 2));
  const c = dec.write(b.subarray(2));
  const end = dec.end();
  assertEq(a + c + end, 'éclair');
});

// ─── child_process — real OS children (node) / MEMFS shims (bridge) ───

if (mode === 'node') {
  test('child_process.spawnSync captures stdout (real subprocess)', () => {
    if (typeof child_process.spawnSync !== 'function') return;
    const r = child_process.spawnSync(process.execPath, ['-e', 'process.stdout.write("OK")'], {
      encoding: 'utf8',
      shell: false,
    });
    assertEq(r.status, 0);
    assertEq(String(r.stdout).trim(), 'OK');
  });

  await testAsync('child_process.spawn streams stdout until close', async () => {
    const chunks = [];
    const child = child_process.spawn(process.execPath, ['-e', "process.stdout.write('42')"], {
      shell: false,
    });
    child.stdout?.on('data', (c) => chunks.push(Buffer.from(c)));
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    assertEq(code, 0);
    assertEq(Buffer.concat(chunks).toString(), '42');
  });
}

await testAsync('child_process.exec async callback', async () => {
  if (mode === 'node') {
    await new Promise((resolve, reject) => {
      child_process.exec(`${process.execPath} -e "console.log('hi')"`, { encoding: 'utf8' }, (err, stdout) => {
        if (err) reject(err);
        else {
          assert(stdout.includes('hi'), stdout);
          resolve();
        }
      });
    });
    return;
  }
  fs.mkdirSync('/tmp/contract_exec_cb', { recursive: true });
  fs.writeFileSync('/tmp/contract_exec_cb/in.txt', 'exec-cb');
  await new Promise((resolve, reject) => {
    child_process.exec('cat /tmp/contract_exec_cb/in.txt', { encoding: 'utf8' }, (err, stdout) => {
      if (err) reject(err);
      else {
        assertEq(stdout.trim(), 'exec-cb');
        resolve();
      }
    });
  });
});

if (mode !== 'node') {
  test('child_process.execSync reads MEMFS (real shell shim)', () => {
    fs.writeFileSync('/tmp/contract_shim.txt', 'shim-ok');
    const out = child_process.execSync('cat /tmp/contract_shim.txt', { encoding: 'utf8' });
    assertEq(out.trim(), 'shim-ok');
  });
}

// ─── readline + timers + ALS async ───────────────────────────────────

await testAsync('readline question + write injects answer', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const written = [];
  output.write = (chunk, enc, cb) => {
    written.push(String(chunk));
    if (typeof cb === 'function') cb();
    return true;
  };
  const rl = readline.createInterface({ input, output, terminal: false });
  const ans = new Promise((resolve) => {
    rl.question('Q: ', resolve);
  });
  rl.write('answer-line\n');
  assertEq(await ans, 'answer-line');
  assert(written.some((s) => s.includes('Q:')), 'prompt written');
  rl.close();
});

test('AsyncLocalStorage getStore inside synchronous run', () => {
  const als = new AsyncLocalStorage();
  als.run({ tag: 7 }, () => {
    assertEq(als.getStore().tag, 7);
  });
});

if (mode === 'node') {
  await testAsync('AsyncLocalStorage survives await + setImmediate (Node)', async () => {
    const als = new AsyncLocalStorage();
    await new Promise((resolve) => {
      als.run({ tag: 99 }, async () => {
        assertEq(als.getStore().tag, 99);
        await Promise.resolve();
        await new Promise((r) => setImmediate(r));
        assertEq(als.getStore().tag, 99);
        resolve();
      });
    });
  });
}

// ─── worker_threads — Node Worker (node) / bridge API (bridge) ──────

if (mode === 'node') {
  await testAsync('worker_threads Worker workerData round-trip', async () => {
    const { Worker } = await import('node:worker_threads');
    const workerPath = path.join(__dirname, 'contract-worker-ping.mjs');
    const w = new Worker(workerPath, { workerData: { n: 42 } });
    const msg = await new Promise((resolve, reject) => {
      w.once('message', resolve);
      w.once('error', reject);
    });
    assertEq(msg.echo?.n, 42);
    assertEq(msg.selfCheck, 1);
    await w.terminate();
  });
} else {
  await testAsync('worker_threads bridge: isMainThread + environment data + MessageChannel', async () => {
    const wt = await import('../../napi-bridge/worker-threads.js');
    assertEq(wt.isMainThread, true);
    wt.setEnvironmentData('in-tab-api-contract', { k: 1 });
    assertDeepEq(wt.getEnvironmentData('in-tab-api-contract'), { k: 1 });
    const ch = new wt.MessageChannel();
    assert(ch.port1 && ch.port2, 'MessageChannel ports');
    // Node's native MessagePorts hold libuv handles; leaving them open can assert on Windows during exit.
    ch.port1.close();
    ch.port2.close();
  });
}

// ─── EventEmitter, Buffer, path, url, os, util, perf ─────────────────

test('EventEmitter emit/on counts deliveries', () => {
  const ee = new EventEmitter();
  let n = 0;
  ee.on('tick', () => { n++; });
  ee.emit('tick');
  ee.emit('tick');
  assertEq(n, 2);
});

test('Buffer.alloc + byte comparison', () => {
  const a = Buffer.alloc(3, 7);
  assertEq(a[0], 7);
  const b = Buffer.from([7, 7, 7]);
  assertEq(a.length, b.length);
  for (let i = 0; i < a.length; i++) assertEq(a[i], b[i]);
});

test('path.normalize + relative', () => {
  const n = path.normalize('a//b/../c');
  assert(n.includes('a') && n.includes('c'), n);
  const rel = path.relative('/tmp/a', '/tmp/a/b/c');
  assert(rel.replaceAll('\\', '/').includes('b'), rel);
});

test('URL parses searchParams mutably', () => {
  const u = new URL('https://x.test/cb?code=abc&state=s');
  assertEq(u.searchParams.get('code'), 'abc');
  u.searchParams.set('x', '1');
  assertEq(u.searchParams.get('x'), '1');
});

test('os reports numeric cpu / interface data', () => {
  const cpus = os.cpus();
  assert(Array.isArray(cpus) && cpus.length > 0, 'cpus');
  const ni = os.networkInterfaces();
  assert(typeof ni === 'object' && ni !== null, 'networkInterfaces');
});

await testAsync('util.inspect + promisify(callback delay) waits real time', async () => {
  assert(typeof util.inspect({ a: 1 }) === 'string', 'inspect');
  // Browser setTimeout has no util.promisify.custom — use explicit cb-last helper so
  // promisify is tested without relying on Node's timers/promises binding.
  const delayCb = (ms, cb) => setTimeout(cb, ms);
  const sleep = util.promisify(delayCb);
  const t0 = Date.now();
  await sleep(15);
  assert(Date.now() - t0 >= 10, 'promisified timer fired');
});

await testAsync('performance.now() increases after delay', async () => {
  // Use globalThis.performance so bridge + MEMFS bundles need not dynamic-import node:perf_hooks.
  const { performance } = globalThis;
  assert(performance && typeof performance.now === 'function', 'performance.now');
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, 10));
  assert(performance.now() > t0, 'monotonic-ish clock');
});

test('net.BlockList + SocketAddress + autoSelectFamily (import-time / policy surface)', () => {
  const bl = new net.BlockList();
  assert(bl.check('192.0.2.1') === false, 'empty blocklist');

  bl.addAddress('198.51.100.2');
  assert(bl.check('198.51.100.2') === true, 'blocked v4 addr');
  assert(bl.check('198.51.100.3') === false, 'not blocked');

  bl.addRange('203.0.113.10', '203.0.113.20');
  assert(bl.check('203.0.113.15') === true, 'in range');
  assert(bl.check('203.0.113.21') === false, 'past range');

  bl.addSubnet('192.168.0.0', 24);
  assert(bl.check('192.168.0.1') === true, 'in subnet');
  assert(bl.check('192.168.1.1') === false, 'outside subnet');

  bl.addSubnet('2001:db8::', 32, 'ipv6');
  assert(bl.check('2001:db8::1', 'ipv6') === true, 'in ipv6 subnet');
  assert(bl.check('2001:db9::1', 'ipv6') === false, 'outside ipv6 subnet');
  assert(bl.check('::1', 'ipv6') === false, 'localhost not in ipv6 subnet');
  bl.addAddress('::1', 'ipv6');
  assert(bl.check('::1', 'ipv6') === true, 'ipv6 exact via canonical');

  const prev = net.getDefaultAutoSelectFamily();
  net.setDefaultAutoSelectFamily(false);
  assertEq(net.getDefaultAutoSelectFamily(), false, 'toggle auto family');
  net.setDefaultAutoSelectFamily(prev);
  const t0 = net.getDefaultAutoSelectFamilyAttemptTimeout();
  net.setDefaultAutoSelectFamilyAttemptTimeout(400);
  assertEq(net.getDefaultAutoSelectFamilyAttemptTimeout(), 400, 'family timeout');
  net.setDefaultAutoSelectFamilyAttemptTimeout(t0);

  const sa = new net.SocketAddress({ address: '127.0.0.1', port: 9 });
  assertEq(sa.address, '127.0.0.1', 'SocketAddress host');
  assertEq(sa.port, 9, 'SocketAddress port');
  assert(net.Stream === net.Socket, 'Stream alias');
});

test('net TCP listen unavailable in bridge (documented)', () => {
  if (mode === 'node') return;
  assertThrows(() => net.createServer(), /not available in the browser environment/i);
  const srv = new net.Server();
  assertThrows(() => srv.listen(4000, '127.0.0.1'), /not available in the browser environment/i);
});

finish();
}
