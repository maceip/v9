#!/usr/bin/env node
/**
 * Playwright smoke test — loads the live GitHub Pages site,
 * captures every console error, network failure, and missing resource.
 * Then clicks the terminal to trigger boot sequence and captures iframe errors.
 */
import { chromium } from 'playwright';

const TARGET_URL = process.argv[2] || 'https://maceip.github.io/v9/';
const TIMEOUT = 30_000;

const errors = [];
const failedRequests = [];
const consoleMessages = [];
const badResponses = [];

async function run() {
  // Parse proxy from env (corporate egress proxy needs credentials)
  const rawProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
  const launchOpts = {
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
  };
  if (rawProxy) {
    try {
      const proxyParsed = new URL(rawProxy);
      launchOpts.proxy = {
        server: `${proxyParsed.protocol}//${proxyParsed.host}`,
        username: decodeURIComponent(proxyParsed.username),
        password: decodeURIComponent(proxyParsed.password),
      };
    } catch { /* no proxy */ }
  }
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // Capture console messages
  page.on('console', (msg) => {
    const entry = { type: msg.type(), text: msg.text() };
    consoleMessages.push(entry);
    if (msg.type() === 'error') errors.push(entry);
  });

  // Capture page errors (uncaught exceptions)
  page.on('pageerror', (err) => {
    errors.push({ type: 'pageerror', text: err.message });
  });

  // Capture failed network requests
  page.on('requestfailed', (req) => {
    failedRequests.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText || 'unknown',
    });
  });

  // Track all responses for non-2xx
  page.on('response', (resp) => {
    const status = resp.status();
    if (status >= 400) {
      badResponses.push({ url: resp.url(), status });
    }
  });

  // ════════════════════════════════════════════════════
  // PHASE 1: Load landing page
  // ════════════════════════════════════════════════════
  console.log(`\n🔍 PHASE 1: Loading ${TARGET_URL} ...\n`);

  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });
  } catch (err) {
    console.error('⚠ Navigation error:', err.message);
  }

  // Wait for deferred loads (fonts, lazy icons)
  await page.waitForTimeout(3000);

  const phase1Errors = [...errors];
  const phase1Bad = [...badResponses];
  const phase1Failed = [...failedRequests];

  printReport('PHASE 1: LANDING PAGE', phase1Bad, phase1Failed, phase1Errors);

  // ════════════════════════════════════════════════════
  // PHASE 2: Click terminal → trigger zoom + boot + iframe
  // ════════════════════════════════════════════════════
  console.log('\n🔍 PHASE 2: Clicking terminal to trigger boot...\n');

  // Reset counters for phase 2
  const p2ErrorStart = errors.length;
  const p2BadStart = badResponses.length;
  const p2FailStart = failedRequests.length;

  // Check state before click
  const stateBefore = await page.evaluate(() => {
    const el = document.getElementById('terminal-wrap');
    return { classes: el?.className, hasIdle: el?.classList.contains('idle') };
  });
  console.log(`   state before click: ${JSON.stringify(stateBefore)}`);

  // Dispatch a real click event on the terminal (it uses capture:true listener)
  await page.evaluate(() => {
    const el = document.getElementById('terminal-wrap');
    if (el) {
      const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
      el.dispatchEvent(evt);
    }
  });
  console.log('   ✓ Dispatched click event via JS');

  // Wait for zoom animation (rAF-based spring, needs real frames)
  // In headless mode, explicitly pump rAF by waiting with short intervals
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(200);
    const overlayVisible = await page.evaluate(() =>
      document.getElementById('terminal-overlay')?.classList.contains('visible')
    );
    if (overlayVisible) {
      console.log(`   ✓ Boot overlay visible after ${(i + 1) * 200}ms`);
      break;
    }
  }

  // Wait for boot sequence typewriter + CLI iframe load
  // Headless chromium has slower rAF (~4fps), need generous timeouts
  // Boot typewriter ~15s at low fps, then 800ms sleep, then HEAD check + iframe load
  await page.waitForTimeout(30000);

  // Check state after
  const stateAfter = await page.evaluate(() => {
    const el = document.getElementById('terminal-wrap');
    const overlay = document.getElementById('terminal-overlay');
    const frame = document.getElementById('cli-frame');
    return {
      classes: el?.className,
      overlayVisible: overlay?.classList.contains('visible'),
      bootTextContent: document.getElementById('boot-text')?.textContent?.slice(0, 200),
      iframeSrc: frame?.src || '',
      iframeVisible: frame?.classList.contains('visible'),
      runtimeUnavailable: !!document.getElementById('runtime-unavailable'),
    };
  });
  console.log(`   state after boot: ${JSON.stringify(stateAfter, null, 2)}`);

  // Check if iframe loaded
  const iframeVisible = await page.evaluate(() => {
    const frame = document.getElementById('cli-frame');
    return frame ? frame.classList.contains('visible') : false;
  });

  const runtimeUnavailable = await page.evaluate(() => {
    return !!document.getElementById('runtime-unavailable');
  });

  console.log(`   iframe visible: ${iframeVisible}`);
  console.log(`   runtime unavailable panel: ${runtimeUnavailable}`);

  // If iframe loaded, capture errors from inside it
  if (iframeVisible) {
    const iframeErrors = [];
    const frames = page.frames();
    const cliFrame = frames.find(f => f.url().includes('web/index.html'));
    if (cliFrame) {
      console.log(`   iframe URL: ${cliFrame.url()}`);
      // Check for iframe console messages already captured by the page
    }
  }

  const phase2Errors = errors.slice(p2ErrorStart);
  const phase2Bad = badResponses.slice(p2BadStart);
  const phase2Failed = failedRequests.slice(p2FailStart);

  printReport('PHASE 2: BOOT + IFRAME', phase2Bad, phase2Failed, phase2Errors);

  // ════════════════════════════════════════════════════
  // FULL SUMMARY
  // ════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════');
  console.log('  FULL CONSOLE LOG');
  console.log('═══════════════════════════════════════════\n');

  for (const m of consoleMessages) {
    console.log(`   [${m.type}] ${m.text.slice(0, 200)}`);
  }

  await browser.close();

  const totalFails = badResponses.length + failedRequests.length + errors.length;
  console.log(`\n${totalFails === 0 ? '✅ ALL PASS' : `❌ ${totalFails} TOTAL ISSUE(S)`}`);
  process.exit(totalFails > 0 ? 1 : 0);
}

function printReport(label, bad, failed, errs) {
  console.log('═══════════════════════════════════════════');
  console.log(`  ${label}`);
  console.log('═══════════════════════════════════════════\n');

  if (bad.length === 0) {
    console.log('  ✅ No HTTP errors (4xx/5xx)\n');
  } else {
    console.log(`  ❌ ${bad.length} HTTP error(s):\n`);
    for (const r of bad) {
      console.log(`     ${r.status}  ${r.url}`);
    }
    console.log();
  }

  if (failed.length === 0) {
    console.log('  ✅ No failed network requests\n');
  } else {
    console.log(`  ❌ ${failed.length} failed request(s):\n`);
    for (const r of failed) {
      console.log(`     ${r.method} ${r.url}`);
      console.log(`        → ${r.failure}`);
    }
    console.log();
  }

  if (errs.length === 0) {
    console.log('  ✅ No console errors\n');
  } else {
    console.log(`  ❌ ${errs.length} console error(s):\n`);
    for (const e of errs) {
      console.log(`     [${e.type}] ${e.text.slice(0, 200)}`);
    }
    console.log();
  }
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(2);
});
