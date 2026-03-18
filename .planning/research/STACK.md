# Technology Stack

**Project:** EdgeJS v9 -- Browser-Native Node.js Runtime
**Researched:** 2026-03-18
**Mode:** Ecosystem (Stack dimension)

## Recommended Stack

### Core Compilation Toolchain

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Emscripten SDK | 4.0.23 | C++ to WebAssembly compiler | Latest stable in the 4.x line. The project currently pins 3.1.64 which is over a year old and missing critical JSPI API changes introduced in 4.0 (the browser JSPI API was updated in 4.0 to match the Chrome v126+ spec). Upgrade path: 3.1.64 -> 4.0.23, then evaluate 5.0.x when stable. | HIGH |
| CMake | >= 3.20 | Build configuration | Already in use. EdgeJS upstream uses CMake. No change needed. | HIGH |
| Binaryen / wasm-opt | Bundled with Emscripten | Post-compilation Wasm optimization | Emscripten bundles Binaryen. Use `-Oz` for size optimization on the final binary. The `--gufa` pass (whole-program constant inference) is worth testing for additional size wins. | HIGH |
| LLVM/Clang | Bundled with Emscripten | C++20 compiler backend | Emscripten bundles its own LLVM. C++20 support is mature in the Emscripten-bundled clang. | HIGH |

**IMPORTANT VERSION NOTE:** The project currently uses Emscripten 3.1.64. Emscripten 4.0 introduced breaking changes to JSPI integration -- JSPI now uses the updated browser API (Chrome v126+), and async library functions must explicitly set `__async: true`. The jump from 3.1.64 to 4.0+ is non-trivial but necessary because the old JSPI API is deprecated in Chrome. Recommend upgrading to 4.0.23 (last stable 4.x) rather than jumping directly to 5.0.x (too new, potential instability).

### WebAssembly Runtime Features

| Technology | Version/Spec | Purpose | Why | Confidence |
|------------|-------------|---------|-----|------------|
| JSPI (JavaScript Promise Integration) | Phase 4 (W3C standardized April 2025) | Async I/O without Asyncify overhead | Standardized. Available in Chrome 137+, Firefox 139+. Safari implementation in progress (objection removed late 2025). JSPI avoids Asyncify's ~50% code size bloat. However, JSPI has a known performance issue: JS-to-Wasm-to-JS call chains are ~350x slower than Asyncify for that pattern. For this project, most async calls originate from Wasm (C++ libuv) calling out to browser APIs, which is JSPI's strong suit. | HIGH |
| Asyncify | Emscripten built-in | Fallback for browsers without JSPI (Safari) | Keep as fallback via build flag. Safari still lacks JSPI (Interop 2026 will address this). Asyncify adds ~50% code size overhead but works everywhere. Build two variants or feature-detect at runtime. | HIGH |
| SharedArrayBuffer + pthreads | Emscripten `-pthread` | Threading for libuv worker pool | Required for libuv's thread pool (DNS resolution, file I/O offloading). Requires Cross-Origin-Isolation headers (COOP/COEP). Use `credentialless` COEP mode to reduce friction with third-party embeds. | HIGH |
| SIMD (wasm-simd128) | Stable, all browsers | Accelerate crypto, string ops | Already enabled via `-msimd128`. Required for simdjson, simdutf performance. Universal browser support since 2021. | HIGH |
| Wasm Exceptions | Stable, Chrome/Firefox/Safari | C++ exception handling | Already enabled via `-fwasm-exceptions`. Avoids the significant code size penalty of Emscripten's JS-based exception handling. | HIGH |
| Bulk Memory | Stable | Fast memcpy/memset | Already enabled. No changes needed. | HIGH |
| Tail Calls | Chrome 133+, Firefox 131+ | Reduce stack usage | Already enabled via `-mtail-call`. Safari support still partial -- verify before relying on it for critical paths. | MEDIUM |

### Browser APIs (Runtime Dependencies)

| Technology | Browser Support | Purpose | Why | Confidence |
|------------|----------------|---------|-----|------------|
| Origin Private File System (OPFS) | Chrome 108+, Firefox 111+, Safari 16.4+ | Persistent filesystem | Universal browser support. Synchronous access in Web Workers via `FileSystemSyncAccessHandle`. Ideal for Node.js `fs` module emulation. OPFS `readwrite-unsafe` mode (Chrome 121+) enables concurrent file access. | HIGH |
| Web Crypto API | Universal | Crypto operations (SHA, HMAC, AES) | Browser-native, hardware-accelerated. Use for hot crypto paths; fall back to Wasm OpenSSL for algorithms Web Crypto lacks (e.g., Ed25519 in older browsers, specific ciphers). | HIGH |
| Fetch API | Universal | HTTP/HTTPS networking | Route all network calls through browser fetch. This gives TLS for free (browser handles it), avoids needing OpenSSL for TLS in the Wasm binary, and respects CORS. Intercept at the N-API layer when libuv/nghttp2 makes network calls. | HIGH |
| Web Workers | Universal | Child process emulation, pthreads | Spawn additional Wasm instances in workers for `child_process` semantics. Also required for Emscripten pthreads. | HIGH |
| Compression Streams API | Chrome 80+, Firefox 113+, Safari 16.4+ | gzip/deflate compression | Can replace some zlib usage for HTTP content-encoding. Not a full replacement for zlib (which handles raw deflate, custom dictionaries), but worth using for standard gzip/gunzip. | MEDIUM |

### Browser UI Layer

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| xterm.js | 6.0.0 | Terminal emulator | Latest major release (Dec 2025). 30% smaller bundle (265KB vs 379KB in v5). Used by VS Code, battle-tested. Provides WebGL renderer for performance. | HIGH |
| @xterm/addon-fit | 6.x | Auto-resize terminal | Standard companion addon. | HIGH |
| @xterm/addon-webgl | 6.x | GPU-accelerated rendering | Essential for smooth scrolling with Claude Code's verbose output. | HIGH |

### EdgeJS Upstream

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| EdgeJS (aspect-build/aspect-edgejs) | HEAD/main | Node.js C++ runtime base | Provides ~46 built-in modules, libuv, OpenSSL, nghttp2, etc. Targets Node.js v24 API compatibility. The NAPI split architecture (JS engine native, C++ runtime in Wasm) is EdgeJS's core design. Patches will be needed for Emscripten-specific compilation. | MEDIUM |
| libuv | Vendored via EdgeJS | Event loop, async I/O | Core dependency. Compiles to Wasm with Emscripten pthreads for its threadpool. POSIX syscalls route through Emscripten's musl libc or JSPI-wrapped browser APIs. | HIGH |
| OpenSSL | Vendored via EdgeJS | TLS/crypto | Needed for crypto algorithms Web Crypto API doesn't cover. TLS handshakes should NOT go through Wasm OpenSSL -- route HTTPS through browser fetch instead (browser handles TLS natively). | HIGH |
| nghttp2 | Vendored via EdgeJS | HTTP/2 | Needed for Anthropic SDK (which uses HTTP/2). Browser fetch handles the actual HTTP/2 transport; nghttp2 in Wasm provides the Node.js `http2` API surface. | MEDIUM |

### Supporting Libraries (NPM, for the browser host)

| Library | Version | Purpose | When to Use | Confidence |
|---------|---------|---------|-------------|------------|
| comlink | 4.x | Web Worker RPC | Simplify Worker communication for child_process emulation. Type-safe proxy between main thread and workers. | MEDIUM |
| idb-keyval | 6.x | IndexedDB wrapper | Metadata storage (settings, session state). Not for file content (use OPFS). | LOW |

### Development Dependencies

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | >= 20.x LTS | Development, testing | 18.x (currently specified) is approaching EOL. Upgrade minimum to 20.x LTS. | HIGH |
| Vitest | 3.x | Test framework | Replace custom test harness. Fast, ESM-native, browser mode available for Wasm integration tests. | MEDIUM |
| TypeScript | 5.7+ | Type checking for JS bridge code | The N-API bridge (450+ lines) and JSPI adapter should be typed. JSDoc annotations as minimum; full TS conversion ideal. | MEDIUM |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Wasm Compiler | Emscripten 4.0.23 | wasi-sdk | wasi-sdk lacks browser integration (no JSPI, no filesystem, no pthreads, no Web Worker support). Emscripten provides all of these out of the box. EdgeJS upstream uses WASIX (wasi-sdk variant), but WASIX is Wasmer-specific and not browser-compatible. |
| Wasm Compiler | Emscripten 4.0.23 | Emscripten 5.0.x | 5.0.x is too new (latest: 5.0.3). Major version bumps in Emscripten frequently have breaking changes. 4.0.23 is the battle-tested latest in the 4.x line. Evaluate 5.0.x after the project compiles cleanly on 4.0.23. |
| Wasm Compiler | Emscripten 4.0.23 | Emscripten 3.1.64 (current) | 3.1.64 uses the old JSPI API which is deprecated in Chrome. The async function annotation model changed in 4.0. Staying on 3.1.64 means targeting a deprecated browser API. |
| Async I/O | JSPI (primary) + Asyncify (fallback) | Asyncify only | Asyncify adds ~50% code size overhead to ALL compiled code. JSPI is now standardized and supported in Chrome+Firefox. Asyncify-only would produce a 60-75MB raw Wasm binary instead of ~40-50MB. |
| Async I/O | JSPI + Asyncify | Emscripten PROXY_TO_PTHREAD | Moves main() to a worker thread. Adds complexity, and the main thread still needs to coordinate. Better suited for compute-heavy apps, not interactive terminal sessions. |
| Terminal | xterm.js 6.0 | Custom terminal | xterm.js is the industry standard (VS Code uses it). Building a terminal emulator from scratch would be months of work for an inferior result. |
| Filesystem | OPFS | IndexedDB | OPFS has synchronous access in workers (critical for Node.js fs compatibility). IndexedDB is async-only, slower for file I/O patterns, and has a 2GB soft limit per origin in some browsers. |
| Filesystem | OPFS | Emscripten MEMFS | MEMFS is volatile (lost on page reload). Use MEMFS as the fast working memory, backed by OPFS for persistence. Both are needed. |
| Worker RPC | comlink | postMessage raw | comlink provides type-safe proxying and reduces boilerplate. Small library (~1KB). Raw postMessage works but gets messy with 10+ message types. |
| Child Process | Web Workers + Wasm instances | Not implementing | Claude Code uses child_process for git operations, shell commands. Without emulation, Claude Code cannot function. Workers running separate Wasm instances is the only viable browser approach. |

## Emscripten Compiler Flags (Updated)

The current toolchain flags are mostly correct. Key changes needed for Emscripten 4.0.23:

```cmake
# ---- Updated flags for Emscripten 4.0.23 ----

# JSPI: Now requires explicit async function annotation
# The -sJSPI=1 flag still works, but async imports must be declared
# via JSPI_IMPORTS and JSPI_EXPORTS settings
set(JSPI_FLAGS
    "-sJSPI=1"
    "-sJSPI_IMPORTS=['env.napi_async_*','env.jspi_*']"
    "-sJSPI_EXPORTS=['_main','_edge_eval']"
)

# Pthread: Default stack size reduced from 2MB to 64KB in 4.0
# Explicitly set if libuv threads need larger stacks
set(PTHREAD_FLAGS
    "-pthread"
    "-sSHARED_MEMORY=1"
    "-sDEFAULT_PTHREAD_STACK_SIZE=262144"  # 256KB, safer for libuv
    "-sPTHREAD_POOL_SIZE=4"  # Pre-spawn 4 workers for libuv threadpool
)

# Size optimization: Critical for 40-50MB binary
set(SIZE_FLAGS
    "-Oz"                    # Optimize for size
    "-sASSERTIONS=0"         # Disable in release
    "-sMINIMAL_RUNTIME=0"    # Can't use minimal runtime with full filesystem
    "--closure=1"            # Closure compiler on glue JS
)
```

## Installation

```bash
# Emscripten SDK (upgrade from 3.1.64)
cd ~/emsdk
git pull
./emsdk install 4.0.23
./emsdk activate 4.0.23
source emsdk_env.sh

# Node.js (development)
# Ensure Node.js >= 20.x LTS

# Browser UI dependencies (when building the host page)
npm install @xterm/xterm@6.0.0 @xterm/addon-fit @xterm/addon-webgl
npm install comlink

# Dev dependencies
npm install -D vitest typescript @types/node
```

## Critical Stack Decisions

### 1. Emscripten Version Upgrade (3.1.64 -> 4.0.23)

**Impact:** HIGH. The JSPI API changed in 4.0. The old `WebAssembly.Suspending` API is deprecated. Emscripten 4.0 aligns with Chrome v126+ JSPI spec. This will require updating:
- `jspi-adapter.js` to use the new annotation-based async pattern
- CMake toolchain flags for `JSPI_IMPORTS`/`JSPI_EXPORTS`
- Any Emscripten JS library functions that are async must declare `__async: true`

**Risk:** Medium. Some Emscripten APIs changed between 3.1.x and 4.0.x. The 44 existing shim headers may need adjustments.

### 2. JSPI as Primary, Asyncify as Fallback

**Impact:** HIGH. Determines binary size and Safari compatibility.
- **JSPI build:** ~40-50MB raw Wasm, works in Chrome 137+ and Firefox 139+
- **Asyncify build:** ~60-75MB raw Wasm, works everywhere including Safari
- Ship both or feature-detect at load time and fetch the appropriate binary

### 3. OPFS + MEMFS Dual Filesystem

**Impact:** HIGH. Determines whether files persist across sessions.
- MEMFS is the Emscripten default: fast, volatile, in Wasm linear memory
- OPFS provides persistence: slower, but survives page reloads
- Strategy: MEMFS as primary working FS, OPFS sync on `fs.writeFile` calls, OPFS hydration on startup

### 4. Browser Fetch Proxy for Networking

**Impact:** HIGH. Determines how Claude Code makes API calls.
- Do NOT compile OpenSSL TLS into the network path
- Intercept at libuv/nghttp2 level in the N-API bridge
- Route through browser `fetch()` which handles TLS, HTTP/2, CORS natively
- Keep Wasm OpenSSL only for crypto operations (hashing, signing, key derivation)

### 5. Cross-Origin Isolation Required

**Impact:** MEDIUM. Required for SharedArrayBuffer (pthreads).
- Hosting page MUST set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`
- Use `credentialless` (not `require-corp`) to avoid breaking third-party resource loading
- This is a deployment requirement, not a code change, but must be documented prominently

## What NOT to Use

| Technology | Why Not |
|------------|---------|
| wasi-sdk / WASIX for browser | No browser integration. WASIX is Wasmer-specific. Emscripten provides filesystem, pthreads, JSPI, Web Worker support that WASIX lacks in-browser. |
| Emscripten 5.0.x | Too new (released recently). Major version = breaking changes. Stabilize on 4.0.23 first. |
| Emscripten 3.1.64 (current) | Deprecated JSPI API. Will stop working as Chrome removes the old `WebAssembly.Suspending` API. |
| V8 compiled to Wasm | The entire architecture is designed to AVOID this. V8-in-Wasm runs in interpreter mode = 10-50x slower. The N-API split gives native JS performance. |
| Service Workers for networking | Over-engineered. Browser `fetch()` called directly from the N-API bridge is simpler and doesn't require SW registration. |
| WebTransport for API calls | Overkill for HTTP request/response. WebTransport is for bidirectional streaming. `fetch()` handles Anthropic API calls (including SSE streaming) just fine. |
| WebSocket tunnel to proxy server | Adds a server dependency. The whole point is serverless browser execution. `fetch()` can call APIs directly (with CORS). |
| Rollup/Webpack for Wasm | Emscripten generates its own JS glue code. Bundling it with Rollup/Webpack causes more problems than it solves. Use the Emscripten output directly; bundle only the host JS (N-API bridge, xterm.js integration). |
| Docker / containerized build | Emscripten SDK is self-contained. Adding Docker to the build adds complexity for no benefit. `emsdk install` is sufficient. |

## Sources

- [Emscripten SDK releases tags](https://github.com/emscripten-core/emsdk/blob/main/emscripten-releases-tags.json) -- latest stable is 5.0.3, 4.0.23 is latest 4.x
- [Emscripten JSPI documentation](https://emscripten.org/docs/porting/asyncify.html) -- JSPI vs Asyncify comparison
- [V8 JSPI blog post](https://v8.dev/blog/jspi) -- JSPI standardization and browser support
- [V8 JSPI new API](https://v8.dev/blog/jspi-newapi) -- Updated API for Chrome v126+
- [Emscripten pthreads documentation](https://emscripten.org/docs/porting/pthreads.html) -- Threading in Wasm
- [JSPI Emscripten issue #19287](https://github.com/emscripten-core/emscripten/issues/19287) -- JSPI tracking issue
- [JSPI performance issue #21081](https://github.com/emscripten-core/emscripten/issues/21081) -- JSPI JS-to-Wasm-to-JS slowness
- [OPFS MDN documentation](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) -- Browser support matrix
- [OPFS web.dev article](https://web.dev/articles/origin-private-file-system) -- Sync access handle API
- [xterm.js releases](https://github.com/xtermjs/xterm.js/releases) -- v6.0.0 changelog
- [EdgeJS / Wasmer announcement](https://wasmer.io/posts/edgejs-safe-nodejs-using-wasm-sandbox) -- NAPI split architecture
- [The State of WebAssembly 2025-2026](https://platform.uno/blog/the-state-of-webassembly-2025-2026/) -- Ecosystem overview
- [Binaryen optimizer cookbook](https://github.com/WebAssembly/binaryen/wiki/Optimizer-Cookbook) -- wasm-opt flags
- [Cross-Origin Isolation guide](https://web.dev/articles/coop-coep) -- COOP/COEP requirements
- [Interop 2026 announcement](https://webkit.org/blog/17818/announcing-interop-2026/) -- JSPI cross-browser interop
- [Chrome JSPI status](https://chromestatus.com/feature/5674874568704000) -- Chrome implementation status

---

*Stack research: 2026-03-18*
