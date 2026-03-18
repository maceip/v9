/**
 * Browser smoke validation (headless Chrome via Playwright).
 *
 * Verifies the browser can load edgejs.js/edgejs.wasm and initialize the
 * runtime using the real bridge import object.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer } from './helpers/static-server.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const wasmPath = join(rootDir, 'dist', 'edgejs.wasm');
const jsPath = join(rootDir, 'dist', 'edgejs.js');

console.log('=== Browser Smoke Tests (Playwright + Chrome) ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} — ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

if (!existsSync(wasmPath) || !existsSync(jsPath)) {
  console.log('  FAIL: dist artifacts not found (run make build first)');
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch (error) {
  console.log('  FAIL: playwright-core is not installed');
  console.log(`  HINT: npm install --save-dev playwright-core (${error.message})`);
  process.exit(1);
}

const server = await startStaticServer({
  rootDir,
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
});

let browser;
try {
  const defaultChrome = '/usr/local/bin/google-chrome';
  const executablePath = process.env.CHROME_BIN || process.env.GOOGLE_CHROME_BIN;
  const launchOptions = { headless: true };
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  } else if (existsSync(defaultChrome)) {
    launchOptions.executablePath = defaultChrome;
  }
  browser = await chromium.launch(launchOptions);
} catch (error) {
  await server.close();
  console.log(`  FAIL: could not launch headless browser — ${error.message}`);
  process.exit(1);
}

try {
  const page = await browser.newPage();
  await page.goto(`${server.baseUrl}/`, { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async (baseUrl) => {
    const loadScript = (src) =>
      new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });

    await loadScript(`${baseUrl}/dist/edgejs.js`);
    const { initEdgeJS } = await import(`${baseUrl}/napi-bridge/index.js`);

    if (typeof globalThis.EdgeJSModule !== 'function') {
      throw new Error('EdgeJSModule global was not initialized');
    }

    const rt = await initEdgeJS({
      moduleFactory: globalThis.EdgeJSModule,
      wasmUrl: `${baseUrl}/dist/edgejs.wasm`,
      onStdout: () => {},
      onStderr: () => {},
    });

    const diagnostics = rt.diagnostics();
    return {
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      hasEval: typeof rt.eval === 'function',
      hasRunFile: typeof rt.runFile === 'function',
      missingImports: diagnostics.missingImports,
      importErrors: diagnostics.importErrors,
    };
  }, server.baseUrl);

  test('SharedArrayBuffer is available under COOP/COEP', () => {
    assert(result.sharedArrayBuffer, 'SharedArrayBuffer should be available');
  });

  test('runtime API surface initialized in browser', () => {
    assert(result.hasEval, 'runtime.eval should be a function');
    assert(result.hasRunFile, 'runtime.runFile should be a function');
  });

  test('bridge diagnostics are clean in browser init', () => {
    assert(Object.keys(result.missingImports || {}).length === 0,
      `missing imports detected: ${JSON.stringify(result.missingImports)}`);
    assert(Object.keys(result.importErrors || {}).length === 0,
      `import errors detected: ${JSON.stringify(result.importErrors)}`);
  });
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
