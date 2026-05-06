#!/usr/bin/env node
/**
 * Verify the public GitHub Pages site loads the wasm runtime.
 * Opens maceip.github.io/v9, clicks the pink tile, waits for the
 * terminal to load, then takes a screenshot.
 *
 * Usage: node scripts/verify-pages-site.mjs
 */
import { chromium } from 'playwright-core';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotPath = resolve(__dirname, '..', 'pages-verification.png');

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const launchOpts = {
  headless: true,
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
};
if (proxyUrl) {
  try {
    const parsed = new URL(proxyUrl);
    launchOpts.proxy = {
      server: `${parsed.protocol}//${parsed.hostname}:${parsed.port}`,
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
    };
  } catch {
    launchOpts.proxy = { server: proxyUrl };
  }
}
const browser = await chromium.launch(launchOpts);
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();

// Collect console messages for debugging
const logs = [];
page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => logs.push(`[PAGE ERROR] ${err.message}`));

console.log('Loading https://maceip.github.io/v9/ ...');
await page.goto('https://maceip.github.io/v9/', { waitUntil: 'networkidle', timeout: 30000 });
console.log('Page loaded.');

// Click the terminal tile (glass terminal in the center of the landing page)
// The click handler is on #terminal-wrap — clicking it zooms in and loads the iframe.
console.log('Clicking #terminal-wrap to launch terminal...');
await page.click('#terminal-wrap');

// Wait 10 seconds for the terminal/wasm to load
console.log('Waiting 10s for terminal to load...');
await page.waitForTimeout(10000);

// Take screenshot
await page.screenshot({ path: screenshotPath, fullPage: false });
console.log(`Screenshot saved: ${screenshotPath}`);

// Print console logs for debugging
console.log('\n--- Browser console logs ---');
for (const log of logs.slice(-30)) {
  console.log(log);
}

await browser.close();
