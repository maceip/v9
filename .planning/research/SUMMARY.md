# Project Research Summary

**Project:** EdgeJS v9 — Browser-Native Node.js Runtime
**Domain:** WebAssembly runtime / browser-native AI CLI tooling
**Researched:** 2026-03-18
**Confidence:** HIGH

## Executive Summary

EdgeJS v9 is a browser-native Node.js runtime targeting a specific and technically demanding goal: running Claude Code (Anthropic's AI CLI tool) entirely inside a browser tab with no server infrastructure. The project uses a four-tier "N-API split" architecture where C++ Node.js modules (~46 built-ins, libuv, OpenSSL, nghttp2) compile to WebAssembly via Emscripten, while JavaScript application code runs on the browser's native JIT engine — avoiding the catastrophic performance penalty of compiling V8 itself to Wasm. This is the only known architecture that delivers both real Node.js C++ module behavior AND native JS execution speed in a browser context.

The recommended approach is a seven-phase build sequence dictated by hard dependency chains: (1) get the Wasm binary to compile cleanly by completing V8 shim headers and fixing Emscripten toolchain issues, (2) make the N-API bridge correct and complete enough for basic JS execution, (3) bring up core modules (fs, streams, EventEmitter) that everything else depends on, (4) add the HTTPS fetch proxy for Anthropic API calls, (5) add OPFS-backed persistent filesystem, (6) implement child_process emulation via Web Workers, and (7) wire up the xterm.js terminal UI for a full interactive session. The critical upgrade needed before any of this: Emscripten must move from the current 3.1.64 to 4.0.23, because the old JSPI API it targets is deprecated in Chrome.

The top risks are: (a) the JSPI async path is 350x slower for JS-initiated call chains through the N-API bridge — batching N-API calls or using a hybrid JSPI+Asyncify strategy is required; (b) the N-API handle table has stubbed exception handling that will silently leak memory across a multi-hour session; and (c) the Wasm binary will grow to 40-50MB+ if unused Node.js modules are not whitelisted out at compile time. These three pitfalls must be addressed in Phases 1-2 before building features on top, because all three are expensive to fix retroactively.

## Key Findings

### Recommended Stack

See [STACK.md](.planning/research/STACK.md) for full detail.

The stack is largely determined by the project's existing architecture: Emscripten is the only viable C++-to-Wasm compiler for browser (wasi-sdk/WASIX lack browser integration), and the N-API split architecture is already designed in. The critical change is upgrading Emscripten from 3.1.64 to 4.0.23 to use the standardized JSPI API (Chrome v126+ spec). JSPI is the primary async strategy for Chrome 137+ and Firefox 139+, with Asyncify as a fallback binary for Safari (which is in Interop 2026 for JSPI). The filesystem strategy is MEMFS (volatile, fast) layered with OPFS (persistent, sync access in Web Workers via FileSystemSyncAccessHandle). Networking routes entirely through browser `fetch()` — no Wasm TLS.

**Core technologies:**
- **Emscripten 4.0.23**: C++ to Wasm compiler — only viable option for browser; upgrade from current 3.1.64 which targets deprecated JSPI API
- **JSPI (WebAssembly Promise Integration)**: Primary async I/O — W3C Phase 4 standardized (April 2025), Chrome 137+ / Firefox 139+; avoids Asyncify's 50% binary size overhead
- **Asyncify**: Fallback build for Safari — produces larger binary (~60-75MB raw vs ~40-50MB) but ensures universal compatibility
- **OPFS + WasmFS**: Persistent filesystem — 3-4x faster than IndexedDB; synchronous access in Web Workers; survives page reloads (competitive differentiator)
- **xterm.js 6.0**: Terminal UI — 30% smaller than v5 (265KB), WebGL renderer for GPU-accelerated output, VS Code battle-tested
- **Browser fetch() proxy**: All HTTPS through browser — eliminates Wasm TLS, browser handles HTTP/2, CORS, connection pooling for free
- **SharedArrayBuffer + pthreads**: libuv thread pool — requires Cross-Origin-Isolation headers (use `credentialless` COEP mode)

### Expected Features

See [FEATURES.md](.planning/research/FEATURES.md) for full detail.

The feature set is fully determined by what Claude Code actually uses. Claude Code's tool system exercises fs (every file operation), child_process (Bash tool spawning a persistent bash session + ripgrep), HTTPS streaming (Anthropic API via SSE), crypto (SDK request signing), streams (everything), process.env (ANTHROPIC_API_KEY), and module resolution (Anthropic SDK dependency tree). Every one of these is P1 — Claude Code cannot boot without them.

**Must have (table stakes):**
- **fs module (MEMFS, sync + async)** — every Claude Code tool (Read, Write, Edit, Glob, LS) uses this; critical path
- **child_process (spawn/exec via Web Workers)** — Bash tool spawns persistent shell; cannot run commands without this
- **HTTPS client (fetch proxy with SSE streaming)** — Anthropic API calls for every conversation turn; streaming required
- **Streams (Readable/Writable/Transform)** — underlies fs, HTTP, child_process, stdio; must come first
- **EventEmitter** — base class for all event-driven APIs; foundational
- **crypto (Web Crypto for SHA/HMAC, Wasm OpenSSL fallback)** — Anthropic SDK request signing
- **process object (env, cwd, stdio, exit)** — ANTHROPIC_API_KEY injection, file path resolution
- **Module resolution (require/import)** — loads Anthropic SDK and Claude Code itself
- **Terminal UI (xterm.js)** — Claude Code is a terminal app; required for user interaction
- **Shell command shims** — ls, cat, grep (ripgrep), find, head, tail, echo, git (read-only)
- **Buffer, path, url** — foundational; already partially scaffolded

**Should have (competitive):**
- **OPFS persistent filesystem** — survives page reloads; major differentiator vs WebContainers/Nodebox
- **Embeddable SDK (initEdgeJS API)** — self-hostable alternative to commercial WebContainers
- **git write operations** — commit, branch, diff for full Claude Code workflow
- **Web Worker pool** — reuse workers to reduce child_process spawn latency

**Defer (v2+):**
- Multi-CLI support (Codex, Gemini, Aider)
- MCP server support
- ServiceWorker-based HTTP server
- Collaborative sessions
- npm runtime package installation

### Architecture Approach

See [ARCHITECTURE.md](.planning/research/ARCHITECTURE.md) for full detail.

The architecture is a four-tier bridge: User Application → Module Resolution (browser builtins override layer) → N-API Bridge (handle table + JSPI adapter) → EdgeJS Wasm Runtime → Browser I/O Backend. The core insight is that the module resolution layer intercepts `require()` calls and routes simple modules (crypto, path, url, buffer, process) to pure-JS browser-native implementations, falling through to Wasm only for modules requiring real C++ internals (fs, streams, http, child_process). This keeps the Wasm binary smaller and eliminates bridge overhead for common operations. JSPI enables Wasm to suspend at I/O boundaries and resume when browser Promises resolve, making synchronous-looking C++ code work correctly in an async browser environment.

**Major components:**
1. **N-API Bridge** — integer handle table mapping JS values to Wasm-accessible IDs; marshals UTF-8 strings and typed arrays across the boundary; currently ~40 functions, needs expansion to ~80+
2. **JSPI Adapter** — wraps async browser API calls (OPFS, fetch, timers) as Wasm imports so libuv's synchronous I/O model works
3. **Browser Builtins Override Layer** — intercepts require() for crypto, path, url, buffer, process, os, util and serves native browser implementations; built and tested independently of Wasm
4. **WasmFS + OPFS Backend** — Emscripten's WasmFS mounts OPFS at `/workspace` for persistence; MEMFS remains default for `/tmp`; FileSystemSyncAccessHandle runs in Web Workers
5. **Web Worker Subprocess Manager** — spawns additional Wasm instances in Workers for child_process.spawn(); shares OPFS; pipes stdin/stdout/stderr via postMessage

### Critical Pitfalls

See [PITFALLS.md](.planning/research/PITFALLS.md) for full detail.

1. **JSPI performance cliff on JS-to-Wasm-to-JS chains** — 350x slower than Asyncify for the exact pattern used in N-API calls. Prevention: batch N-API calls, use explicit JSPI_IMPORTS/JSPI_EXPORTS to control which functions suspend, benchmark realistic patterns in Phase 2 before building features.

2. **N-API handle table leaks from stubbed exception handling** — `napi_is_exception_pending` currently returns 0 always, so every error path skips handle scope cleanup. Over a multi-hour Claude Code session this grows to millions of leaked handles. Prevention: fix exception handling in Phase 1 before building any features on the bridge; add handle scope watermark monitoring.

3. **Wasm memory grows monotonically (can never shrink)** — any memory spike (large file read, big HTTP response) permanently consumes Wasm linear memory for the tab lifetime. Prevention: stream I/O through fixed-size transfer buffers (64KB), keep large data on the JS heap, monitor with `emscripten_get_heap_size()`, set INITIAL_MEMORY to expected steady-state.

4. **V8 pointer width mismatch on wasm32** — V8 embedding API uses hardcoded 64-bit pointer offsets; shim headers that copy these verbatim produce silent memory corruption at runtime. Prevention: audit every `Internals` offset constant in shim headers against wasm32 layout (4-byte pointers), add `static_assert(sizeof(void*) == 4)` guards.

5. **fetch proxy missing SSE streaming** — simple request/response works but Anthropic API requires streaming (SSE). If not implemented from the start, Claude Code appears to work but conversations hang. Prevention: implement `ReadableStream` chunk piping in Phase 3; test with actual Anthropic SDK streaming endpoint before calling Phase 4 done.

## Implications for Roadmap

Based on research, the dependency chain is strict: nothing works until Wasm compiles, nothing is testable until the N-API bridge is correct, and every user-facing feature depends on fs/streams/EventEmitter. The architecture research explicitly names 7 phases with hard rationale for their order. The pitfalls research reinforces this by mapping each critical pitfall to the earliest phase at which it must be addressed (most are Phase 1-2).

### Phase 1: Wasm Compilation + Build Foundation
**Rationale:** The entire project is blocked until `emcmake cmake && make` succeeds with zero errors. No runtime testing is meaningful until this succeeds. The Emscripten upgrade (3.1.64 → 4.0.23) must happen here because it changes JSPI API semantics that everything downstream depends on.
**Delivers:** Compiled edgejs.wasm binary; updated Emscripten 4.0.23 toolchain; V8 shim layers complete; module whitelist established
**Addresses:** path, url, buffer scaffolding verification; module whitelist to control binary size
**Avoids:** V8 pointer width mismatch (audit wasm32 offsets), binary size explosion (whitelist unused modules), initialization race condition, Cross-Origin-Isolation decision locked in

### Phase 2: N-API Bridge Hardening + Runtime Bootstrap
**Rationale:** N-API bridge is the central nervous system — every feature flows through it. Must be correct (not just working in happy-path) before building features that will exercise error paths in production. JSPI performance characteristics must be benchmarked here before the async strategy is baked into all downstream modules.
**Delivers:** N-API bridge expanded to ~80 functions; exception handling correct; handle scope monitoring; `runtime.eval('1+1')` returns `2`; JSPI vs Asyncify async strategy validated
**Addresses:** EventEmitter (pure JS, no N-API dependency)
**Avoids:** Handle table leaks (fix exception handling), JSPI performance cliff (benchmark and establish batching strategy), Asyncify code bloat (decide dual-binary approach), initialization race condition (memory assignment order)

### Phase 3: Core Modules (fs, Streams, process, Browser Builtins)
**Rationale:** fs, Streams, and EventEmitter are required by every subsequent module. Build order within this phase: EventEmitter → Buffer → Streams → process → path/url/os/util (browser builtins) → fs (MEMFS). Cannot test networking or child_process until streams exist.
**Delivers:** `require('fs').writeFileSync('/tmp/test', 'hello')` works; MEMFS operational; Browser builtins override layer complete
**Implements:** Module Resolution Layer, Browser Builtins Override Layer
**Avoids:** Streaming-not-buffering principle established here to prevent Wasm memory growth

### Phase 4: Network Layer (HTTPS via fetch proxy)
**Rationale:** Claude Code's core use case is API calls to Anthropic. Without working HTTPS + SSE streaming, no conversation is possible. Must come after streams (Phase 3) since HTTP responses are streams.
**Delivers:** `anthropic.messages.create()` with streaming works; SSE chunks delivered incrementally to terminal
**Uses:** Browser fetch() with ReadableStream; Wasm OpenSSL kept for crypto only (not TLS)
**Avoids:** fetch proxy losing SSE streaming (implement ReadableStream piping from day one, not as an afterthought)

### Phase 5: Persistent Filesystem (OPFS)
**Rationale:** Claude Code needs to read/write project files that survive page reloads. This is a key competitive differentiator vs WebContainers/Nodebox. Depends on Phase 3 fs/streams working with MEMFS.
**Delivers:** Files survive page reload; WasmFS mounted with OPFS backend at `/workspace`; lock recovery for crash scenarios
**Avoids:** Synchronous OPFS on main thread (run in Web Worker), stale lock on crash (beforeunload cleanup + timeout recovery)

### Phase 6: Subprocess Emulation (child_process via Web Workers)
**Rationale:** Claude Code's Bash tool requires `child_process.spawn()` for a persistent shell session, and uses it for git, ripgrep, and other commands. This is the most complex infrastructure piece. Depends on streams (Phase 3) for stdio piping.
**Delivers:** `child_process.spawn()` with stdio pipes works; shell command shims (ls, cat, grep, git); exit codes and signal handling
**Implements:** Web Worker Subprocess Manager; Worker pool for spawn latency reduction
**Avoids:** Web Worker shared memory misconception (workers get separate Wasm instances; communicate via postMessage, not shared memory)

### Phase 7: Terminal UI + Full Integration
**Rationale:** Integration layer that brings all components together into an interactive session. Depends on all previous phases.
**Delivers:** Full Claude Code conversation with file editing working in browser; xterm.js connected to process.stdin/stdout; ANSI/color/cursor support; API key injection
**Uses:** xterm.js 6.0 with WebGL renderer; PTY emulation via streams; environment variable injection via initEdgeJS(options.env)

### Phase Ordering Rationale

- Phases 1-2 are foundation work with no user-visible output — they must be done correctly before any features are built, because all three critical N-API pitfalls (handle leaks, JSPI performance, pointer mismatch) are prohibitively expensive to fix retroactively
- Phase 3 precedes Phases 4-6 because streams are required by all three of them; there is no way to parallelize this
- Phases 4, 5, and 6 could theoretically be parallelized (they have independent dependency edges from Phase 3), but sequencing 4 before 5 before 6 reduces integration complexity
- Phase 7 is strictly last because it requires all other phases to have working outputs

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (N-API + async strategy):** The JSPI 350x performance cliff is a known but poorly documented edge case specific to this project's call pattern. Need to research emnapi adoption vs expanding current bridge — depends on how much of N-API surface Claude Code actually exercises (currently unknown).
- **Phase 6 (child_process via Workers):** Web Worker subprocess emulation with shared OPFS access is novel ground; limited prior art for this exact pattern. Comlink or raw postMessage tradeoffs need evaluation.

Phases with standard patterns (skip research-phase):
- **Phase 1 (compilation):** Emscripten toolchain upgrade and CMake configuration are well-documented. V8 shim strategy is already in place; gap-filling is mechanical work.
- **Phase 3 (core modules):** EventEmitter, Buffer, path, url are pure JS with established polyfill patterns. MEMFS is Emscripten default.
- **Phase 5 (OPFS):** WasmFS OPFS backend is documented by Emscripten team; patterns are established (SQLite's use of OPFS is extensive prior art).
- **Phase 7 (terminal UI):** xterm.js is well-documented; integration patterns for process.stdout → xterm are standard.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technology choices verified against official sources (Emscripten docs, V8 blog, W3C specs, Chrome status). Version numbers confirmed via release tags. |
| Features | MEDIUM | Claude Code's API usage is inferred from tool descriptions and public documentation, not source inspection. Core requirements (fs, child_process, HTTPS) are well-established. Edge cases in Anthropic SDK may surface unexpected N-API requirements. |
| Architecture | HIGH | Architecture is informed by the existing codebase structure (44 shim headers, 450-line N-API bridge, existing CMake toolchain) plus Emscripten official docs and verified prior art (WebContainers, emnapi, SQLite+OPFS). |
| Pitfalls | HIGH | Pitfalls sourced from: official Emscripten issue tracker (JSPI performance issue #21081 with benchmarks), WebAssembly spec (memory cannot shrink), existing codebase analysis (stubbed exception handling confirmed in CONCERNS.md), and V8 blog posts. All critical pitfalls have linked upstream evidence. |

**Overall confidence:** HIGH

### Gaps to Address

- **N-API surface area required by Claude Code:** Exact set of N-API functions exercised by Claude Code and the Anthropic SDK is unknown. The current 40-function bridge may be sufficient, or it may hit emnapi-class gaps during Phase 3-4 testing. Plan: test-driven expansion; track which functions are called.
- **Emscripten 4.0.23 breaking changes:** The 3.1.64 → 4.0.23 upgrade will surface unexpected breaks in the 44 existing shim headers and CMake toolchain. Scope is hard to estimate without attempting the upgrade. Plan: timebox Phase 1 at 2 weeks; escalate if shim rework exceeds that.
- **Anthropic SDK network patterns:** Whether the Anthropic SDK uses Node.js `http` module internally or native `fetch()` directly affects how complex the network proxy needs to be. If it uses native fetch, Phase 4 is straightforward. If it uses `http` module internals, the N-API bridge must support more of the http module's C++ implementation. Plan: inspect Anthropic SDK source during Phase 4 planning.
- **JSPI performance in practice:** The 350x penalty is benchmarked in microbenchmarks. Real Claude Code usage (coarser-grained N-API calls per tool operation) may not hit this in practice. Plan: establish benchmark in Phase 2 with realistic call patterns (a simulated `require('fs').readFile()` call chain) before deciding on batching strategy.

## Sources

### Primary (HIGH confidence)
- [Emscripten SDK releases tags](https://github.com/emscripten-core/emsdk/blob/main/emscripten-releases-tags.json) — version confirmation
- [V8 JSPI blog post](https://v8.dev/blog/jspi) — JSPI standardization, browser support, performance data
- [V8 JSPI new API](https://v8.dev/blog/jspi-newapi) — updated API for Chrome v126+ (relevant to Emscripten 4.0 upgrade)
- [JSPI performance issue #21081](https://github.com/emscripten-core/emscripten/issues/21081) — 350x JS-to-Wasm-to-JS slowdown benchmarks
- [WebAssembly Memory Design Issue #1397](https://github.com/WebAssembly/design/issues/1397) — memory can never shrink (fundamental limitation)
- [OPFS MDN documentation](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) — browser support matrix, SyncAccessHandle constraints
- [WasmFS DeepWiki](https://deepwiki.com/emscripten-core/emscripten/3.4-wasmfs) — WasmFS OPFS backend architecture
- [emnapi documentation](https://emnapi-docs.vercel.app/guide/) — N-API Emscripten reference implementation
- [Cross-Origin Isolation guide (web.dev)](https://web.dev/articles/cross-origin-isolation-guide) — COOP/COEP deployment pitfalls
- [Interop 2026 announcement](https://webkit.org/blog/17818/announcing-interop-2026/) — JSPI cross-browser roadmap (Safari)
- Project codebase: `emscripten-toolchain.cmake`, `napi-bridge/index.js`, `wasi-shims/`, `.planning/codebase/CONCERNS.md`

### Secondary (MEDIUM confidence)
- [BrowserPod announcement](https://labs.leaningtech.com/blog/browserpod-annoucement) — competitive architecture analysis
- [Claude Code Tools System Prompt (GitHub Gist)](https://gist.github.com/wong2/e0f34aac66caf890a332f7b6f9e2ba8f) — Claude Code API usage inference
- [xterm.js releases](https://github.com/xtermjs/xterm.js/releases) — v6.0.0 bundle size data
- [SQLite + OPFS (Chrome Blog)](https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system) — OPFS performance data (3-4x vs IndexedDB)

### Tertiary (LOW confidence)
- [Claude Code Internal Tools analysis (GitHub Gist)](https://gist.github.com/bgauryy/0cdb9aa337d01ae5bd0c803943aa36bd) — inferred N-API requirements; needs validation against actual SDK source
- [Nodepod introduction](https://scelar.com/blog/introducing-nodepod) — competitive boot time claims; self-reported

---
*Research completed: 2026-03-18*
*Ready for roadmap: yes*
