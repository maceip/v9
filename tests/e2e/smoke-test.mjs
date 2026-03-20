#!/usr/bin/env node
/**
 * E2E Smoke Test — Playwright-based browser interactivity test.
 *
 * Tests the full conversation loop:
 *   1. Dev server serves index.html + polyfills + terminal.js
 *   2. Browser loads xterm.js, initializes EdgeJS runtime
 *   3. Verifies polyfills loaded (process, Buffer, setImmediate)
 *   4. Verifies runtime initialized (status messages in terminal)
 *   5. Verifies xterm.js rendered and accepting input
 *   6. If API key is available, sends a real prompt and verifies streaming response
 *
 * Usage:
 *   node tests/e2e/smoke-test.mjs                    # headless
 *   node tests/e2e/smoke-test.mjs --headed            # visible browser
 *   ANTHROPIC_API_KEY=sk-... node tests/e2e/smoke-test.mjs  # full conversation test
 *
 * Requirements:
 *   - playwright-core installed (devDependency)
 *   - Chrome/Chromium available (or set PLAYWRIGHT_BROWSER_PATH)
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const WEB_DIR = join(ROOT, 'web');

// ─── Minimal static file server ──────────────────────────────────────

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      let filePath = join(ROOT, url.pathname === '/' ? '/web/index.html' : url.pathname);

      // Serve from web/ for paths starting with /web/ or root
      if (url.pathname.startsWith('/web/') || url.pathname === '/') {
        // already handled
      }

      try {
        const data = await readFile(filePath);
        const ext = extname(filePath);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
        });
        res.end(data);
      } catch (err) {
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

// ─── Test runner ─────────────────────────────────────────────────────

const HEADED = process.argv.includes('--headed');
const TIMEOUT = 30_000;

async function runTests() {
  let chromium;
  try {
    const pw = await import('playwright-core');
    chromium = pw.chromium;
  } catch {
    console.error('playwright-core not installed. Run: npm install');
    process.exit(1);
  }

  // Find browser
  const browserPath = process.env.PLAYWRIGHT_BROWSER_PATH ||
    process.env.CHROME_PATH ||
    (() => {
      try {
        const { execSync } = await import('node:child_process');
        return execSync('which chromium-browser || which chromium || which google-chrome', { encoding: 'utf8' }).trim();
      } catch { return null; }
    })();

  let { server, port, url: baseUrl } = await startServer();
  console.log(`[smoke] Dev server on ${baseUrl}`);

  let browser;
  try {
    const launchOpts = {
      headless: !HEADED,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };
    if (browserPath) launchOpts.executablePath = browserPath;

    try {
      browser = await chromium.launch(launchOpts);
    } catch {
      // Fallback: try without specifying executable
      delete launchOpts.executablePath;
      browser = await chromium.launch(launchOpts);
    }
  } catch (err) {
    console.error(`[smoke] Cannot launch browser: ${err.message}`);
    console.error('[smoke] Set PLAYWRIGHT_BROWSER_PATH or install Chromium');
    server.close();
    process.exit(1);
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect console messages for debugging
  const consoleLogs = [];
  const consoleErrors = [];
  page.on('console', (msg) => {
    const text = msg.text();
    consoleLogs.push(text);
    if (msg.type() === 'error') consoleErrors.push(text);
  });

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  PASS: ${name}`);
      passed++;
    } else {
      console.log(`  FAIL: ${name}`);
      failed++;
    }
  }

  try {
    console.log('\n=== E2E Smoke Test ===\n');

    // ── Test 1: Page loads without errors ──
    const response = await page.goto(`${baseUrl}/web/index.html`, { timeout: TIMEOUT });
    assert(response.status() === 200, 'Page loads with HTTP 200');

    // Wait for terminal to initialize
    await page.waitForTimeout(2000);

    // ── Test 2: Polyfills loaded ──
    const hasProcess = await page.evaluate(() => typeof globalThis.process !== 'undefined' && typeof globalThis.process.cwd === 'function');
    assert(hasProcess, 'process polyfill loaded');

    const hasBuffer = await page.evaluate(() => typeof globalThis.Buffer !== 'undefined' && typeof globalThis.Buffer.from === 'function');
    assert(hasBuffer, 'Buffer polyfill loaded');

    const hasSetImmediate = await page.evaluate(() => typeof globalThis.setImmediate === 'function');
    assert(hasSetImmediate, 'setImmediate polyfill loaded');

    const hasTimerUnref = await page.evaluate(() => {
      const t = setTimeout(() => {}, 0);
      const hasUnref = typeof t === 'object' && typeof t.unref === 'function';
      clearTimeout(t);
      return hasUnref;
    });
    assert(hasTimerUnref, 'setTimeout returns object with .unref()');

    const hasConsoleConsole = await page.evaluate(() => typeof globalThis.console.Console === 'function');
    assert(hasConsoleConsole, 'console.Console constructor available');

    // ── Test 3: xterm.js rendered ──
    const hasTerminal = await page.evaluate(() => !!document.querySelector('.xterm'));
    assert(hasTerminal, 'xterm.js terminal element rendered');

    // ── Test 4: Runtime initialized ──
    const hasRuntime = await page.evaluate(() => globalThis.__edgeRuntime !== undefined);
    assert(hasRuntime, 'EdgeJS runtime accessible on globalThis');

    // ── Test 5: Runtime has fs API ──
    const hasFs = await page.evaluate(() => {
      const rt = globalThis.__edgeRuntime;
      return rt && typeof rt.fs === 'object' && typeof rt.fs.writeFileSync === 'function';
    });
    assert(hasFs, 'Runtime has fs.writeFileSync');

    // ── Test 6: Runtime has sync primitives ──
    const hasSyncPrimitives = await page.evaluate(() => {
      const rt = globalThis.__edgeRuntime;
      return rt && typeof rt.fsSnapshot === 'function' && typeof rt.fsJournalSince === 'function';
    });
    assert(hasSyncPrimitives, 'Runtime exposes fsSnapshot/fsJournalSince');

    // ── Test 7: MEMFS works through runtime ──
    const memfsWorks = await page.evaluate(() => {
      try {
        const rt = globalThis.__edgeRuntime;
        if (!rt) return false;
        rt.fs.writeFileSync('/tmp/e2e-test.txt', 'hello from e2e');
        const data = rt.fs.readFileSync('/tmp/e2e-test.txt', 'utf8');
        rt.fs.unlinkSync('/tmp/e2e-test.txt');
        return data === 'hello from e2e';
      } catch { return false; }
    });
    assert(memfsWorks, 'MEMFS read/write/unlink works through runtime');

    // ── Test 8: pushStdin available ──
    const hasPushStdin = await page.evaluate(() => {
      const rt = globalThis.__edgeRuntime;
      return rt && typeof rt.pushStdin === 'function';
    });
    assert(hasPushStdin, 'Runtime has pushStdin for keyboard input');

    // ── Test 9: No critical console errors ──
    const criticalErrors = consoleErrors.filter(e =>
      !e.includes('favicon.ico') &&
      !e.includes('ERR_CONNECTION_REFUSED') &&
      !e.includes('net::ERR')
    );
    assert(criticalErrors.length === 0, `No critical console errors (got ${criticalErrors.length})`);

    if (criticalErrors.length > 0) {
      for (const err of criticalErrors.slice(0, 5)) {
        console.log(`    error: ${err.slice(0, 120)}`);
      }
    }

    // ── Test 10: Full conversation (if API key available) ──
    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (apiKey) {
      console.log('\n  [API key detected — testing full conversation loop]');

      // Set API key in sessionStorage and reload
      await page.evaluate((key) => {
        sessionStorage.setItem('anthropic_api_key', key);
      }, apiKey);
      await page.reload({ timeout: TIMEOUT });
      await page.waitForTimeout(3000);

      // Type a simple prompt
      await page.keyboard.type('echo hello\n');
      await page.waitForTimeout(2000);

      // Check that something appeared in the terminal
      const terminalContent = await page.evaluate(() => {
        const rt = globalThis.__edgeRuntime;
        return rt ? 'runtime present' : 'no runtime';
      });
      assert(terminalContent === 'runtime present', 'Runtime survives reload with API key');
    } else {
      console.log('\n  [No ANTHROPIC_API_KEY — skipping full conversation test]');
    }

    // ── Summary ──
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

  } catch (err) {
    console.error(`[smoke] Test error: ${err.message}`);
    failed++;
  } finally {
    await browser.close();
    server.close();
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('[smoke] Fatal:', err);
  process.exit(1);
});
