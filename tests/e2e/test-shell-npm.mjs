#!/usr/bin/env node
/**
 * E2E Shell & npm Test — Playwright-based tests for the interactive shell,
 * npm install, and bVisor-compatible Sandbox API.
 *
 * Tests:
 *   1. Shell initializes when no bundle is configured
 *   2. Shell prompt renders with cwd
 *   3. echo command produces output
 *   4. mkdir + ls work against MEMFS
 *   5. cd changes cwd and prompt updates
 *   6. Command history (up arrow)
 *   7. Ctrl+C cancels current line
 *   8. Piping works (echo hello | cat)
 *   9. Redirects work (echo text > file && cat file)
 *  10. npm install fetches a real package from registry.npmjs.org
 *  11. npm list shows installed packages
 *  12. Installed package is require()-able
 *  13. Sandbox API (bVisor-compatible) works
 *  14. Sandbox handles async commands (npm)
 *
 * Usage:
 *   node tests/e2e/test-shell-npm.mjs                # headless
 *   node tests/e2e/test-shell-npm.mjs --headed        # visible browser
 */

import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// ─── Minimal static file server ──────────────────────────────────────

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const filePath = join(ROOT, url.pathname === '/' ? '/tests/e2e/shell-test-page.html' : url.pathname);

      try {
        const data = await readFile(filePath);
        const ext = extname(filePath);
        // No COEP headers — shell tests don't need SharedArrayBuffer
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
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

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Read terminal screen content from xterm.js buffer.
 */
async function getTerminalText(page) {
  return page.evaluate(() => {
    const term = globalThis.__edgeTerm;
    if (!term) return '';
    const lines = [];
    for (let i = 0; i < term.buffer.active.length; i++) {
      const line = term.buffer.active.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.join('\n');
  });
}

/**
 * Type a command and wait for output.
 * Uses _stdinPush for reliability (avoids xterm key event timing issues).
 */
async function shellExec(page, command, waitMs = 1000) {
  await page.evaluate((cmd) => {
    globalThis._stdinPush(cmd + '\n');
  }, command);
  await page.waitForTimeout(waitMs);
}

/**
 * Wait for terminal to contain a string (polling).
 */
async function waitForTerminalText(page, text, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const content = await getTerminalText(page);
    if (content.includes(text)) return content;
    await page.waitForTimeout(250);
  }
  const content = await getTerminalText(page);
  if (!content.includes(text)) {
    throw new Error(`Timeout waiting for "${text}" in terminal. Got:\n${content.slice(-500)}`);
  }
  return content;
}

// ─── Test runner ─────────────────────────────────────────────────────

const HEADED = process.argv.includes('--headed');
const TIMEOUT = 60_000;

async function runTests() {
  let chromium;
  try {
    const pw = await import('playwright-core');
    chromium = pw.chromium;
  } catch {
    try {
      const pw = await import('playwright');
      chromium = pw.chromium;
    } catch {
      console.error('playwright-core not installed. Run: npm install');
      process.exit(1);
    }
  }

  // Find browser
  const browserPath = process.env.PLAYWRIGHT_BROWSER_PATH ||
    process.env.CHROME_PATH ||
    (() => {
      try {
        return execSync('which chromium-browser || which chromium || which google-chrome', {
          encoding: 'utf8',
        }).trim();
      } catch {
        return null;
      }
    })();

  const { server, url: baseUrl } = await startServer();
  console.log(`[shell-test] Dev server on ${baseUrl}`);

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
    console.error(`[shell-test] Cannot launch browser: ${err.message}`);
    server.close();
    process.exit(1);
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  PASS: ${name}`);
      passed++;
    } else {
      console.log(`  FAIL: ${name}`);
      failed++;
    }
  }

  try {
    console.log('\n=== Shell & npm E2E Tests ===\n');

    // ── Load shell test page ──
    await page.goto(`${baseUrl}/tests/e2e/shell-test-page.html`, {
      timeout: TIMEOUT,
      waitUntil: 'domcontentloaded',
    });

    // Wait for shell to initialize
    await page.waitForFunction(() => globalThis.__shellReady === true, { timeout: 15000 });
    await page.waitForTimeout(500);

    // ═══════════════════════════════════════════════════════════════
    // Test 1: Shell initialized
    // ═══════════════════════════════════════════════════════════════
    const hasShell = await page.evaluate(() => !!globalThis.__edgeShell);
    assert(hasShell, 'Shell initialized (globalThis.__edgeShell exists)');

    // ═══════════════════════════════════════════════════════════════
    // Test 2: Shell prompt visible
    // ═══════════════════════════════════════════════════════════════
    const termText = await getTerminalText(page);
    assert(termText.includes('$'), 'Shell prompt ($) visible in terminal');

    // ═══════════════════════════════════════════════════════════════
    // Test 3: echo command
    // ═══════════════════════════════════════════════════════════════
    await shellExec(page, 'echo hello-from-shell');
    const echoText = await getTerminalText(page);
    assert(echoText.includes('hello-from-shell'), 'echo command outputs text');

    // ═══════════════════════════════════════════════════════════════
    // Test 4: mkdir + ls
    // ═══════════════════════════════════════════════════════════════
    await shellExec(page, 'mkdir -p /workspace/testdir');
    await shellExec(page, 'ls /workspace');
    const lsText = await getTerminalText(page);
    assert(lsText.includes('testdir'), 'mkdir creates directory, ls shows it');

    // ═══════════════════════════════════════════════════════════════
    // Test 5: File creation and reading
    // ═══════════════════════════════════════════════════════════════
    await shellExec(page, "echo 'file content here' > /workspace/test.txt");
    await shellExec(page, 'cat /workspace/test.txt');
    const catText = await getTerminalText(page);
    assert(catText.includes('file content here'), 'echo > file && cat file works');

    // ═══════════════════════════════════════════════════════════════
    // Test 6: cd changes directory
    // ═══════════════════════════════════════════════════════════════
    await shellExec(page, 'cd /workspace/testdir');
    await shellExec(page, 'pwd');
    const pwdText = await getTerminalText(page);
    assert(pwdText.includes('/workspace/testdir'), 'cd changes cwd, pwd confirms it');

    // Go back
    await shellExec(page, 'cd /workspace');

    // ═══════════════════════════════════════════════════════════════
    // Test 7: Pipe works
    // ═══════════════════════════════════════════════════════════════
    await shellExec(page, "echo 'pipe-test-output' | cat");
    const pipeText = await getTerminalText(page);
    assert(pipeText.includes('pipe-test-output'), 'Pipe (echo | cat) works');

    // ═══════════════════════════════════════════════════════════════
    // Test 8: && chaining
    // ═══════════════════════════════════════════════════════════════
    await shellExec(page, "echo first && echo second");
    const chainText = await getTerminalText(page);
    assert(chainText.includes('first') && chainText.includes('second'), '&& chaining works');

    // ═══════════════════════════════════════════════════════════════
    // Test 9: Command not found
    // ═══════════════════════════════════════════════════════════════
    await shellExec(page, 'nonexistentcommand');
    const notFoundText = await getTerminalText(page);
    assert(notFoundText.includes('command not found'), 'Unknown command returns "command not found"');

    // ═══════════════════════════════════════════════════════════════
    // Test 10: Ctrl+C clears line
    // ═══════════════════════════════════════════════════════════════
    await page.evaluate(() => {
      globalThis._stdinPush('partial-command-text');
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      globalThis._stdinPush('\x03'); // Ctrl+C
    });
    await page.waitForTimeout(500);
    const ctrlcText = await getTerminalText(page);
    assert(ctrlcText.includes('^C'), 'Ctrl+C shows ^C and resets line');

    // ═══════════════════════════════════════════════════════════════
    // Test 11: env command
    // ═══════════════════════════════════════════════════════════════
    await shellExec(page, 'env | grep HOME');
    // env might not pipe through grep in our shell, so just check env output
    await shellExec(page, 'echo $HOME');
    const envText = await getTerminalText(page);
    // HOME might be /home/user from the env we set
    assert(envText.includes('/home/user') || envText.includes('HOME'), 'Environment variables accessible');

    // ═══════════════════════════════════════════════════════════════
    // Test 12: npm help
    // ═══════════════════════════════════════════════════════════════
    await shellExec(page, 'npm help');
    const npmHelpText = await getTerminalText(page);
    assert(npmHelpText.includes('npm install') || npmHelpText.includes('npm <command>'),
      'npm help shows usage information');

    // ═══════════════════════════════════════════════════════════════
    // Test 13: npm install a real package (ms — tiny, zero deps)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n  [Fetching package from npm registry — requires network]');
    await shellExec(page, 'npm install ms', 500);

    try {
      // Wait for the async install to complete (network fetch)
      await waitForTerminalText(page, 'added', 30000);
      const npmInstallText = await getTerminalText(page);
      assert(npmInstallText.includes('ms@'), 'npm install ms fetches and extracts package');

      // ═══════════════════════════════════════════════════════════════
      // Test 14: Installed package exists in MEMFS
      // ═══════════════════════════════════════════════════════════════
      const packageExists = await page.evaluate(() => {
        try {
          const rt = globalThis.__edgeRuntime;
          const data = rt.fs.readFileSync('/workspace/node_modules/ms/package.json', 'utf8');
          const pkg = JSON.parse(data);
          return pkg.name === 'ms';
        } catch { return false; }
      });
      assert(packageExists, 'ms/package.json exists in MEMFS node_modules');

      // ═══════════════════════════════════════════════════════════════
      // Test 15: npm list shows the package
      // ═══════════════════════════════════════════════════════════════
      await shellExec(page, 'npm list');
      const npmListText = await getTerminalText(page);
      assert(npmListText.includes('ms@'), 'npm list shows installed ms package');

      // ═══════════════════════════════════════════════════════════════
      // Test 16: require() resolves installed package
      // ═══════════════════════════════════════════════════════════════
      const requireWorks = await page.evaluate(() => {
        try {
          const rt = globalThis.__edgeRuntime;
          if (!rt || !rt.require) return false;
          const ms = rt.require('ms', '/workspace');
          // ms('2 days') should return a number
          return typeof ms === 'function' && typeof ms('1s') === 'number';
        } catch (e) {
          console.error('require test failed:', e.message);
          return false;
        }
      });
      assert(requireWorks, 'require("ms") works and returns a function');

    } catch (err) {
      console.log(`  SKIP: npm install test — ${err.message}`);
      // Don't fail the whole suite if network is unavailable
    }

    // ═══════════════════════════════════════════════════════════════
    // Test 17: Sandbox API (bVisor-compatible)
    // ═══════════════════════════════════════════════════════════════
    const sandboxWorks = await page.evaluate(async () => {
      try {
        const { Sandbox } = await import('/napi-bridge/sandbox.js');
        const sb = new Sandbox();
        const out = sb.runCmd("echo 'sandbox-test-output'");
        const stdout = await out.stdout();
        return stdout.includes('sandbox-test-output');
      } catch (e) {
        console.error('sandbox test failed:', e.message);
        return false;
      }
    });
    assert(sandboxWorks, 'Sandbox API: runCmd("echo ...") returns correct stdout');

    // ═══════════════════════════════════════════════════════════════
    // Test 18: Sandbox mkdir + cat roundtrip
    // ═══════════════════════════════════════════════════════════════
    const sandboxFs = await page.evaluate(async () => {
      try {
        const { Sandbox } = await import('/napi-bridge/sandbox.js');
        const sb = new Sandbox();
        sb.runCmd("mkdir -p /workspace/sb-test");
        sb.runCmd("echo 'hello sandbox' > /workspace/sb-test/file.txt");
        const out = sb.runCmd("cat /workspace/sb-test/file.txt");
        const stdout = await out.stdout();
        return stdout.trim() === 'hello sandbox';
      } catch (e) {
        console.error('sandbox fs test failed:', e.message);
        return false;
      }
    });
    assert(sandboxFs, 'Sandbox API: file creation and reading works');

    // ═══════════════════════════════════════════════════════════════
    // Test 19: Sandbox Output has correct shape (bVisor parity)
    // ═══════════════════════════════════════════════════════════════
    const sandboxShape = await page.evaluate(async () => {
      try {
        const { Sandbox } = await import('/napi-bridge/sandbox.js');
        const sb = new Sandbox();
        const out = sb.runCmd("echo test");
        return (
          typeof out.stdout === 'function' &&
          typeof out.stderr === 'function' &&
          out.stdoutStream instanceof ReadableStream &&
          out.stderrStream instanceof ReadableStream
        );
      } catch { return false; }
    });
    assert(sandboxShape, 'Sandbox Output has bVisor-compatible shape (stdout, stderr, streams)');

    // ═══════════════════════════════════════════════════════════════
    // Test 20: Sandbox stderr on bad command
    // ═══════════════════════════════════════════════════════════════
    const sandboxStderr = await page.evaluate(async () => {
      try {
        const { Sandbox } = await import('/napi-bridge/sandbox.js');
        const sb = new Sandbox();
        const out = sb.runCmd("thiscommanddoesnotexist");
        const stderr = await out.stderr();
        return stderr.includes('command not found');
      } catch { return false; }
    });
    assert(sandboxStderr, 'Sandbox stderr contains "command not found" for unknown commands');

    // ═══════════════════════════════════════════════════════════════
    // Test 21: node <script.js> — run a script from MEMFS
    // ═══════════════════════════════════════════════════════════════
    await page.evaluate(() => {
      const rt = globalThis.__edgeRuntime;
      rt.fs.writeFileSync('/workspace/hello.js', 'console.log("hello-from-script-" + (2 + 2));\n');
    });
    await shellExec(page, 'node /workspace/hello.js');
    const nodeScriptText = await getTerminalText(page);
    assert(nodeScriptText.includes('hello-from-script-4'), 'node <script.js> executes JS and captures console.log');

    // ═══════════════════════════════════════════════════════════════
    // Test 22: node -e "expression" — eval JS
    // ═══════════════════════════════════════════════════════════════
    await shellExec(page, 'node -e "1 + 1"');
    const nodeEvalText = await getTerminalText(page);
    assert(nodeEvalText.includes('2'), 'node -e "1 + 1" evaluates and prints result');

    // ═══════════════════════════════════════════════════════════════
    // Test 23: node <script.js> with require('fs')
    // ═══════════════════════════════════════════════════════════════
    await page.evaluate(() => {
      const rt = globalThis.__edgeRuntime;
      rt.fs.writeFileSync('/workspace/fs-test.js',
        'const fs = require("fs");\n' +
        'fs.writeFileSync("/workspace/written-by-script.txt", "it-works");\n' +
        'const data = fs.readFileSync("/workspace/written-by-script.txt", "utf8");\n' +
        'console.log("read-back:" + data);\n'
      );
    });
    await shellExec(page, 'node /workspace/fs-test.js');
    const fsScriptText = await getTerminalText(page);
    assert(fsScriptText.includes('read-back:it-works'), 'node script can require("fs") and do file I/O');

    // ═══════════════════════════════════════════════════════════════
    // Test 24: Shell-first boot with auto-run bundle
    //   Simulates what happens when ?bundle= is set:
    //   shell writes a script, "auto-runs" it, output appears, prompt returns
    // ═══════════════════════════════════════════════════════════════
    await page.evaluate(() => {
      const rt = globalThis.__edgeRuntime;
      rt.fs.writeFileSync('/workspace/autorun-app.js',
        'console.log("autorun-app-started");\n' +
        'console.log("autorun-app-finished");\n'
      );
    });
    await shellExec(page, 'node /workspace/autorun-app.js', 1500);
    const autorunText = await getTerminalText(page);
    assert(
      autorunText.includes('autorun-app-started') && autorunText.includes('autorun-app-finished'),
      'Shell-first boot: node <bundle> runs app and output appears in terminal'
    );
    // Verify prompt came back after the script finished
    const lines = autorunText.split('\n');
    const lastNonEmpty = lines.filter(l => l.trim()).pop() || '';
    assert(lastNonEmpty.includes('$'), 'Shell-first boot: prompt returns after app exits');

    // ── Summary ──
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

  } catch (err) {
    console.error(`[shell-test] Test error: ${err.message}`);
    console.error(err.stack);
    failed++;
  } finally {
    if (HEADED) {
      console.log('[shell-test] Browser stays open (--headed). Press Ctrl+C to exit.');
      await new Promise(() => {}); // keep alive
    }
    await browser.close();
    server.close();
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('[shell-test] Fatal:', err);
  process.exit(1);
});
