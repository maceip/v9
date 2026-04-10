/**
 * E2E test: GitHub Pages → click tile → Claude loads → OAuth port opens
 *
 * Tests the full user flow:
 *   1. v9-net running locally (dynamic port forwarding)
 *   2. Open the v9 landing page
 *   3. Click the terminal tile to zoom in
 *   4. Wait for Claude Code to load in the iframe
 *   5. Press Enter twice (color scheme + start)
 *   6. Wait for OAuth server to start → verify dynamic port opened
 *   7. Verify localhost:<port> is reachable (loopback works)
 *
 * Run:
 *   v9-net &
 *   node scripts/dev-server.mjs &
 *   node tests/test-pages-oauth-flow.mjs
 */

import { chromium } from 'playwright';
import * as http from 'http';

const PAGE_URL = process.env.V9_PAGE_URL || 'http://localhost:8080/';
const TIMEOUT = 60_000;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-web-security'],
  });
  const context = await browser.newContext({
    // Allow popups for OAuth
    bypassCSP: true,
  });
  const page = await context.newPage();
  let pass = 0, fail = 0;

  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));

  // Track popups
  let popup = null;
  context.on('page', p => { popup = p; logs.push('[popup] new page opened: ' + p.url()); });

  try {
    // ── Step 1: Load landing page ────────────────────────────────
    console.log('1. Loading landing page...');
    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('   Page loaded: ' + await page.title());

    // ── Step 2: Click the terminal tile to zoom in ───────────────
    console.log('2. Clicking terminal tile...');
    // The terminal wrapper is the clickable area
    const termWrap = await page.$('#term-wrap') || await page.$('.term-wrap') || await page.$('[class*="term"]');
    if (termWrap) {
      await termWrap.click();
      console.log('   Clicked terminal tile');
    } else {
      // Fallback: click center of page
      const vp = page.viewportSize();
      await page.mouse.click(vp.width / 2, vp.height / 2);
      console.log('   Clicked center of page (no #term-wrap found)');
    }

    // ── Step 3: Wait for iframe to load ──────────────────────────
    console.log('3. Waiting for CLI iframe...');
    await page.waitForTimeout(5000); // give iframe time to load

    const iframe = page.frame({ url: /index\.html/ }) || page.frames()[1];
    if (iframe) {
      console.log('   ✓ CLI iframe loaded');
      pass++;
    } else {
      console.log('   ✗ CLI iframe not found');
      console.log('   Frames:', page.frames().map(f => f.url()));
      fail++;
    }

    // ── Step 4: Press Enter twice (color scheme + start) ─────────
    if (iframe) {
      console.log('4. Pressing Enter twice...');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
      console.log('   Sent Enter x2');
    }

    // ── Step 5: Wait for v9-net to show port forwarding ──────────
    console.log('5. Waiting for OAuth server / dynamic port...');
    // Check v9-net stdout for "+ forwarding port" messages
    // We can't read v9-net's stderr directly, but we can check if
    // any port in the OAuth range (19836-19850) is now listening
    await page.waitForTimeout(10000); // give Claude time to start OAuth

    let oauthPort = 0;
    for (let p = 19836; p <= 19850; p++) {
      try {
        await httpGet(`http://localhost:${p}/`);
        oauthPort = p;
        break;
      } catch {
        // port not open, try next
      }
    }

    if (oauthPort) {
      console.log(`   ✓ OAuth port ${oauthPort} is reachable on localhost`);
      pass++;
    } else {
      console.log('   ✗ No OAuth port found in range 19836-19850');
      // Check broader range
      console.log('   Checking if any dynamic ports opened...');
      fail++;
    }

    // ── Step 6: Check if popup opened ────────────────────────────
    if (popup) {
      console.log(`   ✓ Popup opened: ${popup.url()}`);
      pass++;
    } else {
      console.log('   ~ No popup detected (may need real OAuth credentials)');
      // Not a hard failure — popup needs real Anthropic auth
    }

    // ── Step 7: Verify v9-net detected ───────────────────────────
    console.log('6. Checking v9-net detection in page...');
    const v9netDetected = logs.some(l => l.includes('[v9-net] detected'));
    if (v9netDetected) {
      console.log('   ✓ v9-net auto-detected by page');
      pass++;
    } else {
      console.log('   ✗ v9-net NOT detected (check node-polyfills.js probe)');
      fail++;
    }

  } catch (err) {
    console.error('Test error:', err.message);
    fail++;
  } finally {
    console.log(`\n══ Pages OAuth Flow: ${pass} passed, ${fail} failed ══`);
    console.log('\nPage console (last 20):');
    for (const l of logs.slice(-20)) console.log('  ', l);
    await browser.close();
    process.exit(fail > 0 ? 1 : 0);
  }
}

main();
