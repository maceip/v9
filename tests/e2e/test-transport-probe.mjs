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

  async function runProbeScenario(label, urlSuffix, expectations) {
    console.log(`\n── Scenario: ${label} ──`);
    consoleMessages.length = 0;
    pageErrors.length = 0;

    await page.goto(`${baseUrl}/docs/web/index.html?autorun=0${urlSuffix}`, {
      timeout: TIMEOUT,
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(4500);

    const v9netMsgs = consoleMessages.filter(m => m.text.includes('[v9-net]'));

    // All four tiers announced at boot (headers)
    const tier1Header = v9netMsgs.find(m => /tier-1 v9-net\s+=/.test(m.text));
    const tier2Header = v9netMsgs.find(m => /tier-2 wisp\s+=/.test(m.text));
    const tier3Header = v9netMsgs.find(m => /tier-3 proxy\s+=/.test(m.text));
    const tier4Header = v9netMsgs.find(m => m.text.includes('tier-4 direct'));
    assert(!!tier1Header, `[${label}] tier-1 header printed`);
    assert(!!tier2Header, `[${label}] tier-2 header printed`);
    assert(!!tier3Header, `[${label}] tier-3 header printed`);
    assert(!!tier4Header, `[${label}] tier-4 header printed`);

    // Tier-2 and tier-3 content expectations (configured vs not-configured)
    if (expectations.tier2Configured) {
      assert(!tier2Header.text.includes('(not configured)'),
        `[${label}] tier-2 shows a URL, not "(not configured)"`);
      const tier2Result = v9netMsgs.find(m => /tier-2 wisp (not )?reachable/.test(m.text));
      assert(!!tier2Result, `[${label}] tier-2 probe result logged`);
    } else {
      assert(tier2Header.text.includes('(not configured)'),
        `[${label}] tier-2 shows "(not configured)"`);
      const tier2NotConfig = v9netMsgs.find(m => /tier-2 wisp not configured/.test(m.text));
      assert(!!tier2NotConfig, `[${label}] tier-2 "not configured" message printed`);
    }

    if (expectations.tier3Configured) {
      assert(!tier3Header.text.includes('(not configured)'),
        `[${label}] tier-3 shows a URL, not "(not configured)"`);
    } else {
      assert(tier3Header.text.includes('(not configured)'),
        `[${label}] tier-3 shows "(not configured)"`);
    }

    // No error-style messages regardless of scenario
    const failMessages = v9netMsgs.filter(m => m.text.includes('FAILED'));
    assert(failMessages.length === 0,
      `[${label}] no "FAILED" messages (got ${failMessages.length})`);

    const warnMessages = v9netMsgs.filter(m => m.type === 'warning');
    assert(warnMessages.length === 0,
      `[${label}] no console.warn from probe (got ${warnMessages.length})`);

    const probeErrors = pageErrors.filter(e => e.includes('v9-net') || e.includes('transport'));
    assert(probeErrors.length === 0,
      `[${label}] no page errors from probe`);

    // Single-probe guarantee
    const tier1Count = v9netMsgs.filter(m => /tier-1 v9-net\s+=/.test(m.text)).length;
    assert(tier1Count === 1, `[${label}] tier-1 header appears exactly once (got ${tier1Count})`);

    // Tier-1 always set
    const gvisorUrl = await page.evaluate(() => globalThis.__V9_GVISOR_WS_URL__);
    assert(typeof gvisorUrl === 'string' && gvisorUrl.startsWith('ws'),
      `[${label}] __V9_GVISOR_WS_URL__ set to "${gvisorUrl}"`);
  }

  try {
    console.log('\n=== Transport Probe Tests ===');

    // ─── Scenario 1: Clean slate (self-hoster default) ───────────────
    // 127.0.0.1 doesn't match .github.io and no query param, so no hosted
    // defaults activate. Tier 2/3 should show "(not configured)".
    await runProbeScenario('clean slate (self-hoster)', '', {
      tier2Configured: false,
      tier3Configured: false,
    });

    // ─── Scenario 2: Opt-in via ?enableStareTransport=1 ──────────────
    // This query param makes transport-defaults-stare.js activate even
    // off github.io, so tier 2/3 URLs get configured.
    await runProbeScenario('opt-in via query param', '&enableStareTransport=1', {
      tier2Configured: true,
      tier3Configured: true,
    });

    // ─── Scenario 3: Opt-in via ?wisp= query param directly ──────────
    await runProbeScenario('explicit wisp URL via ?wisp=',
      '&wisp=' + encodeURIComponent('wss://example.test/wisp/'),
      { tier2Configured: true, tier3Configured: false },
    );

    // ─── Scenario 4: process polyfill loaded ─────────────────────────
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
