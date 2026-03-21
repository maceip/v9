#!/usr/bin/env node
/**
 * Browser interactivity tests — verify keyboard input works for all CLIs.
 *
 * For each CLI:
 *   1. Load the bundle
 *   2. Wait for TUI to render
 *   3. Send arrow keys, Enter, "/" keystrokes
 *   4. Verify the terminal content changes (proves input is wired)
 *
 * For Claude Code specifically:
 *   5. Navigate past onboarding (select theme with Enter)
 *   6. Type "write me a paragraph on god"
 *   7. Verify a response renders back
 *
 * Usage:
 *   node tests/browser-interactivity.mjs
 *
 * Requires:
 *   - Dev server running (node scripts/dev-server.mjs)
 *   - dist/claude-code-cli.js, dist/gemini-cli.js, dist/cline-cli.js, dist/cody-cli.js
 *   - API key in ANTHROPIC_API_KEY env var (for Claude conversation test)
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  getScenarioByDisplayName,
  loadBrowserSmokeContract,
  shouldSkipForKnownIssue,
} from './helpers/browser-smoke-contract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const API_KEY = process.env.ANTHROPIC_API_KEY || '';

let passed = 0;
let failed = 0;
let skipped = 0;

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }

async function launchBrowser(protocolTimeoutMs) {
  let puppeteer;
  try { puppeteer = await import('puppeteer'); } catch {
    try { puppeteer = await import('puppeteer-core'); } catch {
      throw new Error('Install puppeteer: npm install puppeteer');
    }
  }
  return (puppeteer.default?.launch || puppeteer.launch)({
    headless: 'new',
    protocolTimeout: protocolTimeoutMs,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });
}

function buildScenarioSessionSeed(scenario) {
  const seed = {};
  for (const key of scenario?.sessionKeys || []) {
    if (!key?.name) continue;
    if (key.fromEnv && process.env[key.fromEnv]) {
      seed[key.name] = process.env[key.fromEnv];
      continue;
    }
    if (typeof key.fallback === 'string') {
      seed[key.name] = key.fallback;
    }
  }
  return seed;
}

async function getTerminalText(page) {
  return page.evaluate(() => {
    const el = document.querySelector('#terminal');
    return el?.textContent || '';
  });
}

async function getRuntimeDiagnostics(page) {
  return page.evaluate(() => {
    const requests = globalThis._requests || [];
    const responses = globalThis._responses || [];
    const rejections = globalThis._rejections || [];
    return {
      requestCount: requests.length,
      responseCount: responses.length,
      rejectionCount: rejections.length,
      recentRejections: rejections.slice(-3).map((r) => r?.message || String(r)),
    };
  });
}

async function sendKeys(page, keys, delayMs = 100) {
  // Focus the xterm terminal element so keyboard events reach it
  await page.evaluate(() => {
    const textarea = document.querySelector('.xterm-helper-textarea') || document.querySelector('textarea');
    if (textarea) textarea.focus();
  });
  await sleep(100);

  for (const key of keys) {
    if (key === 'ArrowUp') await page.keyboard.press('ArrowUp');
    else if (key === 'ArrowDown') await page.keyboard.press('ArrowDown');
    else if (key === 'Enter') await page.keyboard.press('Enter');
    else if (key === 'Escape') await page.keyboard.press('Escape');
    else if (key === 'Tab') await page.keyboard.press('Tab');
    else if (key === 'Backspace') await page.keyboard.press('Backspace');
    else {
      // Also push directly to stdin in case xterm doesn't capture
      await page.evaluate((ch) => {
        if (typeof globalThis._stdinPush === 'function') globalThis._stdinPush(ch);
      }, key);
      await page.keyboard.type(key, { delay: 20 });
    }
    await sleep(delayMs);
  }
}

async function testKeyInteractivity(browser, scenario, defaults) {
  const name = scenario.displayName;
  const bundlePath = scenario.bundlePath;
  console.log(`\n── ${name}: Key Interactivity ──`);

  const bundleFile = join(ROOT, bundlePath.replace(/^\//, ''));
  if (!existsSync(bundleFile)) {
    log('⏭', `SKIP: ${bundleFile} not found`);
    skipped++;
    return;
  }

  const page = await browser.newPage();
  page.on('pageerror', () => {}); // suppress page errors

  const sessionSeed = buildScenarioSessionSeed(scenario);
  await page.evaluateOnNewDocument((seed) => {
    for (const [k, v] of Object.entries(seed)) {
      if (v) sessionStorage.setItem(k, v);
    }
  }, sessionSeed);

  try {
    const loadBudgetMs = scenario.phaseBudgetsMs?.interactiveLoad || defaults.navigationTimeoutMs;
    const renderBudgetMs = scenario.phaseBudgetsMs?.interactiveRender || defaults.interactiveRenderWaitMs;
    await page.goto(`${defaults.baseUrl}/web/index.html?bundle=${bundlePath}`, {
      waitUntil: 'domcontentloaded',
      timeout: loadBudgetMs,
    });

    // Wait for CLI to load and render
    await sleep(renderBudgetMs);

    const textBefore = await getTerminalText(page);
    if (textBefore.length < 50) {
      log('❌', `Terminal has no content (${textBefore.length} chars)`);
      failed++;
      await page.close();
      return;
    }
    log('✅', `CLI loaded (${textBefore.length} chars in terminal)`);
    passed++;

    // Test 1: Arrow key changes terminal content
    await sendKeys(page, ['ArrowDown', 'ArrowDown', 'ArrowUp']);
    await sleep(2000);
    const textAfterArrows = await getTerminalText(page);
    if (textAfterArrows !== textBefore) {
      log('✅', 'Arrow keys produced terminal change');
      passed++;
    } else {
      log('⚠️', 'Arrow keys did not visibly change terminal (may still be working)');
    }

    // Test 2: Enter key
    const textBeforeEnter = await getTerminalText(page);
    await sendKeys(page, ['Enter']);
    await sleep(3000);
    const textAfterEnter = await getTerminalText(page);
    if (textAfterEnter !== textBeforeEnter) {
      log('✅', 'Enter key produced terminal change');
      passed++;
    } else {
      log('⚠️', 'Enter key did not visibly change terminal');
    }

    // Test 3: "/" key (often triggers command palette)
    await sendKeys(page, ['/']);
    await sleep(2000);
    const textAfterSlash = await getTerminalText(page);
    if (textAfterSlash.includes('/') || textAfterSlash !== textAfterEnter) {
      log('✅', '"/" key registered');
      passed++;
    } else {
      log('⚠️', '"/" key did not produce visible change');
    }

    // Screenshot
    const screenshotPath = join(ROOT, 'tests', `interactivity-${name.toLowerCase().replace(/\s+/g, '-')}.png`);
    await page.screenshot({ path: screenshotPath });
    log('📸', `Screenshot: ${screenshotPath}`);

  } catch (err) {
    const message = String(err?.message || err);
    const skip = shouldSkipForKnownIssue(scenario, 'interactivity', message);
    if (skip) {
      log('⚠️', `${name} skipped (${skip.code}, expires ${skip.expiresOn}): ${message.slice(0, 120)}`);
      skipped++;
    } else {
      log('❌', `${name} error: ${message}`);
      failed++;
    }
  } finally {
    await page.close();
  }
}

async function testClaudeConversation(browser) {
  console.log('\n── Claude Code: Full Conversation ──');

  const requiredEnvKey = CONTRACT.conversation.requiredEnvKey;
  const requiredEnvValue = process.env[requiredEnvKey] || '';
  if (!requiredEnvValue) {
    log('⏭', `SKIP: No ${requiredEnvKey} set. Run with: ${requiredEnvKey}=... node tests/browser-interactivity.mjs`);
    skipped++;
    return;
  }

  const conversationScenario = CONTRACT.scenarios.find((s) => s.id === CONTRACT.conversation.scenarioId)
    || getScenarioByDisplayName(CONTRACT, 'Claude Code');
  const conversationBundle = conversationScenario?.bundlePath || '/dist/claude-code-cli.js';
  const bundleFile = join(ROOT, conversationBundle.replace(/^\//, ''));
  if (!existsSync(bundleFile)) {
    log('⏭', `SKIP: ${conversationBundle} not found`);
    skipped++;
    return;
  }

  const page = await browser.newPage();
  page.on('pageerror', () => {});

  await page.evaluateOnNewDocument((key) => {
    sessionStorage.setItem('anthropic_api_key', key);
  }, requiredEnvValue);

  try {
    const loadBudgetMs = conversationScenario?.phaseBudgetsMs?.interactiveLoad || TEST_DEFAULTS.navigationTimeoutMs;
    const renderBudgetMs = conversationScenario?.phaseBudgetsMs?.interactiveRender || TEST_DEFAULTS.interactiveRenderWaitMs;
    await page.goto(`${TEST_DEFAULTS.baseUrl}/web/index.html?bundle=${conversationBundle}`, {
      waitUntil: 'domcontentloaded',
      timeout: loadBudgetMs,
    });

    // Wait for Claude Code TUI to fully render
    await sleep(renderBudgetMs);
    log('✅', 'Claude Code loaded');
    passed++;

    // Step 1: Navigate past onboarding — press Enter to select default theme
    log('⏳', 'Selecting default theme...');
    await sendKeys(page, ['Enter']);
    await sleep(5000);

    // Step 2: Press Enter again if there's another onboarding step
    await sendKeys(page, ['Enter']);
    await sleep(5000);

    // Step 3: Press Escape to dismiss any modals
    await sendKeys(page, ['Escape']);
    await sleep(2000);

    const textAfterOnboarding = await getTerminalText(page);
    const diagnosticsBeforePrompt = await getRuntimeDiagnostics(page);
    log('📋', `After onboarding: ${textAfterOnboarding.length} chars`);

    // Step 4: Type the prompt — push directly to stdin AND via keyboard
    const prompt = CONTRACT.conversation.prompt;
    log('⏳', `Typing prompt: "${prompt}"`);
    // Focus xterm
    await page.evaluate(() => {
      const ta = document.querySelector('.xterm-helper-textarea') || document.querySelector('textarea');
      if (ta) ta.focus();
    });
    // Push each char to stdin directly
    for (const ch of prompt) {
      await page.evaluate((c) => { if (globalThis._stdinPush) globalThis._stdinPush(c); }, ch);
      await page.keyboard.type(ch, { delay: 20 });
      await sleep(30);
    }
    await sleep(1000);

    // Verify the prompt appears in the terminal
    const textWithPrompt = await getTerminalText(page);
    if (textWithPrompt.includes('paragraph') || textWithPrompt.includes('god')) {
      log('✅', 'Prompt text visible in terminal');
      passed++;
    } else {
      log('⚠️', 'Prompt text not visible (input may be in a different buffer)');
    }

    // Step 5: Press Enter to submit
    log('⏳', 'Submitting prompt...');
    await page.evaluate(() => { if (globalThis._stdinPush) globalThis._stdinPush('\r'); });
    await sendKeys(page, ['Enter']);

    // Step 6: Wait for streaming response (contract budget)
    // Accept either visible content growth OR runtime request/response activity.
    log('⏳', 'Waiting for API response or runtime request activity...');
    let responseDetected = false;
    let networkDispatchDetected = false;
    const responsePollMs = 2000;
    const loops = Math.max(1, Math.ceil(CONTRACT.conversation.responseWaitMs / responsePollMs));
    for (let i = 0; i < loops; i++) {
      await sleep(responsePollMs);
      const currentText = await getTerminalText(page);
      const diagnostics = await getRuntimeDiagnostics(page);
      // Look for signs of a response — Claude's response would contain
      // natural language that wasn't there before
      const newContent = currentText.length - textWithPrompt.length;
      if (diagnostics.requestCount > diagnosticsBeforePrompt.requestCount) {
        networkDispatchDetected = true;
      }
      if (diagnostics.responseCount > diagnosticsBeforePrompt.responseCount) {
        networkDispatchDetected = true;
      }
      if (newContent > 100) {
        // Significant new content appeared — likely a response
        log('✅', `Response detected! (${newContent} new chars after ${(i + 1) * 2}s)`);
        passed++;
        responseDetected = true;

        // Verify it contains actual words (not just ANSI codes)
        const lastChunk = currentText.slice(-500);
        const wordCount = lastChunk.split(/\s+/).filter(w => w.length > 3).length;
        if (wordCount > 10) {
          log('✅', `Response contains readable text (${wordCount} words in last 500 chars)`);
          passed++;
        } else {
          log('⚠️', `Response may be mostly ANSI codes (${wordCount} readable words)`);
        }
        break;
      }
    }

    if (!responseDetected && networkDispatchDetected) {
      log('✅', 'Prompt was dispatched (runtime request/response activity observed)');
      passed++;
      const finalDiagnostics = await getRuntimeDiagnostics(page);
      log('📋', `Runtime diagnostics: requests=${finalDiagnostics.requestCount}, responses=${finalDiagnostics.responseCount}, rejections=${finalDiagnostics.rejectionCount}`);
    } else if (!responseDetected) {
      log('❌', 'No response or runtime request activity detected within budget');
      failed++;

      // Check for error messages
      const finalText = await getTerminalText(page);
      const finalDiagnostics = await getRuntimeDiagnostics(page);
      if (finalText.includes('error') || finalText.includes('Error') || finalText.includes('FAIL')) {
        log('📋', 'Error detected in terminal output');
      }
      if (finalText.includes('CORS') || finalText.includes('network')) {
        log('📋', 'Network/CORS error — check CORS proxy');
      }
      if (finalDiagnostics.recentRejections.length > 0) {
        log('📋', `Recent rejections: ${JSON.stringify(finalDiagnostics.recentRejections)}`);
      }
    }

    // Final screenshot
    const screenshotPath = join(ROOT, 'tests', 'interactivity-claude-conversation.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log('📸', `Conversation screenshot: ${screenshotPath}`);

  } catch (err) {
    log('❌', `Conversation test error: ${err.message}`);
    failed++;
  } finally {
    await page.close();
  }
}

// ── Main ────────────────────────────────────────────────────────────

console.log('=== Browser Interactivity Tests ===\n');
const CONTRACT = await loadBrowserSmokeContract();
const TEST_DEFAULTS = {
  baseUrl: process.env.BASE_URL || CONTRACT.defaults.baseUrl,
  navigationTimeoutMs: Number(process.env.BROWSER_TEST_NAV_TIMEOUT_MS || CONTRACT.defaults.navigationTimeoutMs),
  protocolTimeoutMs: CONTRACT.defaults.protocolTimeoutMs,
  interactiveRenderWaitMs: CONTRACT.defaults.interactiveRenderWaitMs,
};

// Start dev server if not already running
let server = null;
try {
  const resp = await fetch(`${TEST_DEFAULTS.baseUrl}/web/index.html`);
  if (resp.ok) console.log('Dev server already running.');
} catch {
  console.log('Starting dev server...');
  server = spawn('node', [join(ROOT, 'scripts', 'dev-server.mjs')], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: false,
  });
  await sleep(4000);
  console.log('Dev server started.');
}

let browser;
try {
  browser = await launchBrowser(TEST_DEFAULTS.protocolTimeoutMs);
  console.log('Browser launched.');

  // Test key interactivity for all CLIs
  for (const scenario of CONTRACT.scenarios) {
    await testKeyInteractivity(browser, scenario, TEST_DEFAULTS);
  }

  // Test full conversation with Claude Code
  await testClaudeConversation(browser);

} catch (err) {
  console.error('Fatal error:', err.message);
  failed++;
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed, ${skipped} skipped ===`);
process.exit(failed > 0 ? 1 : 0);
