/**
 * Puppeteer test harness — validates:
 * 1. Page loads without JS errors
 * 2. Terminal visible in idle state with glass animation
 * 3. Tap/click zooms terminal (no wobble)
 * 4. Boot sequence completes with all status lines
 * 5. "ready" state shows blinking cursor
 * 6. White frame border visible in dark mode
 * 7. Escape resets to idle
 */

import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const CHROME = '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome';
const PORT = 9876;
const URL = `http://localhost:${PORT}/`;
const DOCS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let server;
let browser;
let page;
let errors = [];
let passed = 0;
let failed = 0;

function ok(name) { passed++; console.log(`  \u2713 ${name}`); }
function fail(name, err) { failed++; console.log(`  \u2717 ${name}: ${err}`); }

async function assert(name, fn) {
  try {
    await fn();
    ok(name);
  } catch (e) {
    fail(name, e.message);
  }
}

async function setup() {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', DOCS_DIR], {
    stdio: 'pipe',
  });
  await new Promise(r => setTimeout(r, 1000));

  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-web-security'],
  });
  page = await browser.newPage();
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2.5 });

  // Emulate dark mode
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);

  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('fonts.googleapis') && !m.text().includes('Failed to load resource')) {
      errors.push(m.text());
    }
  });
}

async function teardown() {
  if (browser) await browser.close();
  if (server) server.kill();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('\n\ud83e\uddea v9 Test Harness\n');

  await setup();

  try {
    // ── Load page ──
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);

    await assert('Page loads without JS errors', async () => {
      const realErrors = errors.filter(e => !e.includes('net::'));
      if (realErrors.length > 0) throw new Error(realErrors.join('; '));
    });

    // ── Idle state ──
    await assert('Terminal visible in idle state', async () => {
      const visible = await page.$eval('#terminal-wrap', el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (!visible) throw new Error('Terminal wrap not visible');
    });

    await assert('Terminal has idle class initially', async () => {
      const hasIdle = await page.$eval('#terminal-wrap', el => el.classList.contains('idle'));
      if (!hasIdle) throw new Error('Missing idle class');
    });

    await assert('Glass canvas is rendering', async () => {
      const dims = await page.$eval('#glass-canvas', el => ({ w: el.width, h: el.height }));
      if (dims.w === 0 || dims.h === 0) throw new Error(`Canvas dims: ${dims.w}x${dims.h}`);
    });

    // ── Dark mode white frame border ──
    await assert('Frame has white/bright border in dark mode', async () => {
      const borderColor = await page.$eval('#terminal-frame', el => getComputedStyle(el).borderColor);
      const match = borderColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) throw new Error(`Border color: ${borderColor}`);
      const [, r, g, b] = match.map(Number);
      if (r < 200 || g < 200 || b < 200) throw new Error(`Border too dark: ${borderColor}`);
    });

    // ── Click to zoom ──
    console.log('\n  Clicking terminal to zoom in...');
    await page.click('#terminal-wrap');
    await sleep(3000);

    await assert('Terminal zoomed (idle class removed)', async () => {
      const hasIdle = await page.$eval('#terminal-wrap', el => el.classList.contains('idle'));
      if (hasIdle) throw new Error('Still has idle class after click');
    });

    await assert('Terminal has zoomed class', async () => {
      const hasZoomed = await page.$eval('#terminal-wrap', el => el.classList.contains('zoomed'));
      if (!hasZoomed) throw new Error('Missing zoomed class');
    });

    // ── Boot sequence ──
    await sleep(6000);

    await assert('Boot overlay is visible', async () => {
      const hasVisible = await page.$eval('#terminal-overlay', el => el.classList.contains('visible'));
      if (!hasVisible) throw new Error('Overlay not visible');
    });

    await assert('Boot lines rendered (at least 5)', async () => {
      const count = await page.$$eval('.boot-line.visible', els => els.length);
      if (count < 5) throw new Error(`Only ${count} boot lines visible`);
    });

    await assert('Boot text contains "ready"', async () => {
      const text = await page.$eval('#boot-text', el => el.textContent);
      if (!text.includes('ready')) throw new Error(`Boot text: ${text.slice(0, 100)}`);
    });

    await assert('Blinking cursor is present after boot', async () => {
      const cursor = await page.$('.boot-cursor');
      if (!cursor) throw new Error('No blinking cursor found');
    });

    // ── Escape resets to idle ──
    console.log('\n  Testing Escape to reset...');
    await page.keyboard.press('Escape');
    await sleep(2000);

    await assert('Escape returns to idle state', async () => {
      const hasIdle = await page.$eval('#terminal-wrap', el => el.classList.contains('idle'));
      if (!hasIdle) throw new Error('Did not return to idle');
    });

    await assert('Overlay hidden after escape', async () => {
      const hasVisible = await page.$eval('#terminal-overlay', el => el.classList.contains('visible'));
      if (hasVisible) throw new Error('Overlay still visible');
    });

    // ── No JS errors ──
    await assert('No JS errors during entire session', async () => {
      const realErrors = errors.filter(e => !e.includes('net::'));
      if (realErrors.length > 0) throw new Error(realErrors.join('; '));
    });

  } finally {
    await teardown();
  }

  console.log(`\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Fatal:', e);
  teardown().then(() => process.exit(1));
});
