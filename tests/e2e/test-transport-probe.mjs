#!/usr/bin/env node
/**
 * Transport probe test — verifies that network detection at boot:
 *  1. Runs exactly once (no duplicate probes)
 *  2. Prints informational messages (no "FAILED" / console.warn / console.error
 *     for the normal "v9-net not running" case)
 *  3. Announces all four tiers (v9-net / wisp / fetch-proxy / direct)
 *  4. Does not block the page or throw
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
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
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
        res.end(`Not found: ${url.pathname}`);
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
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
  console.log(`[probe-test] Dev server on ${baseUrl}`);

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
      delete launchOpts.executablePath;
      browser = await chromium.launch(launchOpts);
    }
  } catch (err) {
    console.error(`[probe-test] Cannot launch browser: ${err.message}`);
    server.close();
    process.exit(1);
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect all console messages so we can inspect them later
  const consoleMessages = [];
  page.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  let passed = 0;
  let failed = 0;
  function assert(condition, name) {
    if (condition) { console.log(`  PASS: ${name}`); passed++; }
    else { console.log(`  FAIL: ${name}`); failed++; }
  }

  try {
    console.log('\n=== Transport Probe Tests ===\n');

    // Load web/index.html directly (the iframe target). This is where
    // node-polyfills.js runs and the transport probe executes.
    await page.goto(`${baseUrl}/docs/web/index.html?autorun=0`, {
      timeout: TIMEOUT,
      waitUntil: 'domcontentloaded',
    });

    // Wait for the probes to run (they have 3s timeout each, so allow 4s)
    await page.waitForTimeout(4500);

    // Extract v9-net-related messages
    const v9netMsgs = consoleMessages.filter(m => m.text.includes('[v9-net]'));

    // ═══════════════════════════════════════════════════════════════
    // Test 1: Probe announces all four tiers
    // ═══════════════════════════════════════════════════════════════
    const tier1Header = v9netMsgs.find(m => /tier-1 v9-net\s+=/.test(m.text));
    const tier2Header = v9netMsgs.find(m => /tier-2 wisp\s+=/.test(m.text));
    const tier3Header = v9netMsgs.find(m => /tier-3 proxy\s+=/.test(m.text));
    const tier4Header = v9netMsgs.find(m => m.text.includes('tier-4 direct'));
    assert(!!tier1Header, 'Tier 1 (v9-net) announced at boot');
    assert(!!tier2Header, 'Tier 2 (wisp) announced at boot');
    assert(!!tier3Header, 'Tier 3 (fetch proxy) announced at boot');
    assert(!!tier4Header, 'Tier 4 (direct fetch) announced at boot');

    // ═══════════════════════════════════════════════════════════════
    // Test 2: Probe results logged as info (log), not warn or error
    // ═══════════════════════════════════════════════════════════════
    const tier1Result = v9netMsgs.find(m => m.text.match(/tier-1 v9-net (not )?reachable/));
    const tier2Result = v9netMsgs.find(m => m.text.match(/tier-2 wisp (not )?reachable/));
    const tier3Result = v9netMsgs.find(m => m.text.match(/tier-3 fetch proxy (not )?reachable/));
    assert(!!tier1Result, 'Tier 1 probe result logged');
    assert(!!tier2Result, 'Tier 2 probe result logged');
    assert(!!tier3Result, 'Tier 3 probe result logged');

    if (tier1Result) assert(tier1Result.type === 'log',
      `Tier 1 result is console.log (got ${tier1Result.type})`);
    if (tier2Result) assert(tier2Result.type === 'log',
      `Tier 2 result is console.log (got ${tier2Result.type})`);
    if (tier3Result) assert(tier3Result.type === 'log',
      `Tier 3 result is console.log (got ${tier3Result.type})`);

    // ═══════════════════════════════════════════════════════════════
    // Test 3: No "FAILED" messages from the probe
    // ═══════════════════════════════════════════════════════════════
    const failMessages = v9netMsgs.filter(m => m.text.includes('FAILED'));
    assert(failMessages.length === 0,
      `No probe messages contain "FAILED" (got ${failMessages.length})`);

    // ═══════════════════════════════════════════════════════════════
    // Test 4: No console.warn from the transport probe
    // ═══════════════════════════════════════════════════════════════
    const warnMessages = v9netMsgs.filter(m => m.type === 'warning');
    assert(warnMessages.length === 0,
      `No v9-net probe messages use console.warn (got ${warnMessages.length})`);

    // ═══════════════════════════════════════════════════════════════
    // Test 5: No duplicate probes — each tier header should appear exactly once
    // ═══════════════════════════════════════════════════════════════
    const tier1HeaderCount = v9netMsgs.filter(m => /tier-1 v9-net\s+=/.test(m.text)).length;
    const tier2HeaderCount = v9netMsgs.filter(m => /tier-2 wisp\s+=/.test(m.text)).length;
    assert(tier1HeaderCount === 1, `Tier 1 header appears exactly once (got ${tier1HeaderCount})`);
    assert(tier2HeaderCount === 1, `Tier 2 header appears exactly once (got ${tier2HeaderCount})`);

    // ═══════════════════════════════════════════════════════════════
    // Test 6: Page didn't throw any errors from probe code
    // ═══════════════════════════════════════════════════════════════
    const probeErrors = pageErrors.filter(e => e.includes('v9-net') || e.includes('transport'));
    assert(probeErrors.length === 0,
      `No page errors from probe code (got ${probeErrors.length})`);

    // ═══════════════════════════════════════════════════════════════
    // Test 7: Env var NODEJS_GVISOR_WS_URL is set for import-time consumers
    // ═══════════════════════════════════════════════════════════════
    const gvisorUrl = await page.evaluate(() => globalThis.__V9_GVISOR_WS_URL__);
    assert(typeof gvisorUrl === 'string' && gvisorUrl.startsWith('ws'),
      `__V9_GVISOR_WS_URL__ set to "${gvisorUrl}"`);

    // ═══════════════════════════════════════════════════════════════
    // Test 8: Page loads successfully (no catastrophic failure)
    // ═══════════════════════════════════════════════════════════════
    const pageReady = await page.evaluate(() => ({
      hasProcess: typeof globalThis.process !== 'undefined',
      hasBuffer: typeof globalThis.Buffer !== 'undefined',
    }));
    assert(pageReady.hasProcess, 'process polyfill loaded');
    assert(pageReady.hasBuffer, 'Buffer polyfill loaded');

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

    if (failed > 0) {
      console.log('\nAll [v9-net] messages captured:');
      for (const m of v9netMsgs) {
        console.log(`  [${m.type}] ${m.text}`);
      }
    }
  } catch (err) {
    console.error(`[probe-test] Test error: ${err.message}`);
    failed++;
  } finally {
    if (HEADED) {
      console.log('[probe-test] Browser stays open. Ctrl+C to exit.');
      await new Promise(() => {});
    }
    await browser.close();
    server.close();
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('[probe-test] Fatal:', err);
  process.exit(1);
});
