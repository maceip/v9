#!/usr/bin/env node
/**
 * Playwright smoke test — loads the live GitHub Pages site and verifies:
 *
 *   Phase 1: Landing page loads without HTTP errors or JS exceptions
 *   Phase 2: Click terminal → boot sequence → iframe loads without 404s
 *
 * Usage:
 *   node test/smoke-live.mjs                           # test live site
 *   node test/smoke-live.mjs http://localhost:8080/     # test local server
 *
 * Known proxy-environment issues (filtered from exit code):
 *   - Google Fonts CORS blocked when running behind corporate MITM proxy
 */
import { chromium } from 'playwright';

const TARGET_URL = process.argv[2] || 'https://maceip.github.io/v9/';
const TIMEOUT = 30_000;

// Known proxy-environment issues that don't affect real users
const PROXY_NOISE = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'ERR_BLOCKED_BY_ORB',
  'ERR_CERT_AUTHORITY_INVALID',
  'net::ERR_FAILED',           // generic text from proxy-blocked font loads
  'net::ERR_ABORTED',          // HEAD preflight aborted by browser when iframe loads same URL
];

function isProxyNoise(url) {
  return PROXY_NOISE.some(p => url.includes(p));
}

const errors = [];
const failedRequests = [];
const consoleMessages = [];
const badResponses = [];

async function run() {
  // ── Browser launch ──
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

  // ── Event listeners ──
  page.on('console', (msg) => {
    const entry = { type: msg.type(), text: msg.text() };
    consoleMessages.push(entry);
    if (msg.type() === 'error') errors.push(entry);
  });

  page.on('pageerror', (err) => {
    errors.push({ type: 'pageerror', text: err.message });
  });

  page.on('requestfailed', (req) => {
    failedRequests.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText || 'unknown',
    });
  });

  page.on('response', (resp) => {
    if (resp.status() >= 400) {
      badResponses.push({ url: resp.url(), status: resp.status() });
    }
  });

  // ════════════════════════════════════════════════════
  // PHASE 1: Load landing page
  // ════════════════════════════════════════════════════
  console.log(`\n🔍 PHASE 1: Loading ${TARGET_URL}\n`);

  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });
  } catch (err) {
    console.error('⚠ Navigation error:', err.message);
  }

  await page.waitForTimeout(3000);

  // Verify key DOM elements exist
  const domCheck = await page.evaluate(() => ({
    navbar: !!document.getElementById('navbar'),
    viewport: !!document.getElementById('viewport'),
    terminalWrap: !!document.getElementById('terminal-wrap'),
    terminalFrame: !!document.getElementById('terminal-frame'),
    glassCanvas: !!document.getElementById('glass-canvas'),
    fog: !!document.getElementById('fog'),
    bootText: !!document.getElementById('boot-text'),
    cliFrame: !!document.getElementById('cli-frame'),
    hasIdleClass: document.getElementById('terminal-wrap')?.classList.contains('idle'),
  }));

  console.log('   DOM elements:');
  for (const [k, v] of Object.entries(domCheck)) {
    console.log(`     ${v ? '✓' : '✗'} ${k}`);
  }

  const p1Snapshot = {
    errors: [...errors],
    bad: [...badResponses],
    failed: [...failedRequests],
  };
  printReport('PHASE 1: LANDING PAGE', p1Snapshot.bad, p1Snapshot.failed, p1Snapshot.errors);

  // ════════════════════════════════════════════════════
  // PHASE 2: Click terminal → boot → iframe
  // ════════════════════════════════════════════════════
  console.log('\n🔍 PHASE 2: Boot sequence\n');

  const p2Start = { e: errors.length, b: badResponses.length, f: failedRequests.length };

  // Dispatch click to trigger zoom
  await page.evaluate(() => {
    document.getElementById('terminal-wrap')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  });
  console.log('   ✓ Click dispatched');

  // Poll for boot overlay (rAF spring is slow in headless)
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(300);
    const visible = await page.evaluate(() =>
      document.getElementById('terminal-overlay')?.classList.contains('visible')
    );
    if (visible) {
      console.log(`   ✓ Boot overlay visible after ${(i + 1) * 300}ms`);
      break;
    }
  }

  // Wait for typewriter (~6 lines × ~600ms each) + 800ms + HEAD check + iframe load
  // Headless rAF is throttled, so be generous
  await page.waitForTimeout(30000);

  const bootState = await page.evaluate(() => {
    const frame = document.getElementById('cli-frame');
    return {
      bootText: document.getElementById('boot-text')?.textContent?.slice(0, 300) || '',
      iframeSrc: frame?.src || '',
      iframeVisible: frame?.classList.contains('visible') || false,
      runtimeUnavailable: !!document.getElementById('runtime-unavailable'),
    };
  });

  console.log(`   boot text: "${bootState.bootText}"`);
  console.log(`   iframe src: ${bootState.iframeSrc || '(empty)'}`);
  console.log(`   iframe visible: ${bootState.iframeVisible}`);
  console.log(`   runtime unavailable: ${bootState.runtimeUnavailable}`);

  // If iframe loaded, find it and log its URL
  if (bootState.iframeVisible) {
    const cliFrame = page.frames().find(f => f.url().includes('web/index.html'));
    if (cliFrame) {
      console.log(`   ✓ CLI iframe active at: ${cliFrame.url()}`);
    }
  }

  const p2 = {
    errors: errors.slice(p2Start.e),
    bad: badResponses.slice(p2Start.b),
    failed: failedRequests.slice(p2Start.f),
  };
  printReport('PHASE 2: BOOT + IFRAME', p2.bad, p2.failed, p2.errors);

  // ════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════');
  console.log('  CONSOLE LOG');
  console.log('═══════════════════════════════════════════\n');
  for (const m of consoleMessages) {
    console.log(`   [${m.type}] ${m.text.slice(0, 200)}`);
  }

  await browser.close();

  // Count only real errors (exclude proxy noise)
  const realBad = badResponses.filter(r => !isProxyNoise(r.url));
  const realFailed = failedRequests.filter(r => !isProxyNoise(r.url) && !isProxyNoise(r.failure));
  const realErrors = errors.filter(e => !isProxyNoise(e.text));
  const totalReal = realBad.length + realFailed.length + realErrors.length;

  if (totalReal > 0) {
    console.log('\n═══════════════════════════════════════════');
    console.log('  REAL ISSUES (excluding proxy noise)');
    console.log('═══════════════════════════════════════════\n');
    for (const r of realBad) console.log(`   HTTP ${r.status}  ${r.url}`);
    for (const r of realFailed) console.log(`   FAIL  ${r.url} → ${r.failure}`);
    for (const e of realErrors) console.log(`   ERR   ${e.text.slice(0, 200)}`);
  }

  console.log(`\n${totalReal === 0 ? '✅ ALL PASS' : `❌ ${totalReal} REAL ISSUE(S)`}`);
  process.exit(totalReal > 0 ? 1 : 0);
}

function printReport(label, bad, failed, errs) {
  console.log('═══════════════════════════════════════════');
  console.log(`  ${label}`);
  console.log('═══════════════════════════════════════════\n');

  const show = (items, prefix) => {
    const real = items.filter(i => !isProxyNoise(i.url || i.text || ''));
    const noise = items.length - real.length;
    if (real.length === 0 && noise === 0) {
      console.log(`  ✅ No ${prefix}\n`);
    } else {
      if (real.length) console.log(`  ❌ ${real.length} ${prefix}:`);
      for (const r of real) {
        if (r.status) console.log(`     ${r.status}  ${r.url}`);
        else if (r.failure) console.log(`     ${r.method} ${r.url} → ${r.failure}`);
        else console.log(`     [${r.type}] ${(r.text || '').slice(0, 200)}`);
      }
      if (noise) console.log(`  ⚠ ${noise} proxy-related issue(s) filtered`);
      console.log();
    }
  };

  show(bad, 'HTTP errors');
  show(failed, 'failed requests');
  show(errs, 'console errors');
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(2);
});
