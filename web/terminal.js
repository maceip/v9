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

// ─── Side-panel import ───────────────────────────────────────────────
import { SidePanel } from '../llm-sidebar-infinite-context/design-system/stitch_metro_memory_panel/metro_sidepanel_320px_high_density/sidepanel-api.js';

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
// H4: API key is prompted, NOT read from URL query string.
// Only proxy and bundle URLs come from query params.

function getConfig() {
  const params = new URLSearchParams(globalThis.location?.search || '');
  return {
    proxyUrl: params.get('proxy') || '',
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

  // Wire global process.stdout to xterm BEFORE loading any CLI
  globalThis._xtermWrite = (data) => term.write(data);

  // ── Initialize side-panel ──────────────────────────────────────────
  const sidepanelContainer = document.getElementById('sidepanel');
  const panel = SidePanel.create(sidepanelContainer);
  panel.setStatus('idle');
  panel.setMaxTokens(200_000);
  panel.setMemory([
    { label: 'Model', value: 'claude-opus-4-6' },
    { label: 'Runtime', value: 'EdgeJS/Wasm' },
    { label: 'Proxy', value: 'cors.stare.network' },
  ]);

  // Expose panel globally for runtime hooks
  globalThis.__sidePanel = panel;

  // Hook stdout to track activity in the side-panel
  const _origXtermWrite = globalThis._xtermWrite;
  globalThis._xtermWrite = (data) => {
    _origXtermWrite(data);
    // Track API calls as activity
    const str = typeof data === 'string' ? data : '';
    if (str.includes('tool_use') || str.includes('tool_result')) {
      panel.pushActivity({ type: 'tool', msg: str.slice(0, 120) });
    }
  };

  // Collapse listener to resize terminal
  panel.on('collapse', (collapsed) => {
    if (fitAddon) setTimeout(() => fitAddon.fit(), 200);
  });

  // ── Load EdgeJS runtime ────────────────────────────────────────────

  const config = getConfig();

  // H4: Prompt for API key via sessionStorage (not URL params)
  let apiKey = sessionStorage.getItem('anthropic_api_key') || '';
  if (!apiKey) {
    term.writeln('\x1b[1;34m╭──────────────────────────────────╮\x1b[0m');
    term.writeln('\x1b[1;34m│\x1b[0m  \x1b[1;37mClaude Code — Browser Edition\x1b[0m   \x1b[1;34m│\x1b[0m');
    term.writeln('\x1b[1;34m╰──────────────────────────────────╯\x1b[0m');
    term.writeln('');
    term.writeln('\x1b[33mNo API key found in session.\x1b[0m');
    term.writeln('\x1b[90mSet via: sessionStorage.setItem("anthropic_api_key", "sk-ant-...")\x1b[0m');
    term.writeln('\x1b[90mThen reload the page.\x1b[0m');
  }

  let runtime;
  let cliModule = null;

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
        ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
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
      panel.pushActivity({ type: 'success', msg: 'Anthropic SDK registered' });
    } catch (err) {
      term.writeln('\x1b[33m[sdk] Bundle not found. Run: sh scripts/bundle-sdk.sh\x1b[0m');
      panel.pushActivity({ type: 'info', msg: 'SDK bundle not found' });
    }

    // ── Load Claude Code bundle if provided ──────────────────────────
    // ESM path: import() the bundle directly so the browser resolves
    // node:* specifiers via the import map. This avoids fetch+MEMFS+require.
    if (config.claudeCodeBundle) {
      try {
        cliModule = await import(config.claudeCodeBundle);
      } catch (err) {
        term.writeln('\x1b[33m[bundle] Failed to load as ESM: ' + _safe(err.message) + '\x1b[0m');
        // Fallback: fetch source and write to MEMFS for CJS require path
        try {
          const resp = await fetch(config.claudeCodeBundle);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
          const bundleSrc = await resp.text();
          runtime.fs.mkdirSync('/app', { recursive: true });
          runtime.fs.writeFileSync('/app/claude-code.js', bundleSrc);
        } catch (fetchErr) {
          term.writeln('\x1b[33m[bundle] Fallback fetch failed: ' + _safe(fetchErr.message) + '\x1b[0m');
        }
      }
    }

  } catch (err) {
    term.writeln('\x1b[33m[edgejs] Runtime not available: ' + _safe(err.message) + '\x1b[0m');
    term.writeln('\x1b[90mTerminal UI loaded — runtime will connect when Wasm is built.\x1b[0m');
    runtime = null;
    panel.setStatus('error');
    panel.pushActivity({ type: 'error', msg: 'Runtime not available: ' + _safe(err.message) });
  }

  // ── Keyboard input → process.stdin ─────────────────────────────────

  let _inputBuffer = '';
  term.onData((data) => {
    // Push to global process.stdin (ESM CLI path)
    if (typeof globalThis._stdinPush === 'function') {
      globalThis._stdinPush(data);
    }
    // Also push to runtime.pushStdin (Wasm runtime path)
    if (runtime && typeof runtime.pushStdin === 'function') {
      runtime.pushStdin(data);
    }
    // Track user input for side-panel context (on Enter)
    if (data === '\r' || data === '\n') {
      if (_inputBuffer.trim()) {
        panel.pushContext({ role: 'user', text: _inputBuffer.trim(), tokens: Math.ceil(_inputBuffer.trim().length / 4) });
      }
      _inputBuffer = '';
    } else if (data === '\x7f') {
      _inputBuffer = _inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
      _inputBuffer += data;
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

  // ── Status display ─────────────────────────────────────────────────

  if (runtime) {
    term.writeln('\x1b[1;34m╭──────────────────────────────────╮\x1b[0m');
    term.writeln('\x1b[1;34m│\x1b[0m  \x1b[1;37mClaude Code — Browser Edition\x1b[0m   \x1b[1;34m│\x1b[0m');
    term.writeln('\x1b[1;34m╰──────────────────────────────────╯\x1b[0m');
    term.writeln('');
    term.writeln('\x1b[32m✓ Runtime initialized\x1b[0m');
    panel.setStatus('active');
    panel.pushActivity({ type: 'success', msg: 'Runtime initialized' });

    if (apiKey) {
      term.writeln('\x1b[32m✓ API key configured\x1b[0m');
      panel.pushActivity({ type: 'success', msg: 'API key configured' });
    } else {
      term.writeln('\x1b[33m⚠ No API key\x1b[0m');
      panel.setStatus('idle');
      panel.pushActivity({ type: 'info', msg: 'No API key — set via sessionStorage' });
    }

    if (config.proxyUrl) {
      term.writeln('\x1b[32m✓ CORS proxy configured\x1b[0m');
    }

    // Run Claude Code — ESM path (cliModule) or CJS fallback (MEMFS)
    if (cliModule) {
      term.writeln('\x1b[32m✓ Claude Code loaded (ESM)\x1b[0m');
      term.writeln('');
      try {
        const main = cliModule.main || cliModule.default?.main || cliModule.default;
        if (typeof main === 'function') {
          main(runtime);
        }
      } catch (err) {
        term.writeln('\x1b[31m✗ Claude Code failed: ' + _safe(err.message) + '\x1b[0m');
      }
    } else {
      const hasBundle = (() => {
        try { runtime.fs.statSync('/app/claude-code.js'); return true; } catch { return false; }
      })();

      if (hasBundle) {
        term.writeln('\x1b[32m✓ Claude Code bundle loaded (CJS)\x1b[0m');
        term.writeln('');
        try {
          runtime.require('/app/claude-code.js', '/app');
        } catch (err) {
          term.writeln('\x1b[31m✗ Claude Code failed: ' + _safe(err.message) + '\x1b[0m');
        }
      } else {
        term.writeln('');
        term.writeln('\x1b[90mNo Claude Code bundle. Add ?bundle=<url> to URL\x1b[0m');
      }
    }
  }

  // Expose for debugging
  globalThis.__edgeTerm = term;
  globalThis.__edgeRuntime = runtime;
  globalThis.__edgePanel = panel;
}

// C4: Safe text output — never use innerHTML with untrusted data
function _safe(str) {
  if (typeof str !== 'string') return String(str || '');
  // Truncate to prevent terminal flooding
  return str.length > 200 ? str.slice(0, 200) + '...' : str;
}

boot().catch((err) => {
  console.error('[terminal] Boot failed:', err);
  // C4: Use textContent, never innerHTML, to prevent XSS
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f00;padding:1em';
  pre.textContent = 'Terminal boot failed: ' + (err.message || String(err));
  document.body.replaceChildren(pre);
});
