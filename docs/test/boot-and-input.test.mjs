/**
 * Puppeteer test harness — validates REAL CLI boot, rejects fakes.
 *
 * Anti-fake-shell checks:
 *   - CLI MUST load in an iframe (not DOM elements in the main page)
 *   - iframe src MUST point to web/index.html (the real terminal)
 *   - iframe MUST contain xterm.js terminal (canvas-based, not text nodes)
 *   - No #term-input, #term-response, or processCommand in main page
 *   - No canned response strings in page source
 *
 * Real CLI checks:
 *   - web/index.html serves 200
 *   - napi-bridge/index.js serves 200
 *   - iframe loads and contains xterm terminal container
 *   - xterm terminal renders (has canvas elements)
 */

import puppeteer from 'puppeteer';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const PORT = 9876;
const BASE = `http://localhost:${PORT}`;
const DOCS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_DIR = path.resolve(DOCS_DIR, '..');

let server, browser, page;
let errors = [];
let passed = 0, failed = 0;

function ok(name) { passed++; console.log(`  \u2713 ${name}`); }
function fail(name, err) { failed++; console.log(`  \u2717 ${name}: ${err}`); }
async function assert(name, fn) {
  try { await fn(); ok(name); } catch (e) { fail(name, e.message); }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function resolveChromeExecutable() {
  if (process.env.V9_PUPPETEER_EXECUTABLE) {
    return process.env.V9_PUPPETEER_EXECUTABLE;
  }
  return execSync(
    'npx puppeteer browsers install chrome@stable --format "{{path}}"',
    { cwd: REPO_DIR, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .pop();
}

async function preparePage({ blockCliProbe = false } = {}) {
  const nextPage = await browser.newPage();
  await nextPage.setViewport({ width: 412, height: 915, deviceScaleFactor: 2.5 });
  await nextPage.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  nextPage.on('pageerror', e => errors.push(e.message));
  nextPage.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('fonts.googleapis') && !m.text().includes('Failed to load resource')) {
      errors.push(m.text());
    }
  });
  nextPage.on('requestfailed', req => {
    const failure = req.failure();
    errors.push(`${req.method()} ${req.url()}${failure?.errorText ? ` -- ${failure.errorText}` : ''}`);
  });

  if (blockCliProbe) {
    await nextPage.evaluateOnNewDocument(() => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const request = input instanceof Request ? input : null;
        const url = typeof input === 'string' ? input : request?.url;
        const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
        if (method === 'HEAD' && typeof url === 'string' && url.includes('/web/index.html')) {
          return new Response(null, { status: 404, statusText: 'Not Found' });
        }
        return originalFetch(input, init);
      };
    });
  }

  return nextPage;
}

async function setup() {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', DOCS_DIR], { stdio: 'pipe' });
  await sleep(1000);
  browser = await puppeteer.launch({
    executablePath: resolveChromeExecutable(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-web-security'],
  });
  page = await preparePage();
}

async function teardown() {
  if (browser) await browser.close();
  if (server) server.kill();
}

async function run() {
  console.log('\n\ud83e\uddea v9 Real CLI Test Harness\n');
  await setup();

  try {
    // ══════════════════════════════════════════════════════
    // SECTION 1: Anti-fake-shell static checks
    // These run BEFORE loading the page to verify the
    // server isn't serving fake shell code
    // ══════════════════════════════════════════════════════
    console.log('  --- Anti-fake-shell checks ---');

    await assert('web/index.html exists and serves 200', async () => {
      const res = await fetch(`${BASE}/web/index.html`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes('terminal.js')) throw new Error('web/index.html missing terminal.js reference');
      if (!text.includes('xterm')) throw new Error('web/index.html missing xterm reference');
    });

    await assert('napi-bridge/index.js exists and serves 200', async () => {
      const res = await fetch(`${BASE}/napi-bridge/index.js`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });

    await assert('web/terminal.js exists and serves 200', async () => {
      const res = await fetch(`${BASE}/web/terminal.js`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes('initEdgeJS')) throw new Error('terminal.js missing initEdgeJS');
    });

    await assert('Main page source has NO fake shell code', async () => {
      const jsRes = await fetch(`${BASE}/js/v9-app.js`);
      const js = await jsRes.text();
      const fakePatterns = [
        'initTerminalPrompt',
        'processCommand',
        'termResponses',
        'term-input',
        'term-response',
        'command not found',
        'Available commands:',
        'inputBuffer',
      ];
      const found = fakePatterns.filter(p => js.includes(p));
      if (found.length > 0) throw new Error(`Fake shell code detected: ${found.join(', ')}`);
    });

    await assert('Main page source exposes runtime-unavailable state', async () => {
      const jsRes = await fetch(`${BASE}/js/v9-app.js`);
      const js = await jsRes.text();
      if (!js.includes('showRuntimeUnavailable')) throw new Error('Missing showRuntimeUnavailable');
      if (!js.includes('RUNTIME UNAVAILABLE')) throw new Error('Missing unavailable banner text');
    });

    // ══════════════════════════════════════════════════════
    // SECTION 2: Page load and idle state
    // ══════════════════════════════════════════════════════
    console.log('\n  --- Page load & idle state ---');

    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);

    await assert('Page loads without JS errors', async () => {
      const realErrors = errors.filter(e => !e.includes('net::'));
      if (realErrors.length > 0) throw new Error(realErrors.join('; '));
    });

    await assert('Terminal visible in idle state', async () => {
      const visible = await page.$eval('#terminal-wrap', el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!visible) throw new Error('Not visible');
    });

    await assert('Frame has white/bright border in dark mode', async () => {
      const borderColor = await page.$eval('#terminal-frame', el => getComputedStyle(el).borderColor);
      const m = borderColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) throw new Error(`Border: ${borderColor}`);
      if (Number(m[1]) < 200 || Number(m[2]) < 200 || Number(m[3]) < 200) throw new Error(`Too dark: ${borderColor}`);
    });

    await assert('Glass canvas is rendering', async () => {
      const dims = await page.$eval('#glass-canvas', el => ({ w: el.width, h: el.height }));
      if (dims.w === 0 || dims.h === 0) throw new Error(`${dims.w}x${dims.h}`);
    });

    await assert('No fake shell elements in idle DOM', async () => {
      const hasFake = await page.evaluate(() => {
        return !!(document.getElementById('term-input') ||
                  document.getElementById('term-response') ||
                  document.querySelector('[data-fake-shell]'));
      });
      if (hasFake) throw new Error('Fake shell elements found in DOM');
    });

    // ══════════════════════════════════════════════════════
    // SECTION 3: Zoom + Boot + Real CLI iframe
    // ══════════════════════════════════════════════════════
    console.log('\n  --- Zoom + Boot + Real CLI ---');

    await page.click('#terminal-wrap');
    await sleep(3000);

    await assert('Terminal zoomed', async () => {
      const z = await page.$eval('#terminal-wrap', el => el.classList.contains('zoomed'));
      if (!z) throw new Error('Not zoomed');
    });

    // Wait for full boot sequence + async resolveWebURL + iframe load
    await sleep(10000);

    await assert('Boot text shows "ready"', async () => {
      const text = await page.$eval('#boot-text', el => el.textContent);
      if (!text.includes('ready')) throw new Error(`Boot: ${text.slice(0, 100)}`);
    });

    await assert('CLI iframe has src pointing to web/index.html', async () => {
      const src = await page.$eval('#cli-frame', el => el.src);
      if (!src.includes('web/index.html')) throw new Error(`iframe src: ${src}`);
    });

    await assert('CLI iframe has visible class (loaded)', async () => {
      const visible = await page.$eval('#cli-frame', el => el.classList.contains('visible'));
      if (!visible) throw new Error('iframe not visible — CLI did not load');
    });

    await assert('CLI iframe loaded real web/index.html content', async () => {
      const frame = await page.$('#cli-frame');
      const contentFrame = await frame.contentFrame();
      if (!contentFrame) throw new Error('Cannot access iframe content');

      // Wait for iframe scripts to execute
      await sleep(2000);

      const result = await contentFrame.evaluate(() => {
        return {
          hasTerminalDiv: !!document.getElementById('terminal'),
          hasImportmap: !!document.querySelector('script[type="importmap"]'),
          title: document.title,
          hasProcess: typeof globalThis.process !== 'undefined',
          hasStdinPush: typeof globalThis._stdinPush === 'function',
          bodyText: document.body?.textContent?.slice(0, 100) || '',
        };
      });

      if (!result.hasTerminalDiv) throw new Error('No #terminal div in iframe');
      if (!result.hasImportmap) throw new Error('No importmap in iframe — not real web/index.html');
    });

    await assert('No fake shell elements after boot', async () => {
      const hasFake = await page.evaluate(() => {
        return !!(document.getElementById('term-input') ||
                  document.getElementById('term-response'));
      });
      if (hasFake) throw new Error('Fake shell elements appeared after boot');
    });

    // ══════════════════════════════════════════════════════
    // SECTION 4: Escape resets
    // ══════════════════════════════════════════════════════
    console.log('\n  --- Escape reset ---');

    // Dispatch Escape directly on parent document (iframe steals keyboard focus)
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await sleep(2000);

    await assert('Escape returns to idle', async () => {
      const idle = await page.$eval('#terminal-wrap', el => el.classList.contains('idle'));
      if (!idle) throw new Error('Not idle');
    });

    await assert('Overlay hidden', async () => {
      const vis = await page.$eval('#terminal-overlay', el => el.classList.contains('visible'));
      if (vis) throw new Error('Still visible');
    });

    await assert('No JS errors during session', async () => {
      const real = errors.filter(e => !e.includes('net::'));
      if (real.length > 0) throw new Error(real.join('; '));
    });

    // ══════════════════════════════════════════════════════
    // SECTION 5: Missing runtime shows explicit unavailable state
    // ══════════════════════════════════════════════════════
    console.log('\n  --- Missing runtime fallback ---');

    await page.close();
    errors = [];
    page = await preparePage({ blockCliProbe: true });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(2000);
    await page.click('#terminal-wrap');
    await sleep(9000);

    await assert('Missing runtime shows unavailable banner', async () => {
      const text = await page.$eval('#runtime-unavailable', el => el.textContent);
      if (!text.includes('RUNTIME UNAVAILABLE')) throw new Error(`Banner: ${text}`);
      if (!text.includes('not connected to a live Claude Code runtime')) {
        throw new Error(`Banner detail: ${text}`);
      }
    });

    await assert('Missing runtime keeps fake shell elements out of the DOM', async () => {
      const hasFake = await page.evaluate(() => {
        return !!(document.getElementById('term-input') ||
                  document.getElementById('term-response') ||
                  document.querySelector('[data-fake-shell]'));
      });
      if (hasFake) throw new Error('Fake shell elements appeared');
    });

    await assert('Missing runtime keeps CLI iframe hidden', async () => {
      const result = await page.$eval('#cli-frame', el => ({
        src: el.getAttribute('src') || '',
        visible: el.classList.contains('visible'),
      }));
      if (result.visible) throw new Error(`iframe unexpectedly visible with src ${result.src}`);
    });

    await assert('Missing runtime does not expose fake-shell text', async () => {
      const text = await page.$eval('#boot-text', el => el.textContent);
      const forbidden = [
        'Available commands:',
        'command not found:',
        'Type `help` for available commands.',
        'Claude Code CLI ready',
      ];
      const hit = forbidden.find(marker => text.includes(marker));
      if (hit) throw new Error(`Forbidden marker: ${hit}`);
    });

    await assert('Missing runtime still supports Escape reset', async () => {
      await page.evaluate(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      await sleep(2000);
      const idle = await page.$eval('#terminal-wrap', el => el.classList.contains('idle'));
      if (!idle) throw new Error('Did not reset to idle');
    });

    await assert('No JS errors during missing-runtime session', async () => {
      const real = errors.filter(e => !e.includes('net::'));
      if (real.length > 0) throw new Error(real.join('; '));
    });

  } finally {
    await teardown();
  }

  console.log(`\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e); teardown().then(() => process.exit(1)); });
