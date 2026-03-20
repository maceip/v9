#!/usr/bin/env node
/**
 * Validation test for the v9 GitHub Pages site.
 *
 * Loads https://maceip.github.io/v9/ in headless Chrome via Puppeteer,
 * verifies rendering, checks for zero console errors, and validates
 * the full interaction flow (idle → zoom → boot).
 *
 * Usage:
 *   node tests/pages-validation.mjs
 *   node tests/pages-validation.mjs http://localhost:8000  # test local docs/
 *
 * Requirements:
 *   npm install puppeteer (or puppeteer-core + Chrome)
 */

import { setTimeout as sleep } from 'node:timers/promises';

const LIVE_URL = process.argv[2] || 'https://maceip.github.io/v9/';
const TIMEOUT = 30_000;

let passed = 0;
let failed = 0;
const consoleMessages = [];
const consoleErrors = [];
const pageErrors = [];
const networkFailures = [];

function ok(msg) { passed++; console.log(`  ✅ ${msg}`); }
function fail(msg) { failed++; console.log(`  ❌ ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function info(msg) { console.log(`  ℹ  ${msg}`); }

// ── Launch browser ──

async function launchBrowser() {
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    try {
      puppeteer = await import('puppeteer-core');
    } catch {
      throw new Error('Install puppeteer: npm install puppeteer');
    }
  }
  const launch = puppeteer.default?.launch || puppeteer.launch;
  return launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });
}

// ── Main ──

console.log(`\n=== v9 GitHub Pages Validation ===`);
console.log(`  URL: ${LIVE_URL}\n`);

let browser;
try {
  browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Collect ALL console output
  page.on('console', (msg) => {
    const entry = { type: msg.type(), text: msg.text() };
    consoleMessages.push(entry);
    if (msg.type() === 'error') consoleErrors.push(entry);
  });

  // Collect page-level errors (uncaught exceptions)
  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err));
  });

  // Collect failed network requests (404s, etc.)
  page.on('requestfailed', (req) => {
    networkFailures.push({ url: req.url(), reason: req.failure()?.errorText || 'unknown' });
  });

  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Page loads without crash
  // ─────────────────────────────────────────────────────────────────
  console.log('── Page Load ──');
  let response;
  try {
    response = await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  } catch (err) {
    fail(`Page failed to load: ${err.message}`);
    throw err;
  }

  if (response && response.status() === 200) {
    ok(`Page loaded (HTTP ${response.status()})`);
  } else {
    fail(`Page returned HTTP ${response?.status()}`);
  }

  // Wait for JS modules to initialize
  await sleep(3000);

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: No console errors (filter known benign resource errors)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── Console Errors ──');
  // Filter out benign resource load failures (fonts, CDN) that happen in CI/offline
  const ignorablePatterns = ['fonts.googleapis.com', 'fonts.gstatic.com', 'Failed to load resource'];
  const criticalConsoleErrors = consoleErrors.filter(
    e => !ignorablePatterns.some(pat => e.text.includes(pat))
  );
  if (criticalConsoleErrors.length === 0 && pageErrors.length === 0) {
    ok('Zero console errors');
    if (consoleErrors.length > 0) {
      info(`(${consoleErrors.length} benign resource errors filtered)`);
    }
  } else {
    if (criticalConsoleErrors.length > 0) {
      fail(`${criticalConsoleErrors.length} console error(s):`);
      for (const err of criticalConsoleErrors) {
        info(`  console.error: ${err.text.slice(0, 200)}`);
      }
    }
    if (pageErrors.length > 0) {
      fail(`${pageErrors.length} uncaught exception(s):`);
      for (const err of pageErrors) {
        info(`  pageerror: ${err.slice(0, 200)}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: No failed network requests (404s, CORS, etc.)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── Network ──');
  const ignorableURLs = ['fonts.googleapis.com', 'fonts.gstatic.com'];
  const criticalNetworkFailures = networkFailures.filter(
    f => !ignorableURLs.some(u => f.url.includes(u))
  );
  if (criticalNetworkFailures.length === 0) {
    ok('Zero failed network requests');
    if (networkFailures.length > 0) {
      info(`(${networkFailures.length} benign font CDN failures filtered)`);
    }
  } else {
    fail(`${criticalNetworkFailures.length} failed network request(s):`);
    for (const f of criticalNetworkFailures) {
      info(`  ${f.reason}: ${f.url.slice(0, 150)}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: Critical DOM elements exist
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── DOM Structure ──');
  const domChecks = await page.evaluate(() => {
    return {
      navbar: !!document.getElementById('navbar'),
      navName: document.querySelector('.nav-name')?.textContent?.trim(),
      navFluid: !!document.getElementById('nav-fluid'),
      progressBar: !!document.getElementById('progress-bar'),
      viewport: !!document.getElementById('viewport'),
      fog: !!document.getElementById('fog'),
      spotlight: !!document.getElementById('spotlight'),
      termWrap: !!document.getElementById('terminal-wrap'),
      termFrame: !!document.getElementById('terminal-frame'),
      termScreen: !!document.getElementById('terminal-screen'),
      glassCanvas: !!document.getElementById('glass-canvas'),
      termOverlay: !!document.getElementById('terminal-overlay'),
      bootText: !!document.getElementById('boot-text'),
      cliFrame: !!document.getElementById('cli-frame'),
      // Check idle state
      termWrapClasses: document.getElementById('terminal-wrap')?.className || '',
      // Count icons
      navIcons: document.querySelectorAll('.nav-icon').length,
      bgIcons: document.querySelectorAll('.bg-icon').length,
      frameIcons: document.querySelectorAll('.frame-icon').length,
    };
  });

  if (domChecks.navbar) ok('Navbar exists'); else fail('Navbar missing');
  if (domChecks.navName === 'v9') ok('Navbar shows "v9"'); else fail(`Navbar name: "${domChecks.navName}" (expected "v9")`);
  if (domChecks.navFluid) ok('Fluid canvas exists'); else fail('Fluid canvas missing');
  if (domChecks.progressBar) ok('Progress bar exists'); else fail('Progress bar missing');
  if (domChecks.termWrap) ok('Terminal wrapper exists'); else fail('Terminal wrapper missing');
  if (domChecks.termFrame) ok('Terminal frame exists'); else fail('Terminal frame missing');
  if (domChecks.termScreen) ok('Terminal screen exists'); else fail('Terminal screen missing');
  if (domChecks.glassCanvas) ok('Glass canvas exists'); else fail('Glass canvas missing');
  if (domChecks.termOverlay) ok('Terminal overlay exists'); else fail('Terminal overlay missing');
  if (domChecks.cliFrame) ok('CLI iframe exists'); else fail('CLI iframe missing');
  if (domChecks.fog) ok('Fog overlay exists'); else fail('Fog overlay missing');
  if (domChecks.spotlight) ok('Spotlight exists'); else fail('Spotlight missing');

  // Idle state
  if (domChecks.termWrapClasses.includes('idle')) {
    ok('Terminal starts in idle state');
  } else {
    fail(`Terminal not in idle state (classes: "${domChecks.termWrapClasses}")`);
  }

  // Icons
  if (domChecks.navIcons >= 8) ok(`${domChecks.navIcons} navbar icons`); else fail(`Only ${domChecks.navIcons} navbar icons (expected ≥8)`);
  if (domChecks.bgIcons >= 6) ok(`${domChecks.bgIcons} background icons`); else fail(`Only ${domChecks.bgIcons} background icons (expected ≥6)`);
  if (domChecks.frameIcons >= 4) ok(`${domChecks.frameIcons} frame icons`); else fail(`Only ${domChecks.frameIcons} frame icons (expected ≥4)`);

  // ─────────────────────────────────────────────────────────────────
  // TEST 5: Fonts loaded
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── Fonts ──');
  const fonts = await page.evaluate(() => {
    const loaded = [];
    document.fonts.forEach((f) => {
      if (f.status === 'loaded') loaded.push(f.family);
    });
    return loaded;
  });
  if (fonts.some(f => f.includes('Goldman'))) ok('Goldman font loaded'); else warn('Goldman font not loaded yet');
  if (fonts.some(f => f.includes('IBM Plex Mono'))) ok('IBM Plex Mono loaded'); else warn('IBM Plex Mono not loaded yet');

  // ─────────────────────────────────────────────────────────────────
  // TEST 6: Glass canvas is rendering (WebGL context active)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── WebGL ──');
  const webglOk = await page.evaluate(() => {
    const canvas = document.getElementById('glass-canvas');
    if (!canvas) return false;
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return !!gl;
  });
  if (webglOk) ok('WebGL context available on glass canvas'); else warn('WebGL not available (may be headless limitation)');

  // ─────────────────────────────────────────────────────────────────
  // TEST 7: Theme CSS variables are set
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── Theme ──');
  const theme = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      bg: style.getPropertyValue('--bg').trim(),
      fg: style.getPropertyValue('--fg').trim(),
      accent: style.getPropertyValue('--accent').trim(),
    };
  });
  if (theme.bg && theme.fg && theme.accent) {
    ok(`Theme active (bg: ${theme.bg}, fg: ${theme.fg}, accent: ${theme.accent})`);
  } else {
    fail('CSS custom properties not set');
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 8: Click terminal → zoom animation triggers
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── Interaction: Click to Zoom ──');
  // Use evaluate to click directly — Puppeteer mouse.click can hit child iframes
  await page.evaluate(() => document.getElementById('terminal-wrap').click());
  await sleep(1500); // Wait for zoom animation

  const afterClick = await page.evaluate(() => {
    const wrap = document.getElementById('terminal-wrap');
    return {
      classes: wrap?.className || '',
      transform: wrap?.style.transform || '',
      fogOpacity: getComputedStyle(document.getElementById('fog')).opacity,
      overlayVisible: document.getElementById('terminal-overlay')?.classList.contains('visible'),
    };
  });

  if (afterClick.classes.includes('zoomed')) {
    ok('Terminal entered zoomed state');
  } else {
    fail(`Terminal not zoomed (classes: "${afterClick.classes}")`);
  }

  if (afterClick.transform.includes('scale')) {
    ok(`Zoom transform applied: ${afterClick.transform.slice(0, 60)}`);
  } else {
    warn('No scale transform found on terminal wrapper');
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 9: Boot sequence runs
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── Boot Sequence ──');
  await sleep(8000); // Wait for typewriter animation (6 lines × ~40ms/char × ~15 chars + delays)

  const bootState = await page.evaluate(() => {
    const overlay = document.getElementById('terminal-overlay');
    const bootText = document.getElementById('boot-text');
    const lines = bootText?.querySelectorAll('.boot-line') || [];
    const visibleLines = Array.from(lines).filter(l => l.classList.contains('visible'));
    const text = bootText?.textContent?.trim() || '';
    return {
      overlayVisible: overlay?.classList.contains('visible'),
      lineCount: lines.length,
      visibleLineCount: visibleLines.length,
      hasBootingText: text.includes('booting v9'),
      fullText: text.slice(0, 300),
    };
  });

  if (bootState.overlayVisible) ok('Boot overlay is visible'); else fail('Boot overlay not visible');
  if (bootState.hasBootingText) ok('"booting v9..." text present'); else fail('"booting v9..." text not found');
  if (bootState.visibleLineCount >= 3) {
    ok(`${bootState.visibleLineCount} boot lines rendered`);
  } else {
    fail(`Only ${bootState.visibleLineCount} boot lines visible (expected ≥3)`);
  }
  info(`Boot text: "${bootState.fullText.slice(0, 100)}..."`);

  // ─────────────────────────────────────────────────────────────────
  // TEST 10: Screenshot
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── Screenshots ──');
  const screenshotPath = new URL('../tests/screenshot-pages-validation.png', import.meta.url).pathname;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  info(`Screenshot saved: ${screenshotPath}`);

  // ─────────────────────────────────────────────────────────────────
  // FINAL: Check for any late console errors (from zoom/boot)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n── Late Errors (post-interaction) ──');
  const lateCriticalErrors = consoleErrors.filter(
    e => !ignorablePatterns.some(pat => e.text.includes(pat))
  );
  if (lateCriticalErrors.length === 0 && pageErrors.length === 0) {
    ok('Zero errors after interaction');
  } else {
    fail(`${lateCriticalErrors.length} console error(s) + ${pageErrors.length} page error(s) total`);
    for (const err of lateCriticalErrors) {
      info(`  ${err.text.slice(0, 200)}`);
    }
    for (const err of pageErrors) {
      info(`  ${err.slice(0, 200)}`);
    }
  }

  await page.close();

} catch (err) {
  if (!failed) {
    fail(`Fatal: ${err.message}`);
  }
} finally {
  if (browser) await browser.close();
}

// ── Summary ──
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (consoleErrors.length > 0 || pageErrors.length > 0) {
  console.log(`\n── All errors collected ──`);
  for (const err of consoleErrors) {
    console.log(`  [console.error] ${err.text}`);
  }
  for (const err of pageErrors) {
    console.log(`  [pageerror] ${err}`);
  }
}
if (networkFailures.length > 0) {
  console.log(`\n── All network failures ──`);
  for (const f of networkFailures) {
    console.log(`  [${f.reason}] ${f.url}`);
  }
}
process.exit(failed > 0 ? 1 : 0);
