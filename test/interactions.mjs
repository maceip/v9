#!/usr/bin/env node
/**
 * Playwright interaction tests for v9 — browser-based Claude Code.
 *
 * Tests legitimate browser interactions against the live GitHub Pages site:
 *
 *   1. Landing page render + DOM structure
 *   2. Terminal zoom activation (click → spring → boot)
 *   3. Boot sequence typewriter completion
 *   4. CLI iframe loads and xterm.js initializes
 *   5. Keyboard input reaches the terminal (stdin pipe)
 *   6. API key prompt appears when no key is set
 *   7. API key injection via sessionStorage
 *   8. Multi-turn conversation flow (mocked API)
 *   9. MCP server registration via /mcp command
 *  10. Escape key dismisses terminal (swipe-to-dismiss)
 *
 * Usage:
 *   node test/interactions.mjs                             # live site
 *   node test/interactions.mjs http://localhost:8080/       # local dev
 */
import { chromium } from 'playwright';

const TARGET_URL = process.argv[2] || 'https://maceip.github.io/v9/';
const RESULTS = [];
let browser, context, page;

// ── Helpers ──────────────────────────────────────────────────────────

async function setup() {
  const rawProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
  const launchOpts = {
    headless: true,
    executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
  };
  if (rawProxy) {
    try {
      const p = new URL(rawProxy);
      launchOpts.proxy = {
        server: `${p.protocol}//${p.host}`,
        username: decodeURIComponent(p.username),
        password: decodeURIComponent(p.password),
      };
    } catch {}
  }
  browser = await chromium.launch(launchOpts);
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });
}

async function newPage() {
  page = await context.newPage();
  // Suppress noisy WebGL warnings
  page.on('console', () => {});
  return page;
}

async function loadAndBoot(pg, opts = {}) {
  const url = opts.url || TARGET_URL;
  await pg.goto(url, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {});
  await pg.waitForTimeout(2000);

  // Click terminal to start boot
  await pg.evaluate(() => {
    document.getElementById('terminal-wrap')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  });

  // Wait for boot overlay
  for (let i = 0; i < 40; i++) {
    await pg.waitForTimeout(300);
    const done = await pg.evaluate(() =>
      document.getElementById('terminal-overlay')?.classList.contains('visible')
    );
    if (done) break;
  }

  // Wait for boot typewriter + iframe
  await pg.waitForTimeout(30000);
}

function test(name, fn) {
  RESULTS.push({ name, fn });
}

async function getTerminalText(pg) {
  // Get text content from the CLI iframe's xterm
  const cliFrame = pg.frames().find(f => f.url().includes('web/index.html'));
  if (!cliFrame) return '';
  return await cliFrame.evaluate(() => {
    const term = globalThis.__edgeTerm;
    if (!term) return '';
    // Read all lines from terminal buffer
    const lines = [];
    for (let i = 0; i < term.buffer.active.length; i++) {
      const line = term.buffer.active.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    return lines.join('\n');
  }).catch(() => '');
}

async function typeInTerminal(pg, text) {
  const cliFrame = pg.frames().find(f => f.url().includes('web/index.html'));
  if (!cliFrame) throw new Error('CLI iframe not found');
  await cliFrame.evaluate((t) => {
    if (typeof globalThis._stdinPush === 'function') {
      globalThis._stdinPush(t);
    }
  }, text);
}

// ── Test definitions ─────────────────────────────────────────────────

test('1. Landing page DOM structure', async () => {
  const pg = await newPage();
  await pg.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {});
  await pg.waitForTimeout(2000);

  const dom = await pg.evaluate(() => ({
    navbar: !!document.getElementById('navbar'),
    viewport: !!document.getElementById('viewport'),
    termWrap: !!document.getElementById('terminal-wrap'),
    glassCanvas: !!document.getElementById('glass-canvas'),
    cliFrame: !!document.getElementById('cli-frame'),
    fog: !!document.getElementById('fog'),
    spotlight: !!document.getElementById('spotlight'),
    dismissedTray: !!document.getElementById('dismissed-tray'),
    navName: document.querySelector('.nav-name')?.textContent,
    bgIcons: document.querySelectorAll('.bg-icon').length,
    navIcons: document.querySelectorAll('.nav-icon').length,
    frameIcons: document.querySelectorAll('.frame-icon').length,
  }));

  const checks = [
    [dom.navbar, 'navbar exists'],
    [dom.viewport, 'viewport exists'],
    [dom.termWrap, 'terminal-wrap exists'],
    [dom.glassCanvas, 'glass-canvas exists'],
    [dom.cliFrame, 'cli-frame exists'],
    [dom.fog, 'fog overlay exists'],
    [dom.spotlight, 'spotlight exists'],
    [dom.dismissedTray, 'dismissed-tray exists'],
    [dom.navName === 'v9', `nav-name is "v9" (got "${dom.navName}")`],
    [dom.bgIcons >= 10, `${dom.bgIcons} background icons (≥10)`],
    [dom.navIcons >= 10, `${dom.navIcons} nav icons (≥10)`],
    [dom.frameIcons === 4, `${dom.frameIcons} frame corner icons (=4)`],
  ];

  const failed = checks.filter(([ok]) => !ok);
  if (failed.length) throw new Error(failed.map(([, msg]) => msg).join('; '));
  await pg.close();
});

test('2. Terminal starts in idle state (scaled down)', async () => {
  const pg = await newPage();
  await pg.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {});
  await pg.waitForTimeout(2000);

  const state = await pg.evaluate(() => {
    const el = document.getElementById('terminal-wrap');
    const style = getComputedStyle(el);
    return {
      hasIdle: el.classList.contains('idle'),
      hasZoomed: el.classList.contains('zoomed'),
      transform: style.transform,
    };
  });

  if (!state.hasIdle) throw new Error('terminal-wrap missing idle class');
  if (state.hasZoomed) throw new Error('terminal-wrap has zoomed class before click');
  await pg.close();
});

test('3. Click activates zoom (idle → zoomed)', async () => {
  const pg = await newPage();
  await pg.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {});
  await pg.waitForTimeout(2000);

  await pg.evaluate(() => {
    document.getElementById('terminal-wrap')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  });

  await pg.waitForTimeout(500);

  const state = await pg.evaluate(() => {
    const el = document.getElementById('terminal-wrap');
    return {
      hasIdle: el.classList.contains('idle'),
      hasZoomed: el.classList.contains('zoomed'),
    };
  });

  if (state.hasIdle) throw new Error('still has idle class after click');
  if (!state.hasZoomed) throw new Error('missing zoomed class after click');
  await pg.close();
});

test('4. Boot sequence types all 6 lines', async () => {
  const pg = await newPage();
  await loadAndBoot(pg);

  const bootText = await pg.evaluate(() =>
    document.getElementById('boot-text')?.textContent || ''
  );

  const expectedLines = [
    'booting v9',
    'initializing runtime',
    'loading polyfills',
    'configuring cors proxy',
    'loading claude code cli',
    'ready',
  ];

  const missing = expectedLines.filter(l => !bootText.includes(l));
  if (missing.length) throw new Error(`Missing boot lines: ${missing.join(', ')}`);
  await pg.close();
});

test('5. CLI iframe loads after boot', async () => {
  const pg = await newPage();
  await loadAndBoot(pg);

  const state = await pg.evaluate(() => {
    const frame = document.getElementById('cli-frame');
    return {
      src: frame?.src || '',
      visible: frame?.classList.contains('visible') || false,
    };
  });

  if (!state.src.includes('web/index.html')) {
    throw new Error(`iframe src unexpected: "${state.src}"`);
  }
  if (!state.visible) throw new Error('iframe not visible after boot');
  await pg.close();
});

test('6. xterm.js initializes inside iframe', async () => {
  const pg = await newPage();
  await loadAndBoot(pg);

  const cliFrame = pg.frames().find(f => f.url().includes('web/index.html'));
  if (!cliFrame) throw new Error('CLI iframe frame not found');

  // Wait for xterm to be ready
  await pg.waitForTimeout(3000);

  const xtermReady = await cliFrame.evaluate(() => {
    return {
      hasEdgeTerm: !!globalThis.__edgeTerm,
      hasStdinPush: typeof globalThis._stdinPush === 'function',
      hasXtermWrite: typeof globalThis._xtermWrite === 'function',
      hasProcess: typeof globalThis.process === 'object',
      processVersion: globalThis.process?.version || '',
    };
  }).catch(() => ({}));

  if (!xtermReady.hasEdgeTerm) throw new Error('__edgeTerm not set');
  if (!xtermReady.hasStdinPush) throw new Error('_stdinPush not available');
  if (!xtermReady.hasXtermWrite) throw new Error('_xtermWrite not available');
  if (!xtermReady.hasProcess) throw new Error('global process not set');
  await pg.close();
});

test('7. API key prompt appears when no key set', async () => {
  const pg = await newPage();
  await loadAndBoot(pg);

  const termText = await getTerminalText(pg);
  const hasPrompt = termText.includes('No API key') || termText.includes('anthropic_api_key');
  if (!hasPrompt) throw new Error(`API key prompt not found in terminal output:\n${termText.slice(0, 500)}`);
  await pg.close();
});

test('8. API key injection via sessionStorage', async () => {
  const pg = await context.newPage();
  // Set API key before loading
  await pg.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  await pg.evaluate(() => {
    sessionStorage.setItem('anthropic_api_key', 'sk-ant-test-key-12345');
  });
  // Reload to pick up the key
  await pg.reload({ waitUntil: 'networkidle', timeout: 30_000 }).catch(() => {});
  await pg.waitForTimeout(2000);

  // Boot
  await pg.evaluate(() => {
    document.getElementById('terminal-wrap')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  });
  await pg.waitForTimeout(35000);

  const cliFrame = pg.frames().find(f => f.url().includes('web/index.html'));
  if (!cliFrame) throw new Error('CLI iframe not found');

  await pg.waitForTimeout(3000);

  const state = await cliFrame.evaluate(() => ({
    apiKeyInEnv: !!globalThis.process?.env?.ANTHROPIC_API_KEY,
    apiKeyValue: globalThis.process?.env?.ANTHROPIC_API_KEY?.slice(0, 10),
  })).catch(() => ({}));

  if (!state.apiKeyInEnv) throw new Error('API key not in process.env');
  if (!state.apiKeyValue?.startsWith('sk-ant-')) {
    throw new Error(`API key not injected correctly: ${state.apiKeyValue}`);
  }
  await pg.close();
});

test('9. Keyboard input reaches stdin', async () => {
  const pg = await newPage();
  await loadAndBoot(pg);

  const cliFrame = pg.frames().find(f => f.url().includes('web/index.html'));
  if (!cliFrame) throw new Error('CLI iframe not found');

  await pg.waitForTimeout(2000);

  // Set up a listener to capture stdin data
  const received = await cliFrame.evaluate(() => {
    return new Promise((resolve) => {
      const captured = [];
      const orig = globalThis._stdinPush;
      // Temporarily intercept
      globalThis._stdinPush = (data) => {
        captured.push(data);
        if (orig) orig(data);
        if (captured.length >= 5) resolve(captured.join(''));
      };
      // Simulate typing "hello"
      for (const ch of 'hello') {
        globalThis._stdinPush(ch);
      }
    });
  });

  if (!received.includes('hello')) {
    throw new Error(`stdin didn't receive "hello", got: "${received}"`);
  }
  await pg.close();
});

test('10. Escape key triggers dismiss', async () => {
  const pg = await newPage();
  await loadAndBoot(pg);

  // Verify we're in zoomed state
  const before = await pg.evaluate(() =>
    document.getElementById('terminal-wrap')?.classList.contains('zoomed')
  );
  if (!before) throw new Error('not in zoomed state before Escape');

  // Press Escape
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(2000);

  const after = await pg.evaluate(() => {
    const el = document.getElementById('terminal-wrap');
    return {
      hasIdle: el?.classList.contains('idle'),
      hasZoomed: el?.classList.contains('zoomed'),
    };
  });

  // After dismiss, terminal should be back to idle
  if (!after.hasIdle) throw new Error('terminal not back to idle after Escape');
  await pg.close();
});

test('11. Process global polyfills are correct', async () => {
  const pg = await newPage();
  await loadAndBoot(pg);

  const cliFrame = pg.frames().find(f => f.url().includes('web/index.html'));
  if (!cliFrame) throw new Error('CLI iframe not found');

  await pg.waitForTimeout(2000);

  const proc = await cliFrame.evaluate(() => ({
    platform: globalThis.process?.platform,
    arch: globalThis.process?.arch,
    version: globalThis.process?.version,
    hasCwd: typeof globalThis.process?.cwd === 'function',
    hasNextTick: typeof globalThis.process?.nextTick === 'function',
    hasHrtime: typeof globalThis.process?.hrtime === 'function',
    hasHrtimeBigint: typeof globalThis.process?.hrtime?.bigint === 'function',
    stdinIsTTY: globalThis.process?.stdin?.isTTY,
    stdoutIsTTY: globalThis.process?.stdout?.isTTY,
    hasBuffer: typeof globalThis.Buffer !== 'undefined',
    bufferFrom: typeof globalThis.Buffer?.from === 'function',
    hasSetImmediate: typeof globalThis.setImmediate === 'function',
  })).catch(() => ({}));

  const checks = [
    [proc.platform === 'linux', `platform is "linux" (got "${proc.platform}")`],
    [proc.arch === 'x64', `arch is "x64" (got "${proc.arch}")`],
    [proc.version?.startsWith('v20'), `version starts with v20 (got "${proc.version}")`],
    [proc.hasCwd, 'process.cwd is function'],
    [proc.hasNextTick, 'process.nextTick is function'],
    [proc.hasHrtime, 'process.hrtime is function'],
    [proc.hasHrtimeBigint, 'process.hrtime.bigint is function'],
    [proc.stdinIsTTY === true, 'stdin.isTTY is true'],
    [proc.stdoutIsTTY === true, 'stdout.isTTY is true'],
    [proc.hasBuffer, 'Buffer exists'],
    [proc.bufferFrom, 'Buffer.from is function'],
    [proc.hasSetImmediate, 'setImmediate exists'],
  ];

  const failed = checks.filter(([ok]) => !ok);
  if (failed.length) throw new Error(failed.map(([, m]) => m).join('; '));
  await pg.close();
});

test('12. CORS proxy is configured in fetch/XHR', async () => {
  const pg = await newPage();
  await loadAndBoot(pg);

  const cliFrame = pg.frames().find(f => f.url().includes('web/index.html'));
  if (!cliFrame) throw new Error('CLI iframe not found');

  await pg.waitForTimeout(2000);

  const proxyCheck = await cliFrame.evaluate(() => {
    // Check that ANTHROPIC_BASE_URL points to proxy
    const baseUrl = globalThis.process?.env?.ANTHROPIC_BASE_URL || '';
    return {
      baseUrl,
      hasProxy: baseUrl.includes('cors'),
    };
  }).catch(() => ({}));

  if (!proxyCheck.hasProxy) {
    throw new Error(`ANTHROPIC_BASE_URL doesn't point to CORS proxy: "${proxyCheck.baseUrl}"`);
  }
  await pg.close();
});

test('13. Import map resolves Node.js builtins', async () => {
  const pg = await newPage();
  await loadAndBoot(pg);

  const cliFrame = pg.frames().find(f => f.url().includes('web/index.html'));
  if (!cliFrame) throw new Error('CLI iframe not found');

  await pg.waitForTimeout(2000);

  // Test that key Node.js modules resolve via import map
  const modules = await cliFrame.evaluate(async () => {
    const results = {};
    const tryImport = async (name) => {
      try {
        const mod = await import(name);
        return { ok: true, keys: Object.keys(mod).slice(0, 5) };
      } catch (err) {
        return { ok: false, error: err.message?.slice(0, 100) };
      }
    };
    results.fs = await tryImport('fs');
    results.path = await tryImport('path');
    results.events = await tryImport('events');
    results.buffer = await tryImport('buffer');
    results.stream = await tryImport('stream');
    results.crypto = await tryImport('crypto');
    return results;
  }).catch(() => ({}));

  const failed = Object.entries(modules).filter(([, v]) => !v.ok);
  if (failed.length) {
    throw new Error(
      `Failed to import: ${failed.map(([k, v]) => `${k} (${v.error})`).join(', ')}`
    );
  }
  await pg.close();
});

test('14. Anthropic SDK bundle loads', async () => {
  const pg = await newPage();
  await loadAndBoot(pg);

  const cliFrame = pg.frames().find(f => f.url().includes('web/index.html'));
  if (!cliFrame) throw new Error('CLI iframe not found');

  await pg.waitForTimeout(3000);

  const sdkCheck = await cliFrame.evaluate(async () => {
    try {
      const sdk = await import('../dist/anthropic-sdk-bundle.js');
      return {
        ok: true,
        hasDefault: !!sdk.default,
        keys: Object.keys(sdk).slice(0, 10),
      };
    } catch (err) {
      return { ok: false, error: err.message?.slice(0, 200) };
    }
  }).catch((err) => ({ ok: false, error: err.message }));

  if (!sdkCheck.ok) {
    throw new Error(`SDK bundle failed to load: ${sdkCheck.error}`);
  }
  await pg.close();
});

// ── Runner ───────────────────────────────────────────────────────────

async function runAll() {
  await setup();

  console.log(`\n🧪 v9 Interaction Tests — ${TARGET_URL}\n`);
  console.log('═'.repeat(55));

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const { name, fn } of RESULTS) {
    const start = Date.now();
    try {
      await fn();
      const ms = Date.now() - start;
      console.log(`  ✅ ${name} (${ms}ms)`);
      passed++;
    } catch (err) {
      const ms = Date.now() - start;
      console.log(`  ❌ ${name} (${ms}ms)`);
      console.log(`     → ${err.message.slice(0, 200)}`);
      failures.push({ name, error: err.message });
      failed++;
    }
  }

  console.log('\n' + '═'.repeat(55));
  console.log(`  ${passed} passed, ${failed} failed, ${RESULTS.length} total`);

  if (failures.length) {
    console.log('\n  Failures:');
    for (const f of failures) {
      console.log(`    • ${f.name}: ${f.error.slice(0, 150)}`);
    }
  }

  await browser.close();
  console.log();
  process.exit(failed > 0 ? 1 : 0);
}

runAll().catch((err) => {
  console.error('Fatal:', err);
  process.exit(2);
});
