# v9 — Claude Code in the Browser

Run Claude Code's full interactive TUI in Chrome via WebAssembly + N-API bridge.

**Status**: Claude Code v2.1.83 renders its Ink-based TUI in xterm.js, connects to the Anthropic API through a CORS proxy, and accepts keyboard input.

## Quick Start (Developer)

```bash
# Prerequisites: Node.js 22+, Emscripten SDK (emsdk), Git Bash (Windows)

# 1. Install dependencies
npm install

# 2. Build the Wasm binary
make clean && make configure && make build

# 3. Bundle Claude Code for browser
npm install @anthropic-ai/claude-code --save-dev
npx esbuild node_modules/@anthropic-ai/claude-code/cli.js \
  --bundle --format=cjs --platform=node --packages=external \
  --outfile=dist/claude-code-cli.js
sed -i '1{/^#!/d}' dist/claude-code-cli.js  # strip shebang

# 4. Bundle the Anthropic SDK
sh scripts/bundle-sdk.sh

# 5. Start the dev server
node scripts/dev-server.mjs

# 6. Open in Chrome
#    http://localhost:8080/web/?bundle=/dist/claude-code-cli.js
#
#    First visit: open DevTools console and run:
#    sessionStorage.setItem("anthropic_api_key", "sk-ant-...")
#    Then reload the page.
```

## Quick Start (System Builder)

Exact commands that produced the working build:

```bash
# Build pipeline
make clean
make configure    # ~6 min — configures Emscripten cross-compilation
make build        # ~5 min — compiles 800+ objects, links 4.9MB wasm

# Verify
make release-gate                    # 12/12 checks, 7/7 checkpoints
node tests/run-oneshot.mjs           # 29/29 pass
node tests/conformance/test-eventemitter.mjs  # 28/28 pass

# Bundle the CLI
npm install @anthropic-ai/claude-code --save-dev
npx esbuild node_modules/@anthropic-ai/claude-code/cli.js \
  --bundle --format=cjs --platform=node --packages=external \
  --outfile=dist/claude-code-cli.js
sed -i '1{/^#!/d}' dist/claude-code-cli.js
sh scripts/bundle-sdk.sh

# Serve
node scripts/dev-server.mjs
# File server: http://localhost:8080/web/
# CORS proxy:  http://localhost:8081/
# Open: http://localhost:8080/web/?bundle=/dist/claude-code-cli.js
```

## Architecture

```
Browser Tab
├── xterm.js                    Terminal emulator (keyboard → stdin, stdout → screen)
├── web/terminal.js             Wires xterm ↔ runtime, loads CLI bundle
├── web/node-polyfills.js       process, global, require shim, CORS proxy
│
├── napi-bridge/index.js        N-API bridge (140+ functions), JS execution path
├── napi-bridge/browser-builtins.js  process, fs, http, path, os, crypto, etc.
├── napi-bridge/eventemitter.js  Full Node.js EventEmitter + static methods
├── napi-bridge/http.js          HTTP client via fetch() with streaming
├── napi-bridge/streams.js       Readable/Writable/Duplex/Transform
├── napi-bridge/fs.js            MEMFS-backed filesystem
│
├── dist/edgejs.wasm            4.9MB Wasm binary (EdgeJS runtime)
├── dist/edgejs.js              Emscripten JS glue
├── dist/claude-code-cli.js     12MB Claude Code bundle (esbuild CJS)
├── dist/anthropic-sdk-bundle.js  175KB Anthropic SDK bundle
│
├── scripts/dev-server.mjs      HTTP file server + CORS proxy
├── wasi-shims/napi-emscripten-library.js  Emscripten link stubs
└── emscripten-toolchain.cmake  Cross-compilation config
```

## Key Design Decisions

1. **JS Bridge Execution** — The Wasm binary boots but script execution bypasses the C++ libuv event loop. Scripts run in the browser's native V8 via `new Function()` with a Node.js-compatible `require()` backed by MEMFS.

2. **Dual Process Objects** — `globalThis.process` (polyfill, loads first) and `require('process')` (processBridge, full Writable streams). Both are synchronized via `terminal.js` after `initEdgeJS()`.

3. **CORS Proxy** — All `api.anthropic.com` and `platform.claude.com` requests are intercepted via a patched `fetch()` and routed through `localhost:8081` which forwards with proper headers.

4. **No Minified Code Dependencies** — All production fixes are in our bridge/polyfill files. Debug checkpoint patches (the `[V9]` traces) are only in the disposable `dist/claude-code-cli.js` bundle.

## File Inventory

| File | Purpose |
|------|---------|
| `Makefile` | Build pipeline (fetch → configure → build → release-gate) |
| `emscripten-toolchain.cmake` | Emscripten compiler/linker flags |
| `patches/edgejs-emscripten.patch` | EdgeJS source patches for Emscripten |
| `napi-bridge/index.js` | Core N-API bridge, module resolver, JS execution |
| `napi-bridge/browser-builtins.js` | processBridge, 28 Node.js builtin modules |
| `napi-bridge/eventemitter.js` | EventEmitter with static methods |
| `napi-bridge/http.js` | HTTP client via fetch() |
| `napi-bridge/fs.js` | MEMFS filesystem |
| `napi-bridge/streams.js` | Readable/Writable/Transform streams |
| `web/node-polyfills.js` | Global polyfills, CORS proxy, exit handling |
| `web/terminal.js` | xterm.js integration, CLI bundle loading |
| `web/index.html` | Entry point with import map |
| `scripts/dev-server.mjs` | Dev HTTP server + CORS proxy |
| `scripts/bundle-sdk.sh` | Anthropic SDK bundler |
| `scripts/release-gate.mjs` | Release quality gate |
| `wasi-shims/napi-emscripten-library.js` | Emscripten JS library stubs |
| `tests/run-oneshot.mjs` | Wasm + MEMFS + execution test |
| `tests/conformance/test-eventemitter.mjs` | EventEmitter conformance tests |
