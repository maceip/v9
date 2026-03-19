/**
 * Terminal UI — xterm.js integration with EdgeJS runtime.
 *
 * Full conversation loop:
 *   1. User types in xterm.js
 *   2. Keyboard data → runtime.pushStdin(data)
 *   3. Claude Code reads stdin, constructs API request
 *   4. https.request() → fetch() proxy → Anthropic API
 *   5. Streaming SSE response → IncomingMessage Readable
 *   6. Claude Code processes response chunks
 *   7. If tool_use: execute tool (file read/write via fs, bash via child_process)
 *   8. Tool result → next API call
 *   9. Final response → process.stdout → xterm.js
 *  10. Loop back to 1
 *
 * SDK bundling (run once):
 *   sh scripts/bundle-sdk.sh
 *
 * CORS proxy (deploy once):
 *   npx wrangler deploy web/cors-proxy-worker.js --name edgejs-cors-proxy
 */

// ─── Dynamic imports for xterm.js (loaded from CDN or node_modules) ──

let Terminal, FitAddon, WebLinksAddon;

async function loadXterm() {
  try {
    const xtermMod = await import('https://cdn.jsdelivr.net/npm/xterm@5.3.0/+esm');
    Terminal = xtermMod.Terminal;
  } catch {
    if (globalThis.Terminal) {
      Terminal = globalThis.Terminal;
    } else {
      throw new Error('xterm.js not available — include via CDN or npm');
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

// ─── Configuration ───────────────────────────────────────────────────

function getConfig() {
  const params = new URLSearchParams(globalThis.location?.search || '');
  return {
    apiKey: params.get('key') || '',
    proxyUrl: params.get('proxy') || '',
    // If no Claude Code bundle, run in SDK-direct mode
    claudeCodeBundle: params.get('bundle') || '',
  };
}

// ─── Runtime initialization ──────────────────────────────────────────

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

  // Load addons
  let fitAddon = null;
  if (FitAddon) {
    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
  }
  if (WebLinksAddon) {
    term.loadAddon(new WebLinksAddon());
  }

  // Mount terminal
  const container = document.getElementById('terminal');
  term.open(container);
  if (fitAddon) fitAddon.fit();

  // ── Load EdgeJS runtime ────────────────────────────────────────────

  const config = getConfig();
  let runtime;

  try {
    const { initEdgeJS } = await import('../napi-bridge/index.js');

    runtime = await initEdgeJS({
      onStdout: (text) => term.write(text),
      onStderr: (text) => term.write(text),
      env: {
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        COLUMNS: String(term.cols),
        LINES: String(term.rows),
        ...(config.apiKey ? { ANTHROPIC_API_KEY: config.apiKey } : {}),
      },
    });

    // Set initial terminal size
    if (typeof runtime.setTerminalSize === 'function') {
      runtime.setTerminalSize(term.cols, term.rows);
    }

    // ── Register the bundled Anthropic SDK ────────────────────────────
    try {
      const sdkBundle = await import('../dist/anthropic-sdk-bundle.js');
      runtime._registerBuiltinOverride('@anthropic-ai/sdk', sdkBundle);
      runtime._registerBuiltinOverride('@anthropic-ai/sdk/index', sdkBundle);
    } catch (err) {
      term.writeln('\x1b[33m[sdk] Anthropic SDK bundle not found: ' + err.message + '\x1b[0m');
      term.writeln('\x1b[90m  Run: sh scripts/bundle-sdk.sh\x1b[0m');
    }

    // ── Load Claude Code bundle if provided ──────────────────────────
    if (config.claudeCodeBundle) {
      try {
        const resp = await fetch(config.claudeCodeBundle);
        const bundleSrc = await resp.text();
        runtime.fs.mkdirSync('/app', { recursive: true });
        runtime.fs.writeFileSync('/app/claude-code.js', bundleSrc);
      } catch (err) {
        term.writeln('\x1b[33m[bundle] Failed to load Claude Code bundle: ' + err.message + '\x1b[0m');
      }
    }

  } catch (err) {
    term.writeln('\x1b[33m[edgejs] Runtime not available: ' + err.message + '\x1b[0m');
    term.writeln('\x1b[90mTerminal UI loaded — runtime will connect when Wasm is built.\x1b[0m');
    runtime = null;
  }

  // ── Keyboard input → process.stdin ─────────────────────────────────

  term.onData((data) => {
    if (runtime && typeof runtime.pushStdin === 'function') {
      runtime.pushStdin(data);
    }
  });

  // ── Window resize → terminal size ──────────────────────────────────

  window.addEventListener('resize', () => {
    if (fitAddon) fitAddon.fit();
  });

  term.onResize(({ cols, rows }) => {
    if (runtime && typeof runtime.setTerminalSize === 'function') {
      runtime.setTerminalSize(cols, rows);
    }
  });

  // ── Welcome message ────────────────────────────────────────────────

  term.writeln('\x1b[1;34m╭──────────────────────────────────╮\x1b[0m');
  term.writeln('\x1b[1;34m│\x1b[0m  \x1b[1;37mClaude Code — Browser Edition\x1b[0m   \x1b[1;34m│\x1b[0m');
  term.writeln('\x1b[1;34m╰──────────────────────────────────╯\x1b[0m');
  term.writeln('');

  if (runtime) {
    term.writeln('\x1b[32m✓ Runtime initialized\x1b[0m');

    if (config.apiKey) {
      term.writeln('\x1b[32m✓ API key configured\x1b[0m');
    } else {
      term.writeln('\x1b[33m⚠ No API key — add ?key=sk-ant-... to URL\x1b[0m');
    }

    if (config.proxyUrl) {
      term.writeln(`\x1b[32m✓ CORS proxy: ${config.proxyUrl}\x1b[0m`);
    }

    // If Claude Code bundle is loaded, run it
    const hasBundle = (() => {
      try { runtime.fs.statSync('/app/claude-code.js'); return true; } catch { return false; }
    })();

    if (hasBundle) {
      term.writeln('\x1b[32m✓ Claude Code bundle loaded\x1b[0m');
      term.writeln('');
      // Run Claude Code entry point
      try {
        runtime.require('/app/claude-code.js', '/app');
      } catch (err) {
        term.writeln('\x1b[31m✗ Claude Code failed to start: ' + err.message + '\x1b[0m');
      }
    } else {
      term.writeln('');
      term.writeln('\x1b[90mNo Claude Code bundle loaded.\x1b[0m');
      term.writeln('\x1b[90mTo load: add ?bundle=<url-to-bundle.js> to URL\x1b[0m');
      term.writeln('');
    }
  }

  // Expose for debugging
  globalThis.__edgeTerm = term;
  globalThis.__edgeRuntime = runtime;
}

boot().catch((err) => {
  console.error('[terminal] Boot failed:', err);
  document.body.innerHTML = '<pre style="color:#f00;padding:1em">' +
    'Terminal boot failed: ' + err.message + '</pre>';
});
