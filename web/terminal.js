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
  // Load xterm from local node_modules (avoids COEP/CORS issues with CDN)
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '../node_modules/xterm/lib/xterm.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    Terminal = globalThis.Terminal;
  } catch {
    throw new Error('xterm.js not available — include via CDN or npm');
  }

  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '../node_modules/xterm-addon-fit/lib/xterm-addon-fit.js';
      script.onload = resolve;
      script.onerror = () => resolve(); // optional
      document.head.appendChild(script);
    });
    FitAddon = globalThis.FitAddon?.FitAddon || null;
  } catch {
    FitAddon = null;
  }

  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '../node_modules/xterm-addon-web-links/lib/xterm-addon-web-links.js';
      script.onload = resolve;
      script.onerror = () => resolve(); // optional
      document.head.appendChild(script);
    });
    WebLinksAddon = globalThis.WebLinksAddon?.WebLinksAddon || null;
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

  // ── Load EdgeJS runtime ────────────────────────────────────────────

  const config = getConfig();

  // H4: Prompt for API key via sessionStorage (not URL params)
  let apiKey = sessionStorage.getItem('anthropic_api_key') || '';
  // Set API key on globalThis.process.env immediately — the CLI reads it from both
  // globalThis.process.env AND require('process').env
  if (apiKey && globalThis.process?.env) {
    globalThis.process.env.ANTHROPIC_API_KEY = apiKey;
  }
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

    // Load the Emscripten module factory.
    // edge.js is an IIFE that defines `var EdgeJSModule = ...` — not ESM.
    // Load it via a script tag so it lands on globalThis.
    //
    // IMPORTANT: Temporarily clear process.versions.node so Emscripten
    // detects a browser environment. Our polyfills set it, which makes
    // Emscripten call require('node:worker_threads') and crash.
    let moduleFactory = globalThis.EdgeJSModule;
    if (typeof moduleFactory !== 'function') {
      // Temporarily hide process.versions.node so Emscripten's IIFE
      // detects browser mode instead of Node.js (which calls require()).
      // Must be cleared BEFORE the script executes — onload is too late.
      const savedNode = globalThis.process?.versions?.node;
      if (globalThis.process?.versions) {
        delete globalThis.process.versions.node;
      }
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = '../dist/edgejs.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load edgejs.js'));
          document.head.appendChild(script);
        });
        moduleFactory = globalThis.EdgeJSModule;
      } catch (err) {
        term.writeln('\x1b[33m[wasm] Module not found: ' + _safe(err.message) + '\x1b[0m');
      } finally {
        // Restore for CLIs that need process.versions.node
        if (globalThis.process?.versions && savedNode) {
          globalThis.process.versions.node = savedNode;
        }
      }
    }

    runtime = await initEdgeJS({
      moduleFactory,
      wasmUrl: '../dist/edgejs.wasm',
      onStdout: (text) => term.write(text),
      onStderr: (text) => term.write(text),
      env: {
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        COLUMNS: String(term.cols),
        LINES: String(term.rows),
        ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
        // Route API calls through CORS proxy (browser can't call api.anthropic.com directly)
        ANTHROPIC_BASE_URL: config.proxyUrl || 'http://localhost:8081',
      },
    });

    // Replace globalThis.process streams with the bridge's Writable streams
    // so Ink (which uses globalThis.process.stdout) renders to xterm
    try {
      const pb = runtime.require('process');
      if (pb.stdout) globalThis.process.stdout = pb.stdout;
      if (pb.stderr) globalThis.process.stderr = pb.stderr;
      if (pb.stdin) globalThis.process.stdin = pb.stdin;
    } catch {}

    // Set initial terminal size
    if (typeof runtime.setTerminalSize === 'function') {
      runtime.setTerminalSize(term.cols, term.rows);
    }

    // ── Set up filesystem structure for CLI ──────────────────────────
    // Create home directory, .claude config, and virtual binaries
    try {
      const dirs = [
        '/home/user', '/home/user/.claude', '/home/user/.config',
        '/usr/bin', '/tmp', '/app',
      ];
      for (const dir of dirs) {
        try { runtime.fs.mkdirSync(dir, { recursive: true }); } catch {}
      }

      // Virtual binaries so `which` finds them
      const bins = ['git', 'rg', 'sh', 'node', 'cat', 'ls', 'grep'];
      for (const bin of bins) {
        try { runtime.fs.writeFileSync(`/usr/bin/${bin}`, '#!/bin/sh\n', { mode: 0o755 }); } catch {}
      }

      // Minimal .claude config — must include grove acceptance or CLI exits in -p mode
      try {
        runtime.fs.writeFileSync('/home/user/.claude/settings.json', JSON.stringify({
          permissions: { allow: [] },
          hasTrustDialogAccepted: true,
          grove_enabled: true,
          grove_notice_viewed_at: new Date().toISOString(),
        }));
      } catch {}
    } catch (err) {
      term.writeln('\x1b[33m[fs] Setup warning: ' + _safe(err.message) + '\x1b[0m');
    }

    // ── Register the bundled Anthropic SDK ────────────────────────────
    try {
      const sdkBundle = await import('../dist/anthropic-sdk-bundle.js');
      runtime._registerBuiltinOverride('@anthropic-ai/sdk', sdkBundle);
      runtime._registerBuiltinOverride('@anthropic-ai/sdk/index', sdkBundle);
    } catch (err) {
      term.writeln('\x1b[33m[sdk] Bundle not found. Run: sh scripts/bundle-sdk.sh\x1b[0m');
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

  // ── Status display ─────────────────────────────────────────────────

  if (runtime) {
    term.writeln('\x1b[1;34m╭──────────────────────────────────╮\x1b[0m');
    term.writeln('\x1b[1;34m│\x1b[0m  \x1b[1;37mClaude Code — Browser Edition\x1b[0m   \x1b[1;34m│\x1b[0m');
    term.writeln('\x1b[1;34m╰──────────────────────────────────╯\x1b[0m');
    term.writeln('');
    term.writeln('\x1b[32m✓ Runtime initialized\x1b[0m');

    if (apiKey) {
      term.writeln('\x1b[32m✓ API key configured\x1b[0m');
    } else {
      term.writeln('\x1b[33m⚠ No API key\x1b[0m');
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
          const exports = runtime.require('/app/claude-code.js', '/app');
          term.writeln('\x1b[90m[debug] require() returned: ' + Object.keys(exports || {}).join(', ') + '\x1b[0m');
          term.writeln('\x1b[90m[debug] mhz async chain is running in background...\x1b[0m');
        } catch (err) {
          if (err.code === 'PROCESS_EXIT') {
            term.writeln('\x1b[33m[exit] Claude Code exited with code ' + (err.exitCode ?? 'unknown') + '\x1b[0m');
          } else {
            term.writeln('\x1b[31m✗ Claude Code failed: ' + _safe(err.message) + '\x1b[0m');
          }
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
