/**
 * Terminal UI - xterm.js integration with EdgeJS runtime.
 *
 * Exposes `globalThis.__edgeCli` so tests (or embedders) can start a bundled
 * Node CLI with deterministic argv/env without depending on interactive flows.
 */

let Terminal, FitAddon, WebLinksAddon;

const DEFAULT_HOME = '/home/user';
const DEFAULT_WORKSPACE = '/workspace';
const DEFAULT_BUNDLE_ENTRY = '/app/bundle.js';
const DEFAULT_ANTHROPIC_BASE_URL = 'http://localhost:8081/anthropic';

async function loadXterm() {
  try {
    const xtermMod = await import('https://cdn.jsdelivr.net/npm/xterm@5.3.0/+esm');
    Terminal = xtermMod.Terminal;
  } catch {
    if (globalThis.Terminal) {
      Terminal = globalThis.Terminal;
    } else {
      throw new Error('xterm.js not available - include via CDN or npm');
    }
  }

  try {
    const fitMod = await import('https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/+esm');
    FitAddon = fitMod.FitAddon;
  } catch {
    FitAddon = null;
  }

  try {
    const linksMod = await import('https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/+esm');
    WebLinksAddon = linksMod.WebLinksAddon;
  } catch {
    WebLinksAddon = null;
  }
}

function getConfig() {
  const params = new URLSearchParams(globalThis.location?.search || '');
  return {
    proxyUrl: params.get('proxy') || 'http://localhost:8081',
    appBundle: params.get('bundle') || '/dist/app-bundle.js',
    autorun: params.get('autorun') !== '0',
  };
}

function getAnthropicKey() {
  return sessionStorage.getItem('anthropic_api_key') || '';
}

function baseEnv(apiKey) {
  return {
    HOME: DEFAULT_HOME,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    SHELL: '/bin/bash',
    USER: 'user',
    LANG: 'en_US.UTF-8',
    PATH: '/usr/local/bin:/usr/bin:/bin',
    ANTHROPIC_BASE_URL: DEFAULT_ANTHROPIC_BASE_URL,
    ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
  };
}

function writeBanner(term, { apiKey, bundleUrl, autorun }) {
  term.writeln('\x1b[1;34m╭──────────────────────────────────╮\x1b[0m');
  term.writeln('\x1b[1;34m│\x1b[0m  \x1b[1;37mNode.js in the browser\x1b[0m          \x1b[1;34m│\x1b[0m');
  term.writeln('\x1b[1;34m╰──────────────────────────────────╯\x1b[0m');
  term.writeln('');
  term.writeln('\x1b[32m✓ Runtime initialized\x1b[0m');
  if (apiKey) {
    term.writeln('\x1b[32m✓ Anthropic API key configured\x1b[0m');
  } else {
    term.writeln('\x1b[33m⚠ No Anthropic API key configured\x1b[0m');
    term.writeln('\x1b[90mSet via: sessionStorage.setItem("anthropic_api_key", "sk-ant-...")\x1b[0m');
    term.writeln('\x1b[90mThen reload the page.\x1b[0m');
  }
  term.writeln(`\x1b[32m✓ Anthropic proxy path: ${DEFAULT_ANTHROPIC_BASE_URL}\x1b[0m`);
  term.writeln(`\x1b[32m✓ Workspace root: ${DEFAULT_WORKSPACE}\x1b[0m`);
  if (bundleUrl) {
    const mode = autorun ? 'autorun enabled' : 'deferred start';
    term.writeln(`\x1b[32m✓ App bundle: ${bundleUrl} (${mode})\x1b[0m`);
  } else {
    term.writeln('\x1b[90mNo app bundle. Example: ?bundle=/dist/app-bundle.js\x1b[0m');
  }
  
}

function ensureDirectory(runtime, path) {
  try {
    runtime.fs.mkdirSync(path, { recursive: true });
  } catch {
    // Directory may already exist in MEMFS.
  }
}

function appProjectStateDir(cwd) {
  const projectKey = String(cwd || DEFAULT_WORKSPACE).replace(/[\\/]/g, '-');
  return `${DEFAULT_HOME}/.node-in-tab/projects/${projectKey}`;
}

function configureProcessBridge(processBridge, { argv, cwd, apiKey, extraEnv = {} }) {
  const nextEnv = {
    ...baseEnv(apiKey),
    ...extraEnv,
  };

  for (const key of Object.keys(processBridge.env || {})) {
    delete processBridge.env[key];
  }
  for (const [key, value] of Object.entries(nextEnv)) {
    processBridge.env[key] = value;
  }

  if (!Array.isArray(processBridge.argv)) {
    processBridge.argv = [];
  }
  processBridge.argv.length = 0;
  for (const arg of argv) {
    processBridge.argv.push(arg);
  }

  processBridge.argv0 = argv[0] || 'node';
  processBridge.execArgv = [];
  processBridge.execPath = '/usr/local/bin/node';
  processBridge.title = 'node-in-tab';
  processBridge.exitCode = undefined;
  processBridge.chdir(cwd);
  globalThis.process = processBridge;
}

function resetProcessBridge(processBridge) {
  if (typeof processBridge.removeAllListeners === 'function') {
    for (const eventName of ['beforeExit', 'exit', 'SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection', 'warning']) {
      processBridge.removeAllListeners(eventName);
    }
  }
  if (typeof processBridge.stdin?.removeAllListeners === 'function') {
    processBridge.stdin.removeAllListeners();
  }
}

function syncProcessTerminalSize(processBridge, cols, rows) {
  for (const stream of [processBridge?.stdout, processBridge?.stderr]) {
    if (!stream) {
      continue;
    }
    stream.columns = cols;
    stream.rows = rows;
  }
}

function resolveCliMain(cliModule) {
  const main = cliModule.main || cliModule.default?.main || cliModule.default;
  return typeof main === 'function' ? main : null;
}

function createCliController({ term, runtime, processBridge, config }) {
  let currentExitPromise = null;
  let resolveCurrentExit = null;
  let lastExitCode = null;
  let lastError = null;
  let runCounter = 0;

  const finishExit = (code) => {
    lastExitCode = code;
    if (resolveCurrentExit) {
      resolveCurrentExit(code);
      resolveCurrentExit = null;
    }
  };

  const recordExit = (code = 0) => {
    if (lastExitCode !== null) {
      return lastExitCode;
    }
    term.writeln(`\r\n\x1b[90m[process exit ${code}]\x1b[0m`);
    finishExit(code);
    return code;
  };

  const start = async (options = {}) => {
    const bundleUrl = options.bundle || config.appBundle;
    if (!bundleUrl) {
      throw new Error('No app bundle configured (?bundle=…)');
    }

    const apiKey = options.apiKey ?? getAnthropicKey();
    const cwd = options.cwd || DEFAULT_WORKSPACE;
    const argv = options.argv || ['node', DEFAULT_BUNDLE_ENTRY];
    const clearTerminal = options.clear !== false;

    runCounter += 1;
    lastExitCode = null;
    lastError = null;
    currentExitPromise = new Promise((resolve) => {
      resolveCurrentExit = resolve;
    });

    if (clearTerminal) {
      term.reset();
    }
    writeBanner(term, { apiKey, bundleUrl, autorun: false });
    term.writeln('');
    term.writeln(`\x1b[32m✓ Launching bundled app (run ${runCounter})\x1b[0m`);
    term.writeln('');

    ensureDirectory(runtime, DEFAULT_HOME);
    ensureDirectory(runtime, `${DEFAULT_HOME}/.node-in-tab`);
    ensureDirectory(runtime, `${DEFAULT_HOME}/.node-in-tab/projects`);
    ensureDirectory(runtime, appProjectStateDir(cwd));
    ensureDirectory(runtime, DEFAULT_WORKSPACE);
    resetProcessBridge(processBridge);
    configureProcessBridge(processBridge, { argv, cwd, apiKey, extraEnv: options.env || {} });

    processBridge.once('exit', (code = 0) => {
      recordExit(code);
    });

    try {
      const cacheBustedBundleUrl = bundleUrl.includes('?')
        ? `${bundleUrl}&edgeRun=${runCounter}`
        : `${bundleUrl}?edgeRun=${runCounter}`;
      const cliModule = await import(cacheBustedBundleUrl);
      const main = resolveCliMain(cliModule);
      if (main) {
        const launchResult = main(runtime);
        Promise.resolve(launchResult).catch((runtimeError) => {
          lastError = runtimeError;
          term.writeln(`\x1b[31m✗ Bundled app failed: ${_safe(runtimeError.message)}\x1b[0m`);
          finishExit(1);
        });
      }
    } catch (esmError) {
      term.writeln(`\x1b[33m[bundle] ESM load failed: ${_safe(esmError.message)}\x1b[0m`);
      try {
        const response = await fetch(bundleUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const bundleSource = await response.text();
        ensureDirectory(runtime, '/app');
        runtime.fs.writeFileSync(DEFAULT_BUNDLE_ENTRY, bundleSource);
        if (typeof runtime.require?.cache?.delete === 'function') {
          runtime.require.cache.delete(DEFAULT_BUNDLE_ENTRY);
        }
        runtime.require(DEFAULT_BUNDLE_ENTRY, '/app');
      } catch (fallbackError) {
        lastError = fallbackError;
        term.writeln(`\x1b[31m✗ Bundled app failed: ${_safe(fallbackError.message)}\x1b[0m`);
        finishExit(1);
        throw fallbackError;
      }
    }
  };

  const waitForExit = async ({ timeoutMs } = {}) => {
    if (!currentExitPromise) {
      return lastExitCode;
    }
    const exitCodePoll = new Promise((resolve) => {
      const poll = () => {
        if (lastExitCode !== null) {
          resolve(lastExitCode);
          return;
        }
        if (processBridge.exitCode !== undefined) {
          resolve(recordExit(processBridge.exitCode));
          return;
        }
        setTimeout(poll, 100);
      };
      poll();
    });
    if (!timeoutMs) {
      return Promise.race([currentExitPromise, exitCodePoll]);
    }
    return Promise.race([
      currentExitPromise,
      exitCodePoll,
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Timed out waiting for process exit after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  };

  return {
    start,
    waitForExit,
    getState() {
      return {
        argv: Array.from(processBridge.argv || []),
        cwd: typeof processBridge.cwd === 'function' ? processBridge.cwd() : DEFAULT_WORKSPACE,
        runCounter,
        lastExitCode,
        processExitCode: processBridge.exitCode ?? null,
        lastError: lastError?.message || null,
      };
    },
  };
}

async function registerOptionalVendorSdk(runtime, term) {
  try {
    const sdkBundle = await import('../dist/anthropic-sdk-bundle.js');
    runtime._registerBuiltinOverride('@anthropic-ai/sdk', sdkBundle);
    runtime._registerBuiltinOverride('@anthropic-ai/sdk/index', sdkBundle);
  } catch {
    term.writeln('\x1b[33m[sdk] Optional @anthropic-ai/sdk override not present (dist/anthropic-sdk-bundle.js)\x1b[0m');
  }
}

async function boot() {
  await loadXterm();

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
      background: '#1a1b26',
      foreground: '#a9b1d6',
      cursor: '#c0caf5',
      selectionBackground: '#33467c',
    },
  });

  let fitAddon = null;
  if (FitAddon) {
    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
  }
  if (WebLinksAddon) {
    term.loadAddon(new WebLinksAddon());
  }

  const container = document.getElementById('terminal');
  term.open(container);
  if (fitAddon) {
    fitAddon.fit();
  }

  let pendingTerminalWrite = '';
  let terminalWriteScheduled = false;
  globalThis._xtermWrite = (data) => {
    pendingTerminalWrite += String(data);
    if (terminalWriteScheduled) return;
    terminalWriteScheduled = true;
    queueMicrotask(() => {
      terminalWriteScheduled = false;
      if (!pendingTerminalWrite) return;
      const chunk = pendingTerminalWrite;
      pendingTerminalWrite = '';
      term.write(chunk);
    });
  };

  const config = getConfig();
  let runtime = null;
  let processBridge = null;

  try {
    const ts = Date.now();
    const [{ initEdgeJS }, bridgeModule] = await Promise.all([
      import(`../napi-bridge/index.js?t=${ts}`),
      import('../napi-bridge/browser-builtins.js'),
    ]);

    processBridge = bridgeModule.processBridge;
    globalThis.process = processBridge;

    const initialFiles = globalThis.__edgeInitialFiles && typeof globalThis.__edgeInitialFiles === 'object'
      ? globalThis.__edgeInitialFiles
      : {};

    runtime = await initEdgeJS({
      onStdout: (text) => globalThis._xtermWrite?.(text),
      onStderr: (text) => globalThis._xtermWrite?.(text),
      env: baseEnv(getAnthropicKey()),
      files: initialFiles,
    });

    ensureDirectory(runtime, DEFAULT_HOME);
    ensureDirectory(runtime, `${DEFAULT_HOME}/.node-in-tab`);
    ensureDirectory(runtime, DEFAULT_WORKSPACE);
    configureProcessBridge(processBridge, {
      argv: ['node', DEFAULT_BUNDLE_ENTRY],
      cwd: DEFAULT_WORKSPACE,
      apiKey: getAnthropicKey(),
    });

    if (typeof runtime.setTerminalSize === 'function') {
      runtime.setTerminalSize(term.cols, term.rows);
    }
    syncProcessTerminalSize(processBridge, term.cols, term.rows);

    await registerOptionalVendorSdk(runtime, term);

    const controller = createCliController({ term, runtime, processBridge, config });
    globalThis.__edgeCli = controller;
    globalThis.__edgeTerm = term;
    globalThis.__edgeRuntime = runtime;
    globalThis.__edgeProcess = processBridge;

    if (config.appBundle && config.autorun) {
      await controller.start();
    } else {
      writeBanner(term, {
        apiKey: getAnthropicKey(),
        bundleUrl: config.appBundle,
        autorun: config.autorun,
      });
      if (config.appBundle) {
        term.writeln('');
        term.writeln('\x1b[90mDeferred start. Call __edgeCli.start() to run the bundle.\x1b[0m');
      }
    }
  } catch (err) {
    term.writeln(`\x1b[33m[edgejs] Runtime not available: ${_safe(err.message)}\x1b[0m`);
    term.writeln('\x1b[90mTerminal UI loaded - runtime will connect when Wasm is built.\x1b[0m');
  }

  term.onData((data) => {
    if (runtime && typeof runtime.pushStdin === 'function') {
      runtime.pushStdin(data);
      return;
    }
    if (typeof globalThis._stdinPush === 'function') {
      globalThis._stdinPush(data);
    }
  });

  window.addEventListener('resize', () => {
    if (fitAddon) {
      fitAddon.fit();
    }
  });

  term.onResize(({ cols, rows }) => {
    if (runtime && typeof runtime.setTerminalSize === 'function') {
      runtime.setTerminalSize(cols, rows);
    }
    syncProcessTerminalSize(processBridge, cols, rows);
  });

  globalThis.__edgeTerm = term;
  globalThis.__edgeRuntime = runtime;
}

function _safe(str) {
  if (typeof str !== 'string') {
    return String(str || '');
  }
  return str.length > 200 ? `${str.slice(0, 200)}...` : str;
}

boot().catch((err) => {
  console.error('[terminal] Boot failed:', err);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f00;padding:1em';
  pre.textContent = 'Terminal boot failed: ' + (err.message || String(err));
  document.body.replaceChildren(pre);
});
