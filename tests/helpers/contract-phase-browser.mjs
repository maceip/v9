/**
 * Phase 1 of the unified in-tab contract: real Chromium loads the same import map + polyfills
 * as web/index.html and runs in-tab-api-contract-suite.mjs (bridge target).
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startInTabFetchProxy } from './in-tab-fetch-proxy.mjs';
import { startStaticServer } from './static-server.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = join(__dirname, '..', '..');

const TIMEOUT_MS = 180_000;

const coopCoep = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

/** @param {{ rootDir?: string, htmlPath?: string }} [opts] */
export async function runBrowserHostContractPhase(opts = {}) {
  const rootDir = opts.rootDir ?? DEFAULT_ROOT;
  const htmlPath = opts.htmlPath ?? 'web/nodejs-in-tab-contract.html';

  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch (error) {
    return {
      ok: false,
      name: 'browser-host',
      checksPassed: 0,
      checksFailed: 1,
      error: `playwright-core: ${error.message}`,
    };
  }

  const server = await startStaticServer({
    rootDir,
    headers: coopCoep,
  });

  let fetchProxy;
  try {
    fetchProxy = await startInTabFetchProxy({ port: 0 });
  } catch (e) {
    await server.close();
    throw e;
  }

  let browser;
  let checksPassed = 0;
  let checksFailed = 0;
  const notes = [];

  try {
    const launchOptions = { headless: true };
    const executablePath = process.env.CHROME_BIN || process.env.GOOGLE_CHROME_BIN
      || process.env.GOOGLE_CHROME_SHIM;
    if (executablePath) launchOptions.executablePath = executablePath;

    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);

    const consoleErrors = [];
    page.on('console', (msg) => {
      const t = msg.text();
      if (process.env.NODEJS_IN_TAB_CONTRACT_DEBUG === '1') {
        console.log(`  [browser:${msg.type()}] ${t}`);
      }
      if (msg.type() === 'error') consoleErrors.push(t);
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err?.message || String(err));
    });

    const contractUrl = new URL(`${server.baseUrl}/${htmlPath}`);
    contractUrl.searchParams.set('fetchProxy', fetchProxy.proxyUrl);
    await page.goto(contractUrl.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.__HARNESS_BROWSER_RESULT__ != null);

    const result = await page.evaluate(() => globalThis.__HARNESS_BROWSER_RESULT__);

    if (result.error) {
      checksFailed++;
      notes.push(`suite error: ${result.error}`);
    } else if (!result.ok) {
      checksFailed++;
      notes.push(`harness: failed=${result.failed} passed=${result.passed} skipped=${result.skipped}`);
    } else {
      checksPassed++;
      notes.push(`suite: ${result.passed} passed, ${result.skipped} skipped, ${result.failed} failed`);
    }

    if (consoleErrors.length) {
      notes.push(`console errors (first 4): ${consoleErrors.slice(0, 4).join(' | ')}`);
    }

    const sab = await page.evaluate(() => typeof SharedArrayBuffer !== 'undefined');
    if (!sab) {
      checksFailed++;
      notes.push('SharedArrayBuffer missing (COOP/COEP?)');
    } else {
      checksPassed++;
    }
  } catch (e) {
    checksFailed++;
    notes.push(e?.message || String(e));
  } finally {
    if (browser) await browser.close();
    await fetchProxy.close();
    await server.close();
  }

  return {
    ok: checksFailed === 0,
    name: 'browser-host',
    checksPassed,
    checksFailed,
    notes,
  };
}
