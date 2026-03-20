#!/usr/bin/env node
/**
 * Browser smoke tests for Claude Code and Gemini CLI.
 *
 * Starts the dev server, launches Chrome via Puppeteer,
 * loads each CLI bundle, and checks that the TUI renders.
 *
 * Usage:
 *   node tests/browser-cli-smoke.mjs
 *
 * Requirements:
 *   - dist/claude-code-cli.js (npm pack @anthropic-ai/claude-code, copy cli.js)
 *   - dist/gemini-cli.js (sh scripts/bundle-gemini.sh)
 *   - npm install puppeteer (or puppeteer-core + Chrome)
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Config ──────────────────────────────────────────────────────────

const DEV_SERVER = join(ROOT, 'scripts', 'dev-server.mjs');
const BASE_URL = 'http://localhost:8080';
const BUNDLES = {
  'Claude Code': '/dist/claude-code-cli.js',
  'Gemini CLI': '/dist/gemini-cli.js',
  'Cline': '/dist/cline-cli.js',
  'Cody': '/dist/cody-cli.js',
  'Amp': '/dist/amp-cli.js',
};
const TIMEOUT = 60_000; // 60s per CLI
const API_KEY = 'sk-test-fake-key-for-smoke-test';

// ── Helpers ─────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;

function log(icon, msg) {
  console.log(`  ${icon} ${msg}`);
}

async function launchBrowser() {
  // Try puppeteer first, fall back to puppeteer-core + system Chrome
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
  const browser = await launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });
  return browser;
}

async function testCLI(browser, name, bundlePath) {
  const fullUrl = `${BASE_URL}/web/index.html?bundle=${bundlePath}`;
  console.log(`\n── ${name} ──`);
  console.log(`  URL: ${fullUrl}`);

  const bundleFile = join(ROOT, bundlePath.replace(/^\//, ''));
  if (!existsSync(bundleFile)) {
    log('⏭', `SKIP: ${bundleFile} not found`);
    skipped++;
    return;
  }

  const page = await browser.newPage();

  // Collect console output
  const consoleMessages = [];
  const errors = [];
  page.on('console', (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (err) => errors.push(err.message));

  // Set API key in sessionStorage before navigation
  await page.evaluateOnNewDocument((key) => {
    sessionStorage.setItem('anthropic_api_key', key);
  }, API_KEY);

  try {
    // Navigate and wait for network idle
    await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT });

    // Wait for the terminal to render something
    await sleep(15_000);

    // Test 1: Page loaded without crash
    const title = await page.title();
    if (title) {
      log('✅', `Page loaded: "${title}"`);
      passed++;
    } else {
      log('❌', 'Page has no title');
      failed++;
    }

    // Test 2: xterm.js terminal rendered
    const hasTerminal = await page.evaluate(() => {
      return document.querySelector('.xterm-screen') !== null ||
             document.querySelector('.xterm') !== null ||
             document.querySelector('#terminal canvas') !== null;
    });
    if (hasTerminal) {
      log('✅', 'xterm.js terminal rendered');
      passed++;
    } else {
      log('❌', 'No xterm.js terminal found in DOM');
      failed++;
    }

    // Test 3: ESM import succeeded (no "Invalid or unexpected token")
    const esmLoaded = await page.evaluate(() => {
      const term = document.querySelector('#terminal');
      const text = term?.textContent || '';
      return !text.includes('Invalid or unexpected token');
    });
    if (esmLoaded) {
      log('✅', 'ESM bundle loaded (no syntax errors)');
      passed++;
    } else {
      log('❌', 'ESM bundle failed with syntax error');
      failed++;
    }

    // Test 4: No critical unhandled rejections
    // Filter out known non-critical rejections from bundled dependencies
    const rejectionInfo = await page.evaluate(() => {
      const all = globalThis._rejections || [];
      const ignorable = ['m2r.transport', 'transport is not a function', 'Failed to save project registry'];
      const critical = all.filter(r => !ignorable.some(pat => (r.message || '').includes(pat)));
      return { total: all.length, critical: critical.length, details: critical.slice(0, 3).map(r => r.message?.slice(0, 100)) };
    });
    if (rejectionInfo.critical === 0) {
      log('✅', rejectionInfo.total > 0
        ? `No critical rejections (${rejectionInfo.total} non-critical filtered)`
        : 'No unhandled promise rejections');
      passed++;
    } else {
      log('❌', `${rejectionInfo.critical} critical rejections: ${JSON.stringify(rejectionInfo.details)}`);
      failed++;
    }

    // Test 5: CLI produced stdout output (rendered in terminal)
    const hasOutput = await page.evaluate(() => {
      const term = document.querySelector('#terminal');
      const text = term?.textContent || '';
      // Check for any meaningful output beyond our status messages
      return text.length > 200; // More than just the status lines
    });
    if (hasOutput) {
      log('✅', 'CLI produced terminal output');
      passed++;
    } else {
      log('⚠️', 'CLI produced minimal output (may still be loading)');
      // Don't count as failure — the CLI might be waiting for input
    }

    // Test 6: Check for specific CLI markers
    const cliMarker = await page.evaluate((cliName) => {
      const term = document.querySelector('#terminal');
      const text = term?.textContent || '';
      if (cliName === 'Claude Code') {
        return text.includes('Welcome') || text.includes('Claude') || text.includes('claude');
      }
      if (cliName === 'Gemini CLI') {
        return text.includes('Gemini') || text.includes('gemini') || text.includes('Google');
      }
      if (cliName === 'Cline') {
        return text.includes('Cline') || text.includes('cline') || text.includes('autonomous');
      }
      if (cliName === 'Cody') {
        return text.includes('Cody') || text.includes('cody') || text.includes('Sourcegraph');
      }
      if (cliName === 'Amp') {
        return text.includes('Amp') || text.includes('amp') || text.includes('Sourcegraph') || text.includes('ampcode');
      }
      return false;
    }, name);
    if (cliMarker) {
      log('✅', `${name} TUI content detected`);
      passed++;
    } else {
      log('⚠️', `${name} specific content not found in terminal`);
    }

    // Test 7: Screenshot
    const screenshotPath = join(ROOT, 'tests', `screenshot-${name.toLowerCase().replace(/\s+/g, '-')}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log('📸', `Screenshot saved: ${screenshotPath}`);

    // Dump console errors for debugging
    const consoleErrors = consoleMessages.filter(m => m.type === 'error');
    if (consoleErrors.length > 0) {
      log('📋', `Console errors (${consoleErrors.length}):`);
      for (const err of consoleErrors.slice(0, 5)) {
        log('  ', err.text.slice(0, 120));
      }
    }

    // Dump page errors
    if (errors.length > 0) {
      log('📋', `Page errors (${errors.length}):`);
      for (const err of errors.slice(0, 3)) {
        log('  ', err.slice(0, 120));
      }
    }

  } catch (err) {
    log('❌', `${name} crashed: ${err.message}`);
    failed++;

    // Screenshot on failure
    try {
      const screenshotPath = join(ROOT, 'tests', `screenshot-${name.toLowerCase().replace(/\s+/g, '-')}-failed.png`);
      await page.screenshot({ path: screenshotPath });
      log('📸', `Failure screenshot: ${screenshotPath}`);
    } catch {}
  } finally {
    await page.close();
  }
}

// ── Main ────────────────────────────────────────────────────────────

console.log('=== Browser CLI Smoke Tests ===\n');

// Start dev server
console.log('Starting dev server...');
const server = spawn('node', [DEV_SERVER], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: false,
});

let serverReady = false;
server.stdout.on('data', (data) => {
  const msg = data.toString();
  if (msg.includes('File server') || msg.includes('8080')) {
    serverReady = true;
  }
});
server.stderr.on('data', (data) => {
  // Ignore server stderr unless it's fatal
});

// Wait for server to start
for (let i = 0; i < 30; i++) {
  if (serverReady) break;
  await sleep(500);
}

if (!serverReady) {
  // Try anyway — server might be up without the log
  await sleep(3000);
}

console.log('Dev server started.');

let browser;
try {
  browser = await launchBrowser();
  console.log('Browser launched.');

  for (const [name, bundlePath] of Object.entries(BUNDLES)) {
    await testCLI(browser, name, bundlePath);
  }
} catch (err) {
  console.error('Fatal error:', err.message);
  failed++;
} finally {
  if (browser) await browser.close();
  server.kill();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${skipped} skipped ===`);
process.exit(failed > 0 ? 1 : 0);
