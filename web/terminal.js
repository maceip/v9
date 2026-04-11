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
// Anthropic API host; loopback pages get default proxy :8081 via node-polyfills (see TRANSPORT.md).
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';

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
    const scriptArg = (() => {
      try {
        const raw = String(bundleUrl || '').split('?')[0];
        if (raw.startsWith('http://') || raw.startsWith('https://')) {
          return new URL(raw).pathname || DEFAULT_BUNDLE_ENTRY;
        }
        return raw || DEFAULT_BUNDLE_ENTRY;
      } catch {
        return DEFAULT_BUNDLE_ENTRY;
      }
    })();
    const argv = options.argv || ['node', scriptArg];
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

/** Optional pre-bundled @anthropic-ai/sdk (scripts/bundle-sdk.sh). Silent if missing — vendor resolves via import map. */
async function registerOptionalVendorSdk(runtime) {
  try {
    const sdkBundle = await import('../dist/anthropic-sdk-bundle.js');
    runtime._registerBuiltinOverride('@anthropic-ai/sdk', sdkBundle);
    runtime._registerBuiltinOverride('@anthropic-ai/sdk/index', sdkBundle);
  } catch {
    // Expected in normal builds; uncomment for debugging:
    // console.debug('[sdk] No dist/anthropic-sdk-bundle.js — using default SDK resolution');
  }
}

async function boot() {
  await loadXterm();

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontWeight: 'bold',
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

  // Debounced fit to avoid thrashing
  let fitTimer = null;
  function debouncedFit() {
    if (fitTimer) return;
    fitTimer = setTimeout(() => {
      fitTimer = null;
      if (fitAddon) fitAddon.fit();
    }, 50);
  }

  if (fitAddon) {
    fitAddon.fit();
    // Refit after layout settles
    setTimeout(() => fitAddon.fit(), 100);
    setTimeout(() => fitAddon.fit(), 500);
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

  // Redirect console.log/error/warn to xterm so app output is visible
  // in the terminal, not just browser devtools.
  const _nativeLog = console.log.bind(console);
  const _nativeError = console.error.bind(console);
  const _nativeWarn = console.warn.bind(console);
  console.log = (...args) => {
    const text = args.map(a => typeof a === 'string' ? a : JSON.stringify(a) ?? String(a)).join(' ') + '\r\n';
    if (globalThis._xtermWrite) globalThis._xtermWrite(text);
    _nativeLog(...args);
  };
  console.error = (...args) => {
    const text = args.map(a => typeof a === 'string' ? a : JSON.stringify(a) ?? String(a)).join(' ') + '\r\n';
    if (globalThis._xtermWrite) globalThis._xtermWrite(`\x1b[31m${text}\x1b[0m`);
    _nativeError(...args);
  };
  console.warn = (...args) => {
    const text = args.map(a => typeof a === 'string' ? a : JSON.stringify(a) ?? String(a)).join(' ') + '\r\n';
    if (globalThis._xtermWrite) globalThis._xtermWrite(`\x1b[33m${text}\x1b[0m`);
    _nativeWarn(...args);
  };

  const config = getConfig();
  let runtime = null;
  let processBridge = null;

  try {
    const ts = Date.now();
    const napiRoot = new URL('../napi-bridge/', import.meta.url).href;
    const [{ initEdgeJS }, bridgeModule] = await Promise.all([
      import(`${napiRoot}index.js?t=${ts}`),
      import(`${napiRoot}browser-builtins.js`),
    ]);

    processBridge = bridgeModule.processBridge;
    globalThis.process = processBridge;

    const initialFiles = globalThis.__edgeInitialFiles && typeof globalThis.__edgeInitialFiles === 'object'
      ? globalThis.__edgeInitialFiles
      : {};

    // Resolve dist/ relative to this module so /web/index.html setups fetch
    // /dist/edgejs.{js,wasm} (not /web/edgejs.wasm from fetch('./edgejs.wasm')).
    const moduleUrl = globalThis.__edgeModuleUrl || new URL('../dist/edgejs.js', import.meta.url).href;
    const wasmUrl = globalThis.__edgeWasmUrl || new URL('../dist/edgejs.wasm', import.meta.url).href;

    runtime = await initEdgeJS({
      moduleUrl,
      wasmUrl,
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

    await registerOptionalVendorSdk(runtime);

    const controller = createCliController({ term, runtime, processBridge, config });
    globalThis.__edgeCli = controller;
    globalThis.__edgeTerm = term;
    globalThis.__edgeRuntime = runtime;
    globalThis.__edgeProcess = processBridge;

    // Always start the interactive shell first — it's the primary experience.
    // If a bundle is configured, the shell launches it (like typing `node app.js`).
    // When the app exits, the user is back at the prompt.
    try {
      const { createShell } = await import('../napi-bridge/shell.js');
      const shell = createShell({
        write: (data) => globalThis._xtermWrite?.(data),
        cwd: DEFAULT_WORKSPACE,
        env: baseEnv(getAnthropicKey()),
      });
      globalThis.__edgeShell = shell;
      globalThis._stdinPush = (data) => shell.feed(data);
      term.writeln('\x1b[36mv9\x1b[0m — Node.js in the browser');
      term.writeln('Type \x1b[33mnpm install <pkg>\x1b[0m to install packages, or any shell command.\r\n');

      if (config.appBundle && config.autorun) {
        // Auto-run the bundle through the shell — output goes to terminal,
        // and when it exits the user gets the prompt back.
        shell.prompt();
        shell.feed(`node ${config.appBundle}\n`);
      } else {
        shell.prompt();
      }
    } catch (shellErr) {
      _nativeError('[shell] Failed to start shell:', shellErr);
      term.writeln(`\x1b[33m[shell] ${_safe(shellErr.message)}\x1b[0m`);

      // Fallback: run bundle directly if shell fails
      if (config.appBundle && config.autorun) {
        await controller.start();
      }
    }
  } catch (err) {
    _nativeError('[edgejs] Boot error:', err);
    term.writeln(`\x1b[31m${_safe(err.message)}\x1b[0m`);
  }

  // Allow Ctrl+C to copy when there's a selection, Ctrl+V to paste
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection());
      return false; // prevent xterm from handling
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      navigator.clipboard.readText().then(text => {
        if (text) term.paste(text);
      }).catch(() => {});
      return false;
    }
    return true;
  });

  term.onData((data) => {
    if (runtime && typeof runtime.pushStdin === 'function') {
      runtime.pushStdin(data);
      return;
    }
    if (typeof globalThis._stdinPush === 'function') {
      globalThis._stdinPush(data);
    }
  });

  window.addEventListener('resize', debouncedFit);

  if (fitAddon) {
    new ResizeObserver(debouncedFit).observe(container);

    window.addEventListener('message', (e) => {
      if (e.data?.type === 'v9:refit') {
        // Immediate + delayed to catch layout settling
        fitAddon.fit();
        setTimeout(() => fitAddon.fit(), 150);
      }
    });
  }

  term.onResize(({ cols, rows }) => {
    if (runtime && typeof runtime.setTerminalSize === 'function') {
      runtime.setTerminalSize(cols, rows);
    }
    syncProcessTerminalSize(processBridge, cols, rows);
  });

  // ── Mobile copy/paste convenience buttons ──
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isMobile) {
    // ── Mobile action bar — Copy URL / Open / Paste ──
    // Shows when a URL is detected in terminal output (especially OAuth URLs).
    // URLs in xterm.js wrap across lines and can't be selected on mobile.
    const actionBar = document.createElement('div');
    actionBar.style.cssText = 'position:fixed;top:max(4px, env(safe-area-inset-top, 0px));left:50%;transform:translateX(-50%);z-index:250;display:none;flex-direction:row;gap:6px;padding:4px 6px;background:rgba(12,12,20,0.94);border:1px solid rgba(255,255,255,0.12);border-radius:10px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 4px 16px rgba(0,0,0,0.5)';

    function makeBarBtn(label, accent) {
      const btn = document.createElement('button');
      btn.textContent = label;
      const color = accent ? 'color:#9bff00;border-color:rgba(155,255,0,0.3)' : 'color:rgba(220,220,230,0.8);border-color:rgba(255,255,255,0.12)';
      btn.style.cssText = `padding:6px 14px;min-height:36px;border:1px solid;border-radius:8px;background:rgba(25,25,40,0.9);font:600 12px "IBM Plex Mono",monospace;cursor:pointer;touch-action:manipulation;${color};transition:transform 0.08s ease,opacity 0.15s ease`;
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); btn.style.transform = 'scale(0.93)'; }, { passive: false });
      btn.addEventListener('touchend', (e) => { e.preventDefault(); btn.style.transform = ''; }, { passive: false });
      return btn;
    }

    const copyUrlBtn = makeBarBtn('Copy URL', true);
    const openUrlBtn = makeBarBtn('Open', true);
    const pasteBtn = makeBarBtn('Paste', false);

    let detectedUrl = '';

    copyUrlBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (!detectedUrl) return;
      navigator.clipboard.writeText(detectedUrl).then(() => {
        copyUrlBtn.textContent = 'Copied!';
        setTimeout(() => { copyUrlBtn.textContent = 'Copy URL'; }, 1200);
      }).catch(() => {});
    }, { passive: false });

    openUrlBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (detectedUrl) window.open(detectedUrl, '_blank', 'noopener');
    }, { passive: false });

    pasteBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      navigator.clipboard.readText().then(text => {
        if (!text) return;
        if (runtime && typeof runtime.pushStdin === 'function') runtime.pushStdin(text);
        else if (typeof globalThis._stdinPush === 'function') globalThis._stdinPush(text);
        else term.paste(text);
      }).catch(() => {});
    }, { passive: false });

    actionBar.appendChild(copyUrlBtn);
    actionBar.appendChild(openUrlBtn);
    actionBar.appendChild(pasteBtn);
    container.appendChild(actionBar);

    function showActionBar(url) {
      detectedUrl = url;
      actionBar.style.display = 'flex';
    }

    // URL detection — concatenate wrapped lines to catch multi-line URLs
    const URL_START = /https?:\/\//;
    const URL_CHAR = /[^\s\x00-\x1f"'`<>(){}[\]]/;
    let lastDetectedUrl = '';
    let scanScheduled = false;

    const origWrite = globalThis._xtermWrite;
    globalThis._xtermWrite = (data) => {
      origWrite(data);
      if (!scanScheduled) {
        scanScheduled = true;
        setTimeout(() => {
          scanScheduled = false;
          scanForUrls();
        }, 300);
      }
    };

    function scanForUrls() {
      const buf = term.buffer.active;
      // Build a text block from the last 20 rows, joining wrapped lines
      const scanRows = Math.min(20, buf.length);
      const startRow = buf.length - scanRows;
      let block = '';
      for (let r = startRow; r < buf.length; r++) {
        const line = buf.getLine(r);
        if (!line) continue;
        const text = line.translateToString(true);
        // If line is wrapped (isWrapped), don't add separator
        const isWrapped = line.isWrapped;
        if (isWrapped) {
          block += text.trimEnd();
        } else {
          block += '\n' + text;
        }
      }

      // Find all URLs in the concatenated block
      const urlRe = /https?:\/\/[^\s"'`<>(){}\[\]\x00-\x1f]{8,}/g;
      const matches = [...block.matchAll(urlRe)];
      if (matches.length > 0) {
        const url = matches[matches.length - 1][0];
        if (url !== lastDetectedUrl) {
          lastDetectedUrl = url;
          showActionBar(url);
        }
      }
    }

    // Always show paste after terminal has content
    setTimeout(() => {
      if (buf => buf && buf.length > 2) {
        actionBar.style.display = 'flex';
      }
    }, 2000);
  }

  globalThis.__edgeTerm = term;
  globalThis.__edgeRuntime = runtime;

  // ── HUD message handlers (npm inject / file drop from parent) ──
  window.addEventListener('message', async (e) => {
    if (!e.data || typeof e.data.type !== 'string') return;
    if (e.data.type === 'v9:inject-npm') {
      const pkg = e.data.package;
      term.writeln(`\r\n\x1b[32m[hud]\x1b[0m npm install ${pkg}`);
      if (runtime && typeof runtime.pushStdin === 'function') {
        runtime.pushStdin(`npm install ${pkg}\n`);
      }
    }
    if (e.data.type === 'v9:set-theme') {
      const t = e.data.theme;
      if (t && term.options) {
        term.options.theme = t;
        document.body.style.background = t.background || '';
      }
    }
    if (e.data.type === 'v9:inject-file') {
      const { name, content } = e.data;
      term.writeln(`\r\n\x1b[32m[hud]\x1b[0m injecting file: ${name} (${content.length} bytes)`);
      if (runtime && typeof runtime.writeFile === 'function') {
        try {
          runtime.writeFile(`/home/user/${name}`, content);
          term.writeln(`\x1b[32m[hud]\x1b[0m wrote /home/user/${name}`);
        } catch (err) {
          term.writeln(`\x1b[31m[hud]\x1b[0m write failed: ${err.message || err}`);
        }
      }
    }
    // Re-fit terminal to container (called by parent after zoom completes)
    if (e.data.type === 'v9:refit') {
      if (fitAddon) {
        fitAddon.fit();
        if (runtime && typeof runtime.setTerminalSize === 'function') {
          runtime.setTerminalSize(term.cols, term.rows);
        }
        syncProcessTerminalSize(processBridge, term.cols, term.rows);
      }
    }
    // D-pad key input from parent
    if (e.data.type === 'v9:key-input') {
      const seq = e.data.seq;
      if (seq && runtime && typeof runtime.pushStdin === 'function') {
        runtime.pushStdin(seq);
      } else if (seq && typeof globalThis._stdinPush === 'function') {
        globalThis._stdinPush(seq);
      }
    }
  });

  // ── Swipe-to-dismiss detection (forward to parent since iframe captures touch) ──
  let _swipeTouch = null;
  document.addEventListener('touchstart', (e) => {
    if (!e.touches[0]) return;
    const t = e.touches[0];
    _swipeTouch = { sx: t.clientX, sy: t.clientY, decided: false, startTime: Date.now() };
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!_swipeTouch || _swipeTouch.decided) return;
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - _swipeTouch.sy;
    const dx = t.clientX - _swipeTouch.sx;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 15) {
      _swipeTouch.decided = true;
      // Downward swipe with vertical dominance
      if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        _swipeTouch.swiping = true;
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!_swipeTouch) return;
    if (_swipeTouch.swiping) {
      const elapsed = Date.now() - _swipeTouch.startTime;
      // Only dismiss for deliberate swipes (fast flick or long drag)
      if (elapsed < 500) {
        try {
          window.parent.postMessage({ type: 'v9:swipe-dismiss' }, '*');
        } catch { /* sandboxed */ }
      }
    }
    _swipeTouch = null;
  }, { passive: true });

  // ── Refit on iframe visibility changes ──
  if (fitAddon) {
    // Initial delayed refit to catch late layout
    setTimeout(() => {
      fitAddon.fit();
      if (runtime && typeof runtime.setTerminalSize === 'function') {
        runtime.setTerminalSize(term.cols, term.rows);
      }
      syncProcessTerminalSize(processBridge, term.cols, term.rows);
    }, 300);
  }
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
