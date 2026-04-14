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
    // Transport config logging is deferred via requestIdleCallback; it
    // lands almost immediately but give it a small cushion.
    await page.waitForTimeout(800);

    const v9netMsgs = consoleMessages.filter(m => m.text.includes('[v9-net]'));

    // Config log format (current): "[v9-net] tier-N <name>   <value>"
    //   tier-1 v9-net  ws://localhost:8765
    //   tier-2 wisp    <url>  | "(disabled)" | (line absent if no URL)
    //   tier-3 proxy   <url>  | (line absent if no URL)
    //   tier-4 fetch   (browser native, CORS-restricted)
    //
    // No probing happens. Tier selection is lazy (at first use).
    const tier1Line = v9netMsgs.find(m => /tier-1 v9-net\s/.test(m.text));
    const tier2Line = v9netMsgs.find(m => /tier-2 wisp\s/.test(m.text));
    const tier3Line = v9netMsgs.find(m => /tier-3 proxy\s/.test(m.text));
    const tier4Line = v9netMsgs.find(m => /tier-4 fetch\s/.test(m.text));

    assert(!!tier1Line, `[${label}] tier-1 line printed`);
    assert(!!tier4Line, `[${label}] tier-4 line printed`);

    if (expectations.tier2Configured) {
      assert(!!tier2Line && /wss?:\/\//.test(tier2Line.text),
        `[${label}] tier-2 shows a URL`);
    } else {
      // When no URL is configured, the tier-2 line is simply absent.
      assert(!tier2Line || tier2Line.text.includes('(disabled)'),
        `[${label}] tier-2 line absent or disabled`);
    }

    if (expectations.tier3Configured) {
      assert(!!tier3Line && /https?:\/\//.test(tier3Line.text),
        `[${label}] tier-3 shows a URL`);
    } else {
      assert(!tier3Line, `[${label}] tier-3 line absent`);
    }

    // No error-style messages regardless of scenario
    const failMessages = v9netMsgs.filter(m => m.text.includes('FAILED'));
    assert(failMessages.length === 0,
      `[${label}] no "FAILED" messages (got ${failMessages.length})`);

    const warnMessages = v9netMsgs.filter(m => m.type === 'warning');
    assert(warnMessages.length === 0,
      `[${label}] no console.warn from transport init (got ${warnMessages.length})`);

    const probeErrors = pageErrors.filter(e => e.includes('v9-net') || e.includes('transport'));
    assert(probeErrors.length === 0,
      `[${label}] no page errors from transport init`);

    // Idempotence: tier-1 line appears exactly once (no duplicate firings)
    const tier1Count = v9netMsgs.filter(m => /tier-1 v9-net\s/.test(m.text)).length;
    assert(tier1Count === 1, `[${label}] tier-1 line appears exactly once (got ${tier1Count})`);

    // Tier-1 URL was mirrored into the global + process.env
    const state = await page.evaluate(() => ({
      gvisor: globalThis.__V9_GVISOR_WS_URL__,
      envGvisor: globalThis.process?.env?.NODEJS_GVISOR_WS_URL,
    }));
    assert(typeof state.gvisor === 'string' && state.gvisor.startsWith('ws'),
      `[${label}] __V9_GVISOR_WS_URL__ set to "${state.gvisor}"`);
    assert(state.envGvisor === state.gvisor,
      `[${label}] NODEJS_GVISOR_WS_URL mirrors __V9_GVISOR_WS_URL__`);
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
