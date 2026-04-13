#!/usr/bin/env node
/**
 * E2E test for the responsive navbar layout on the GitHub Pages landing page.
 *
 * Tests three form factors:
 *   1. DESKTOP    — top navbar, side-by-side terminals
 *   2. PHONE PORTRAIT — bottom navbar, stacked terminals
 *   3. FOLD UNFOLDED LANDSCAPE — left side-rail navbar, side-by-side terminals
 *
 * Verifies navbar position/orientation, viewport adjustments, terminal layout,
 * and that tap-to-zoom works correctly in every mode.
 *
 * Usage:
 *   node tests/e2e/test-pages-responsive.mjs
 */

import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.mjs':  'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.wasm': 'application/wasm',
  '.ttf':  'font/ttf',
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const filePath = join(ROOT, url.pathname === '/' ? '/docs/index.html' : url.pathname);
      try {
        const data = await readFile(filePath);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

const HEADED = process.argv.includes('--headed');
const TIMEOUT = 30_000;

async function runTests() {
  let chromium;
  try {
    chromium = (await import('playwright-core')).chromium;
  } catch {
    console.error('playwright-core not installed');
    process.exit(1);
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
  console.log(`[responsive-test] Dev server on ${baseUrl}`);

  let browser;
  try {
    const opts = {
      headless: !HEADED,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };
    if (browserPath) opts.executablePath = browserPath;
    try {
      browser = await chromium.launch(opts);
    } catch {
      delete opts.executablePath;
      browser = await chromium.launch(opts);
    }
  } catch (err) {
    console.error(`[responsive-test] Cannot launch browser: ${err.message}`);
    server.close();
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  function assert(condition, name) {
    if (condition) { console.log(`  PASS: ${name}`); passed++; }
    else { console.log(`  FAIL: ${name}`); failed++; }
  }

  try {
    console.log('\n=== Responsive layout tests ===');

    // ─── DESKTOP: top navbar, side-by-side terminals ──────────────
    console.log('\n── Scenario: desktop (1440x900, mouse pointer) ──');
    let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: false });
    let page = await ctx.newPage();
    await page.goto(`${baseUrl}/docs/index.html`, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    let nav = await page.evaluate(() => {
      const n = document.getElementById('navbar');
      const cs = getComputedStyle(n);
      return { rect: n.getBoundingClientRect(), flexDirection: cs.flexDirection };
    });
    assert(nav.rect.top === 0, 'Desktop: navbar at top (top === 0)');
    assert(nav.rect.width === 1440, 'Desktop: navbar spans full width');
    assert(nav.rect.height < 100, 'Desktop: navbar is a thin bar');
    assert(nav.flexDirection === 'row', 'Desktop: navbar is horizontal (flex row)');

    let term = await page.evaluate(() => ({
      w1: document.getElementById('terminal-wrap').getBoundingClientRect(),
      w2: document.getElementById('terminal-wrap-2').getBoundingClientRect(),
    }));
    assert(term.w2.left > term.w1.right - 20, 'Desktop: terminals are side-by-side');
    assert(Math.abs(term.w1.top - term.w2.top) < 5, 'Desktop: terminals share top edge');

    // Zoom test
    await page.locator('#terminal-wrap').click();
    await page.waitForTimeout(700);
    let zoom = await page.evaluate(() =>
      document.getElementById('terminal-wrap').getBoundingClientRect(),
    );
    assert(zoom.width > 1300, `Desktop: zoomed terminal fills viewport width (${Math.round(zoom.width)})`);
    assert(zoom.height > 700, `Desktop: zoomed terminal fills viewport height (${Math.round(zoom.height)})`);
    await ctx.close();

    // ─── PHONE PORTRAIT: bottom navbar, stacked terminals ─────────
    console.log('\n── Scenario: phone portrait (390x844, touch) ──');
    ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    page = await ctx.newPage();
    await page.goto(`${baseUrl}/docs/index.html`, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    nav = await page.evaluate(() => {
      const n = document.getElementById('navbar');
      const cs = getComputedStyle(n);
      return { rect: n.getBoundingClientRect(), flexDirection: cs.flexDirection };
    });
    assert(nav.rect.bottom === 844, `Phone portrait: navbar at bottom (bottom === ${nav.rect.bottom})`);
    assert(nav.rect.width === 390, 'Phone portrait: navbar spans full width');
    assert(nav.rect.height < 100, 'Phone portrait: navbar is a thin bar');
    assert(nav.flexDirection === 'row', 'Phone portrait: navbar is horizontal');

    const vp = await page.evaluate(() => {
      const v = document.getElementById('viewport');
      const cs = getComputedStyle(v);
      return { top: cs.top, bottom: cs.bottom };
    });
    assert(vp.top === '0px', 'Phone portrait: viewport top === 0');
    assert(vp.bottom.startsWith('48px') || vp.bottom.startsWith('calc'), 'Phone portrait: viewport bottom offset for bottom navbar');

    term = await page.evaluate(() => ({
      w1: document.getElementById('terminal-wrap').getBoundingClientRect(),
      w2: document.getElementById('terminal-wrap-2').getBoundingClientRect(),
    }));
    assert(term.w2.top > term.w1.bottom - 20, 'Phone portrait: terminals are stacked vertically');
    assert(Math.abs(term.w1.left - term.w2.left) < 5, 'Phone portrait: terminals share left edge');

    await page.locator('#terminal-wrap').tap();
    await page.waitForTimeout(700);
    zoom = await page.evaluate(() =>
      document.getElementById('terminal-wrap').getBoundingClientRect(),
    );
    assert(zoom.width > 300, `Phone portrait: zoomed W fills viewport (${Math.round(zoom.width)})`);
    assert(zoom.height > 600, `Phone portrait: zoomed H fills viewport (${Math.round(zoom.height)})`);
    await ctx.close();

    // ─── FOLD UNFOLDED LANDSCAPE: left side rail, side-by-side ────
    console.log('\n── Scenario: foldable unfolded landscape (2076x1080, touch) ──');
    ctx = await browser.newContext({ viewport: { width: 2076, height: 1080 }, hasTouch: true });
    page = await ctx.newPage();
    await page.goto(`${baseUrl}/docs/index.html`, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    nav = await page.evaluate(() => {
      const n = document.getElementById('navbar');
      const cs = getComputedStyle(n);
      return { rect: n.getBoundingClientRect(), flexDirection: cs.flexDirection };
    });
    assert(nav.rect.left === 0, 'Foldable: navbar at left edge');
    assert(nav.rect.top === 0, 'Foldable: navbar spans from top');
    assert(nav.rect.height >= 1080, `Foldable: navbar spans full height (${Math.round(nav.rect.height)})`);
    assert(nav.rect.width < 100, `Foldable: navbar is a thin vertical rail (${Math.round(nav.rect.width)})`);
    assert(nav.flexDirection === 'column', 'Foldable: navbar is vertical (flex column)');

    const vp2 = await page.evaluate(() => {
      const v = document.getElementById('viewport');
      const cs = getComputedStyle(v);
      return { top: cs.top, left: cs.left };
    });
    assert(vp2.top === '0px', 'Foldable: viewport top === 0');
    assert(vp2.left.startsWith('56px') || vp2.left.startsWith('calc'), 'Foldable: viewport left offset for side rail');

    term = await page.evaluate(() => ({
      w1: document.getElementById('terminal-wrap').getBoundingClientRect(),
      w2: document.getElementById('terminal-wrap-2').getBoundingClientRect(),
    }));
    assert(term.w2.left > term.w1.right - 20, 'Foldable: terminals are side-by-side');
    assert(Math.abs(term.w1.top - term.w2.top) < 5, 'Foldable: terminals share top edge');
    assert(term.w1.left > 50, 'Foldable: terminals start to the right of the side rail');

    // Zoom fills viewport (minus rail)
    await page.locator('#terminal-wrap').tap();
    await page.waitForTimeout(700);
    zoom = await page.evaluate(() =>
      document.getElementById('terminal-wrap').getBoundingClientRect(),
    );
    assert(zoom.width > 1900, `Foldable: zoomed W fills (${Math.round(zoom.width)})`);
    assert(zoom.height > 1000, `Foldable: zoomed H fills (${Math.round(zoom.height)})`);
    await ctx.close();

    // ─── v9 label vertical in foldable mode ──────────────────────
    console.log('\n── Scenario: v9 label rotates in foldable landscape ──');
    ctx = await browser.newContext({ viewport: { width: 2076, height: 1080 }, hasTouch: true });
    page = await ctx.newPage();
    await page.goto(`${baseUrl}/docs/index.html`, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const labelWm = await page.evaluate(() => {
      const l = document.querySelector('.nav-name');
      return getComputedStyle(l).writingMode;
    });
    assert(labelWm.includes('vertical'),
      `v9 label has vertical writing-mode in side rail (${labelWm})`);
    await ctx.close();

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  } catch (err) {
    console.error(`[responsive-test] Error: ${err.message}`);
    console.error(err.stack);
    failed++;
  } finally {
    if (HEADED) {
      console.log('[responsive-test] Browser stays open. Ctrl+C to exit.');
      await new Promise(() => {});
    }
    await browser.close();
    server.close();
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('[responsive-test] Fatal:', err);
  process.exit(1);
});
