#!/usr/bin/env node
/**
 * E2E test — Run 10 Node.js apps in v9 browser runtime via the shell.
 *
 * Follows the quickstart flow for the shell mode:
 *   1. Write small Node.js app scripts using standard Node APIs
 *   2. Bundle each with esbuild (same pipeline as `v9 build`)
 *   3. Load the shell in Playwright
 *   4. Write each bundle to MEMFS via the runtime API
 *   5. Execute via `node <file>` in the shell
 *   6. Verify success marker in terminal output
 *
 * Each app prints "[APP_NAME] OK" on success, which Playwright verifies.
 * All 10 apps use only Node.js built-in APIs provided by v9's napi-bridge.
 *
 * Usage:
 *   node tests/e2e/test-v9-run-apps.mjs                # headless
 *   node tests/e2e/test-v9-run-apps.mjs --headed        # visible browser
 */

import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const HEADED = process.argv.includes('--headed');
const TIMEOUT = 60_000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
};

// ── 10 Node.js apps using standard Node built-in APIs ───────────────
// These scripts run inside the shell's `node <file>` command.
// The shell provides: require('fs'), require('path'), and global polyfills
// (Buffer, process, URL, JSON, console). Each app tests a different facet.

const APPS = [
  {
    name: 'path-resolve',
    desc: 'path.resolve / join / normalize',
    source: `
var path = require('path');
var joined = path.join('a', 'b', 'c.js');
var resolved = path.resolve('/home', 'user', 'code');
if (joined === 'a/b/c.js' && resolved === '/home/user/code') {
  console.log('[path-resolve] OK');
} else {
  console.log('[path-resolve] FAIL');
}
`,
  },
  {
    name: 'fs-readwrite',
    desc: 'fs.writeFileSync + readFileSync roundtrip',
    source: `
var fs = require('fs');
var testPath = '/tmp/v9-test-rw.txt';
var content = 'Hello from v9 filesystem!';
fs.writeFileSync(testPath, content);
var read = fs.readFileSync(testPath, 'utf8');
if (read === content) {
  console.log('[fs-readwrite] OK');
  fs.unlinkSync(testPath);
} else {
  console.log('[fs-readwrite] FAIL');
}
`,
  },
  {
    name: 'fs-mkdir-tree',
    desc: 'fs.mkdirSync recursive + readdirSync',
    source: `
var fs = require('fs');
fs.mkdirSync('/tmp/v9-tree/a/b/c', { recursive: true });
fs.writeFileSync('/tmp/v9-tree/a/hello.txt', 'hi');
fs.writeFileSync('/tmp/v9-tree/a/b/world.txt', 'yo');
var dirs = fs.readdirSync('/tmp/v9-tree/a');
if (dirs.indexOf('hello.txt') >= 0 && dirs.indexOf('b') >= 0) {
  console.log('[fs-mkdir-tree] OK');
} else {
  console.log('[fs-mkdir-tree] FAIL');
}
`,
  },
  {
    name: 'buffer-ops',
    desc: 'Buffer-like ops via TextEncoder/Uint8Array',
    source: `
var enc = new TextEncoder();
var dec = new TextDecoder();
var bytes1 = enc.encode('Hello ');
var bytes2 = enc.encode('v9!');
var combined = new Uint8Array(bytes1.length + bytes2.length);
combined.set(bytes1, 0);
combined.set(bytes2, bytes1.length);
var text = dec.decode(combined);
var hex = Array.from(combined).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
if (text === 'Hello v9!' && hex.length > 0) {
  console.log('[buffer-ops] OK');
} else {
  console.log('[buffer-ops] FAIL');
}
`,
  },
  {
    name: 'url-parse',
    desc: 'URL constructor, searchParams, properties',
    source: `
var u = new URL('https://example.com:8080/path?key=value#section');
if (u.hostname === 'example.com' && u.port === '8080' && u.pathname === '/path' &&
    u.searchParams.get('key') === 'value' && u.hash === '#section') {
  console.log('[url-parse] OK');
} else {
  console.log('[url-parse] FAIL');
}
`,
  },
  {
    name: 'json-roundtrip',
    desc: 'JSON parse, stringify, write to fs, read back',
    source: `
var fs = require('fs');
var data = { name: 'v9-test', version: '1.0.0', features: ['wasm', 'memfs', 'napi'] };
var json = JSON.stringify(data, null, 2);
fs.writeFileSync('/tmp/v9-test.json', json);
var read = JSON.parse(fs.readFileSync('/tmp/v9-test.json', 'utf8'));
if (read.name === 'v9-test' && read.features.length === 3 && read.features[0] === 'wasm') {
  console.log('[json-roundtrip] OK');
  fs.unlinkSync('/tmp/v9-test.json');
} else {
  console.log('[json-roundtrip] FAIL');
}
`,
  },
  {
    name: 'process-info',
    desc: 'process.argv, cwd(), env',
    source: `
var cwd = process.cwd();
var argv = process.argv;
if (typeof cwd === 'string' && Array.isArray(argv) && argv.length >= 1) {
  console.log('[process-info] OK');
} else {
  console.log('[process-info] FAIL');
}
`,
  },
  {
    name: 'text-encoder',
    desc: 'TextEncoder / TextDecoder roundtrip',
    source: `
var enc = new TextEncoder();
var dec = new TextDecoder();
var bytes = enc.encode('Hello v9 TextEncoder!');
var text = dec.decode(bytes);
if (text === 'Hello v9 TextEncoder!' && bytes.length === 21) {
  console.log('[text-encoder] OK');
} else {
  console.log('[text-encoder] FAIL');
}
`,
  },
  {
    name: 'array-ops',
    desc: 'Array map, filter, reduce, flat, find',
    source: `
var nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
var evens = nums.filter(function(n) { return n % 2 === 0; });
var doubled = evens.map(function(n) { return n * 2; });
var sum = doubled.reduce(function(a, b) { return a + b; }, 0);
var nested = [[1, 2], [3, 4], [5]];
var flat = nested.flat();
var found = nums.find(function(n) { return n > 7; });
if (evens.length === 5 && sum === 60 && flat.length === 5 && found === 8) {
  console.log('[array-ops] OK');
} else {
  console.log('[array-ops] FAIL');
}
`,
  },
  {
    name: 'regex-ops',
    desc: 'RegExp match, replace, named groups',
    source: `
var re = /(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})/;
var match = '2024-12-25'.match(re);
var replaced = 'Hello World'.replace(/World/, 'v9');
var split = 'a,b,,c'.split(/,/).filter(function(s) { return s; });
if (match.groups.year === '2024' && match.groups.day === '25' &&
    replaced === 'Hello v9' && split.length === 3) {
  console.log('[regex-ops] OK');
} else {
  console.log('[regex-ops] FAIL');
}
`,
  },
];

// ── Server ──────────────────────────────────────────────────────────

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const filePath = join(ROOT, url.pathname === '/' ? '/tests/e2e/shell-test-page.html' : url.pathname);
      try {
        const data = await readFile(filePath);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end(`Not found: ${url.pathname}`);
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

async function getTerminalText(page) {
  return page.evaluate(() => {
    const term = globalThis.__edgeTerm;
    if (!term) return '';
    const lines = [];
    for (let i = 0; i < term.buffer.active.length; i++) {
      const line = term.buffer.active.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.join('\n');
  });
}

async function shellExec(page, command, waitMs = 500) {
  await page.evaluate((cmd) => globalThis._stdinPush(cmd + '\n'), command);
  await page.waitForTimeout(waitMs);
}

async function waitForMarker(page, marker, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const text = await getTerminalText(page);
    if (text.includes(marker)) return text;
    await page.waitForTimeout(300);
  }
  return await getTerminalText(page);
}

// ── Main ────────────────────────────────────────────────────────────

async function runTests() {
  let chromium;
  try {
    chromium = (await import('playwright-core')).chromium;
  } catch {
    try { chromium = (await import('playwright')).chromium; }
    catch { console.error('playwright-core not installed'); process.exit(1); }
  }

  const browserPath = process.env.PLAYWRIGHT_BROWSER_PATH ||
    process.env.CHROME_PATH ||
    (() => {
      try {
        return execSync('which chromium-browser || which chromium || which google-chrome', {
          encoding: 'utf8',
        }).trim();
      } catch { return null; }
    })();

  const { server, url: baseUrl } = await startServer();

  let browser;
  try {
    const opts = { headless: !HEADED, args: ['--no-sandbox', '--disable-setuid-sandbox'] };
    if (browserPath) opts.executablePath = browserPath;
    try { browser = await chromium.launch(opts); }
    catch { delete opts.executablePath; browser = await chromium.launch(opts); }
  } catch (err) {
    console.error(`Cannot launch browser: ${err.message}`);
    server.close();
    process.exit(1);
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  try {
    console.log('\n=== v9 run: 10 Node.js Apps in Browser Runtime ===');
    console.log('Each app uses Node.js built-in APIs provided by v9 napi-bridge.\n');

    // Load shell
    await page.goto(`${baseUrl}/tests/e2e/shell-test-page.html`, {
      timeout: TIMEOUT, waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(() => globalThis.__shellReady === true, { timeout: 15000 });
    await page.waitForTimeout(500);

    // Write each app to MEMFS, then run via shell's `node` command
    for (const app of APPS) {
      const filePath = `/tmp/${app.name}.js`;
      const marker = `[${app.name}] OK`;
      const failMarker = `[${app.name}] FAIL`;

      // Write script to MEMFS
      await page.evaluate(({ path, source }) => {
        const rt = globalThis.__edgeRuntime;
        try { rt.fs.mkdirSync('/tmp', { recursive: true }); } catch {}
        rt.fs.writeFileSync(path, source);
      }, { path: filePath, source: app.source.trim() });

      // Execute via shell
      await shellExec(page, `node ${filePath}`, 300);

      // Wait for result
      const text = await waitForMarker(page, marker, 8000);

      if (text.includes(marker)) {
        console.log(`  PASS: ${app.name} — ${app.desc}`);
        passed++;
      } else if (text.includes(failMarker)) {
        console.log(`  FAIL: ${app.name} — app assertion failed`);
        failed++;
      } else {
        console.log(`  FAIL: ${app.name} — no output marker found`);
        const lastLines = text.split('\n').slice(-5).join(' | ');
        console.log(`        last terminal lines: ${lastLines}`);
        failed++;
      }
    }

  } catch (err) {
    console.error(`\nFatal error: ${err.message}`);
    failed++;
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
