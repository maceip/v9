/**
 * Terminal UI — xterm.js integration with EdgeJS runtime.
 *
 * Wires:
 *   xterm.js keyboard → runtime.pushStdin()
 *   runtime onStdout/onStderr → xterm.js write()
 *   window resize → runtime.setTerminalSize()
 *
 * SDK bundling strategy (esbuild):
 *   esbuild --bundle node_modules/@anthropic-ai/sdk/index.js \
 *     --platform=browser \
 *     --format=esm \
 *     --external:crypto \
 *     --outfile=dist/anthropic-sdk-bundle.js
 *
 * The bundled SDK is then registered as a builtin override:
 *   runtime._registerBuiltinOverride('@anthropic-ai/sdk', bundledSDK);
 */

// ─── Dynamic imports for xterm.js (loaded from CDN or node_modules) ──

let Terminal, FitAddon, WebLinksAddon;

async function loadXterm() {
  // Try ESM CDN imports first, fall back to global
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
      },
    });

    // Set initial terminal size
    if (typeof runtime.setTerminalSize === 'function') {
      runtime.setTerminalSize(term.cols, term.rows);
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

  const handleResize = () => {
    if (fitAddon) fitAddon.fit();
  };

  window.addEventListener('resize', handleResize);

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
