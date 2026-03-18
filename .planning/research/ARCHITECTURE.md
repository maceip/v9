# Architecture Patterns

**Domain:** Browser-native Node.js runtime (Wasm + N-API bridge)
**Researched:** 2026-03-18

## Recommended Architecture

The architecture is a **four-tier bridge system** where compiled C++ Node.js modules run in WebAssembly and communicate with the browser's native JavaScript engine through an N-API handle table. The browser provides I/O (filesystem, networking, crypto, subprocess) through browser-native APIs, not through emulated POSIX syscalls.

```
┌──────────────────────────────────────────────────────────────────────┐
│                    User Application Layer                            │
│  Claude Code JS, Anthropic SDK, user scripts                        │
│  Executes on browser's native JS engine (full JIT speed)            │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ require('fs'), require('http'), etc.
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Module Resolution Layer                           │
│  Browser builtins override: crypto→WebCrypto, path→pure JS,        │
│  url→URL API, buffer→Uint8Array, process→minimal shim              │
│  Falls through to Wasm for modules needing C++ implementation       │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ N-API function calls (handle-based)
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    N-API Bridge Layer                                │
│  Handle table: integer handles ↔ JS values                          │
│  Memory marshaling: UTF-8 strings, buffers, typed arrays            │
│  JSPI adapter: sync Wasm calls → async browser Promises             │
│  ~40+ N-API functions implemented as Wasm imports                   │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ WebAssembly imports/exports
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    EdgeJS Wasm Runtime Layer                         │
│  ~46 C++ Node.js built-in modules compiled to Wasm                  │
│  libuv event loop, OpenSSL, nghttp2, c-ares, zlib, ICU             │
│  V8 embedding API shimmed (NOT running V8 — stubs only)             │
│  44+ shim headers across 13 layers filling API gaps                 │
└──────────────────────────────────────────────────────────────────────┘
                         │ I/O syscalls
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Browser I/O Backend Layer                         │
│  Filesystem: WasmFS + OPFS backend (persistent, sync in workers)    │
│  Networking: fetch() proxy for HTTPS, ServiceWorker intercept       │
│  Crypto: WebCrypto API for fast-path, Wasm OpenSSL fallback         │
│  Subprocess: Web Workers running additional Wasm instances           │
│  Timers: setTimeout/setInterval via JSPI suspension                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With | Boundary Type |
|-----------|---------------|-------------------|---------------|
| **User Application** | Run Claude Code JS, Anthropic SDK | Module Resolution (require/import) | JS function calls |
| **Module Resolution** | Route module loads to browser builtins or Wasm | Browser Builtins, N-API Bridge | JS dispatch |
| **Browser Builtins** | Replace heavyweight Wasm modules with native APIs | WebCrypto, URL API, TextEncoder | Direct browser API |
| **N-API Bridge** | Marshal values between JS heap and Wasm linear memory | Wasm Runtime (imports), JS Engine (handles) | Integer handle table + shared memory |
| **JSPI Adapter** | Convert sync Wasm I/O to async browser operations | N-API Bridge, Browser I/O backends | WebAssembly.Suspending wrapping |
| **EdgeJS Wasm Runtime** | Provide Node.js C++ module implementations | N-API Bridge (exports), libuv, OpenSSL | Wasm function calls |
| **V8 Shim Layer** | Stub V8 embedding API so EdgeJS C++ compiles | EdgeJS source files (compile-time only) | C++ header includes |
| **OPFS Filesystem** | Persistent file storage surviving page reloads | WasmFS (mount point), Web Workers | FileSystemSyncAccessHandle |
| **Fetch Proxy** | Route HTTP/HTTPS requests through browser fetch | N-API Bridge or libuv TCP intercept | fetch() API + JSPI |
| **Worker Subprocess** | Emulate child_process.spawn/exec | Main thread (postMessage), new Wasm instances | structured clone |

### Data Flow

**Inbound: User code calls Node.js API**

```
1. User JS: require('fs').readFileSync('/workspace/file.txt')
2. Module Resolution: 'fs' not overridden → route to Wasm
3. N-API Bridge: Allocate handles for arguments (path string → H5)
4. EdgeJS Wasm: edge_fs.cc calls uv_fs_read()
5. JSPI Adapter: uv_fs_read → Emscripten FS syscall
6. WasmFS: Route to OPFS backend (in Worker) or MEMFS
7. Result: Buffer flows back through handle table → JS Uint8Array
```

**Outbound: Wasm runtime calls browser API**

```
1. EdgeJS Wasm: OpenSSL needs random bytes → calls __wasi_random_get
2. JSPI Adapter: Intercepts, calls crypto.getRandomValues()
3. WebCrypto API: Fills buffer directly in Wasm linear memory
4. Result: Wasm continues with filled buffer, zero copy
```

**Network: HTTPS API call (Claude API)**

```
1. User JS: fetch('https://api.anthropic.com/v1/messages', {...})
   OR: Anthropic SDK uses Node http module
2. If SDK uses http module:
   a. N-API Bridge receives http.request() call
   b. EdgeJS Wasm: nghttp2/OpenSSL attempt TCP connect
   c. Intercept at libuv TCP level → redirect to fetch() proxy
   d. JSPI suspends Wasm, browser fetch() executes
   e. Response streams back through handle table
3. If SDK uses native fetch (preferred path):
   a. Browser fetch() executes directly, no Wasm involved
   b. Full speed, no bridge overhead
```

**Subprocess: child_process emulation**

```
1. User JS: child_process.spawn('node', ['script.js'])
2. Module Resolution: routes to Wasm child_process implementation
3. EdgeJS Wasm: Calls spawn() → intercepted by browser backend
4. Worker Manager: Creates new Web Worker
5. Worker: Loads fresh EdgeJS Wasm instance with shared OPFS
6. Communication: stdin/stdout via postMessage ↔ stream adapters
7. Exit: Worker terminates, exit code returned via Promise
```

## Patterns to Follow

### Pattern 1: Browser-First Module Override

**What:** For modules where browser APIs are equivalent or superior to the C++ implementation, bypass Wasm entirely and provide pure-JS implementations using browser APIs.

**When:** The browser has a native API covering the module's surface area (crypto hashing, URL parsing, path manipulation, encoding).

**Why:** Reduces Wasm binary size, eliminates bridge overhead, runs at full JIT speed.

**Example:**
```javascript
// In module resolution layer
const BROWSER_OVERRIDES = {
  'crypto': cryptoBridge,    // WebCrypto API
  'path': pathBridge,        // Pure JS
  'url': urlBridge,          // Native URL class
  'buffer': bufferBridge,    // Uint8Array wrapper
  'process': processBridge,  // Minimal shim
  'os': osBridge,            // Static values
  'util': utilBridge,        // Pure JS utilities
};

function resolveModule(name) {
  if (BROWSER_OVERRIDES[name]) return BROWSER_OVERRIDES[name];
  return loadFromWasm(name); // Fall through to C++ implementation
}
```

**Build order implication:** Browser overrides can be built and tested independently of Wasm compilation. Build these first.

### Pattern 2: JSPI-First Async I/O

**What:** All blocking I/O operations in the Wasm runtime use JSPI (WebAssembly.Suspending) to suspend the Wasm stack and delegate to async browser APIs.

**When:** Any Wasm import that performs I/O (network, filesystem, timers, crypto).

**Why:** JSPI is now standardized (Phase 4, shipping in Chrome 137+ and Firefox 139+). It provides zero-overhead suspension compared to Asyncify's code-size and performance penalties. Asyncify remains as fallback for Safari until they ship JSPI.

**Example:**
```javascript
// Wrap a blocking I/O call for JSPI
const asyncRead = new WebAssembly.Suspending(async (fd, buf, len) => {
  const handle = getFileHandle(fd);
  const accessHandle = await handle.createSyncAccessHandle();
  const bytesRead = accessHandle.read(new Uint8Array(memory.buffer, buf, len));
  accessHandle.close();
  return bytesRead;
});

// Wasm sees this as a synchronous import
wasmImports['__wasi_fd_read'] = asyncRead;
```

**Build order implication:** JSPI adapter must be wired up before any I/O-dependent modules can be tested end-to-end.

### Pattern 3: Layered V8 Shim Strategy

**What:** V8 embedding API headers are shimmed in 13 dependency-ordered layers, from foundational types (kSystemPointerSize) up through complete type stubs (Isolate, PromiseReject).

**When:** Every EdgeJS C++ source file includes V8 headers. The shims must satisfy the compiler without providing real V8 functionality, since the browser's JS engine replaces V8 at runtime.

**Why:** EdgeJS was written against V8's embedding API. Ripping out V8 references would require rewriting ~46 modules. Shimming the compile-time interface is far less work than forking EdgeJS.

**Layer ordering (must be respected):**
```
Layer 0:  Minimal / foundational (kSystemPointerSize, pointer width)
Layer 1:  Platform & system (Isolate::CreateParams, clock)
Layer 2:  cppgc / GC stubs (AllocationHandle)
Layer 3:  V8 Internals (SMI tags, roots offsets for wasm32)
Layer 4:  V8 base utilities (bit fields, lazy instance)
Layer 5:  Namespace & operator fixes (prevent v8::v8:: nesting)
Layer 6:  Sandbox & segmented tables (stub out V8 sandbox types)
Layer 7:  V8 API layer (HandleScope, FixedArray)
Layer 8:  Isolate & arguments (Isolate method stubs)
Layer 9:  Complete types (TypedArrays, PromiseReject)
Layer 10: simdutf (validation and conversion stubs)
Layer 11: Architecture & builtins (wasm32 arch, bytecode handlers)
Layer 12: Node.js integration (Node-specific V8 API gaps)
Layer 13: Comprehensive catch-all (Zone, Hash, profiling)
```

**Build order implication:** Shim layers must compile before any EdgeJS source. Each layer depends on previous layers. Debug from Layer 0 up.

### Pattern 4: WasmFS + OPFS for Persistent Filesystem

**What:** Use Emscripten's WasmFS with OPFS backend for persistent storage, mounted at a specific path. MEMFS for temporary files, OPFS for the user workspace.

**When:** Files must survive page reloads (user workspace, project files, configuration).

**Why:** OPFS is supported in all major browsers (Chrome 108+, Safari 16.4+, Firefox 111+), provides 3-4x faster I/O than IndexedDB, and offers synchronous access in Web Workers via FileSystemSyncAccessHandle. WasmFS's OPFS backend integrates this natively.

**Example mount strategy:**
```javascript
// Mount OPFS at /workspace for persistent files
Module.FS.mount(Module.FS.filesystems.OPFS, {}, '/workspace');
// MEMFS remains default for /tmp, /home, etc.
```

**Critical caveat:** FileSystemSyncAccessHandle takes an exclusive lock. If the tab crashes, stale locks persist and reopening fails. Must implement lock recovery (close all handles on beforeunload, timeout-based recovery on startup).

**Build order implication:** Filesystem layer is foundational -- many modules depend on fs. Get MEMFS working first (it's default), then add OPFS persistence as an overlay.

### Pattern 5: Fetch-Based Network Proxy

**What:** Intercept HTTP/HTTPS requests at the highest possible level and route through browser's native fetch() API rather than trying to emulate TCP sockets.

**When:** Any outbound HTTP/HTTPS request from the runtime.

**Why:** Browsers cannot create raw TCP sockets. Emulating TLS in Wasm would be slow and waste binary size. The browser's fetch() handles TLS, HTTP/2, connection pooling, CORS -- all the hard networking problems.

**Two interception strategies (use both):**

1. **High-level override:** Override the `http`/`https` Node modules with fetch-based implementations in the browser builtins layer. This catches SDK usage like the Anthropic SDK.

2. **Low-level intercept:** At the libuv TCP connect level, detect HTTP/HTTPS patterns and redirect to a ServiceWorker-based proxy. This catches lower-level code.

**Build order implication:** The high-level http/https override is simpler and should be built first. It handles 90% of Claude Code's network needs (API calls). Low-level TCP intercept is a stretch goal.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Compiling V8 to Wasm

**What:** Attempting to compile the full V8 JavaScript engine to WebAssembly alongside the Node.js C++ modules.

**Why bad:** V8 is ~10M lines of C++ with JIT compilers that generate native machine code. Emscripten's maintainers closed this as "wontfix" (GitHub #9314). It would produce a 50-80MB binary running at a fraction of native speed, defeating the purpose. The N-API split architecture deliberately avoids this.

**Instead:** Use the browser's native JS engine for JavaScript execution. Only compile the C++ module layer to Wasm.

### Anti-Pattern 2: Full POSIX Socket Emulation

**What:** Trying to implement TCP/UDP sockets in Wasm via WebSocket tunneling to a server-side proxy.

**Why bad:** Adds a server dependency (defeating "runs entirely in browser"), introduces latency for every packet, requires server infrastructure, and doesn't actually improve compatibility for the target use case (HTTPS API calls).

**Instead:** Intercept at the HTTP level using browser fetch(). For the rare case needing raw sockets, use WebTransport (if available) or return ENOSYS and let the application fall back.

### Anti-Pattern 3: Monolithic Wasm Binary

**What:** Compiling all ~46 Node.js modules into a single Wasm module without considering which ones are actually needed.

**Why bad:** Produces a 40-50MB binary when Claude Code likely only needs ~15-20 modules (fs, path, http, https, crypto, streams, buffer, process, child_process, os, util, events, url, net, tls, querystring, zlib).

**Instead:** Use Emscripten's `-sEXPORTED_FUNCTIONS` and link-time optimization to tree-shake unused code. Consider a two-tier build: core modules (always loaded) and optional modules (lazy-loaded).

### Anti-Pattern 4: Synchronous OPFS on Main Thread

**What:** Attempting to use FileSystemSyncAccessHandle on the main thread.

**Why bad:** SyncAccessHandle is only available in dedicated Web Workers. Calling it from the main thread throws. If the Wasm runtime runs on the main thread, all OPFS access must be async (via JSPI or proxied to a worker).

**Instead:** Run the Wasm runtime in a Web Worker (preferred) or use JSPI to suspend for async OPFS calls from the main thread. WasmFS with OPFS backend handles this automatically when configured correctly.

### Anti-Pattern 5: Reimplementing N-API from Scratch

**What:** Building a complete N-API implementation when emnapi already exists and is battle-tested.

**Why bad:** N-API has ~150+ functions with subtle semantics. The existing bridge has ~40 functions. Getting handle scopes, reference counting, error propagation, and threadsafe functions correct is months of work.

**Instead:** Evaluate adopting emnapi (used by napi-rs, Sharp on StackBlitz) for the N-API layer, or at minimum study its implementation to fill gaps in the current bridge. The existing custom bridge may be sufficient for Claude Code's subset of N-API, but emnapi is the fallback if edge cases appear.

## Scalability Considerations

| Concern | At MVP (1 user) | At Beta (100 users) | At Scale (10K+ users) |
|---------|-----------------|---------------------|----------------------|
| **Wasm binary size** | 40-50MB raw, 10-15MB gzipped; acceptable for first load | CDN caching essential; consider Brotli (better ratio) | Differential loading: core module first, optional lazy |
| **Memory usage** | 128MB initial, 4GB max; sufficient | Monitor per-tab memory; warn at 2GB | Implement memory pressure detection; offer "lite mode" |
| **OPFS storage** | Single user, few MB | Need cleanup/quota management | Storage pressure API; LRU eviction for old workspaces |
| **Startup time** | 3-5s cold, <1s cached Wasm | Pre-compile Wasm via Cache API | Snapshot-based instant boot (Wasm memory snapshot) |
| **Concurrent tabs** | N/A | OPFS lock conflicts between tabs | BroadcastChannel for tab coordination; single-writer |

## Suggested Build Order

The build order is dictated by dependency chains. Each phase produces testable artifacts.

### Phase 1: V8 Shim Completion + Clean Compilation

**Dependencies:** None (foundation)
**Produces:** edgejs.wasm binary that compiles without errors
**Why first:** Nothing else works until the Wasm binary compiles. Currently stuck on V8 embedding API shim gaps.

Key work:
- Complete V8 shim layers 3-13 (Internals offsets for wasm32, sandbox types, platform abstractions)
- Fix remaining Emscripten compiler errors (clang-for-wasm vs clang-for-linux differences)
- Apply patches to EdgeJS source where shims alone are insufficient
- Target: `emcmake cmake && make` succeeds with zero errors

### Phase 2: N-API Bridge Completeness

**Dependencies:** Phase 1 (need compiled Wasm to test against)
**Produces:** Wasm runtime that can execute basic JS via the bridge
**Why second:** The N-API bridge is the central nervous system. Every user-facing feature flows through it.

Key work:
- Expand N-API bridge from ~40 to ~80+ functions (add missing: ArrayBuffer, TypedArray, Promise, async work, threadsafe functions)
- Evaluate emnapi adoption vs. expanding current custom bridge
- Implement proper `napi_create_function` callback mechanism (current dynCall approach needs Emscripten integration)
- Wire up Emscripten module initialization → N-API environment creation
- Target: `runtime.eval('1 + 1')` returns `2`

### Phase 3: Core Module Bring-up (fs, path, streams, events)

**Dependencies:** Phase 2 (N-API bridge must work for module initialization)
**Produces:** Basic Node.js module system working in browser
**Why third:** These are the foundational modules everything else depends on.

Key work:
- Get `require()` working through N-API bridge
- MEMFS filesystem (Emscripten default) operational for fs module
- Streams implementation (critical for everything: HTTP, file I/O, child_process)
- EventEmitter working (base class for most Node.js objects)
- Browser builtins override layer (path, url, buffer, process, os, util)
- Target: `require('fs').writeFileSync('/tmp/test', 'hello')` works

### Phase 4: Network Layer (http, https, fetch proxy)

**Dependencies:** Phase 3 (streams must work for HTTP)
**Produces:** HTTPS API calls from within the runtime
**Why fourth:** Claude Code's core use case is API calls to Anthropic.

Key work:
- Browser builtin override for `http`/`https` modules using fetch()
- Handle streaming responses (SSE for Claude API)
- TLS handled entirely by browser (no Wasm OpenSSL for network)
- CORS considerations: may need proxy for non-CORS endpoints
- Target: Anthropic SDK's `client.messages.create()` succeeds

### Phase 5: Persistent Filesystem (OPFS)

**Dependencies:** Phase 3 (fs module working with MEMFS)
**Produces:** Files survive page reloads
**Why fifth:** Claude Code needs to read/write project files persistently.

Key work:
- Switch to WasmFS with OPFS backend (or layer OPFS mount over default FS)
- Handle Worker thread requirement for SyncAccessHandle
- Implement lock recovery for crash scenarios
- Storage quota management
- Target: Write file, reload page, read file back

### Phase 6: Subprocess Emulation (child_process via Web Workers)

**Dependencies:** Phase 2 (N-API), Phase 3 (streams for stdio)
**Produces:** `child_process.spawn()` runs JS in Web Workers
**Why sixth:** Claude Code spawns subprocesses. Web Workers are the closest browser equivalent.

Key work:
- Worker pool management
- Shared OPFS access between main and worker instances
- stdin/stdout/stderr piping via postMessage ↔ stream adapters
- Exit code handling
- Target: `child_process.execSync('node -e "console.log(42)"')` returns "42"

### Phase 7: Terminal UI + Integration

**Dependencies:** Phase 4 (network), Phase 5 (filesystem), Phase 6 (subprocess)
**Produces:** Claude Code running interactively in browser
**Why last:** Integration layer that brings everything together.

Key work:
- xterm.js terminal integration
- PTY emulation (pseudo-terminal via streams)
- Claude Code boot sequence (require Anthropic SDK, start conversation loop)
- Environment variable injection (API keys)
- Target: Full Claude Code conversation with file editing

## Component Interaction Matrix

```
                User  ModRes  Builtins  N-API  JSPI  Wasm   V8Shim  OPFS  Fetch  Workers
User App         -     R/W      -        -      -     -       -       -     -      -
Module Resolve  R/W     -      R/W      R/W     -     -       -       -     -      -
Browser Builtins -     R/W      -        -      -     -       -       -    R/W     -
N-API Bridge     -      -       -        -     R/W   R/W      -       -     -      -
JSPI Adapter     -      -       -       R/W     -    R/W      -      R/W   R/W    -
EdgeJS Wasm      -      -       -       R/W    R/W    -       C       -     -      -
V8 Shim Layer    -      -       -        -      -     C       -       -     -      -
OPFS Backend     -      -       -        -     R/W    -       -       -     -      -
Fetch Proxy      -      -      R/W       -     R/W    -       -       -     -      -
Web Workers      -      -       -       R/W     -    R/W      -      R/W    -      -

Legend: R/W = runtime data flow, C = compile-time dependency, - = no interaction
```

## Key Architecture Decisions

### Decision 1: Custom N-API Bridge vs. emnapi Adoption

**Recommendation:** Keep custom bridge for now, migrate to emnapi if gaps appear.

**Rationale:** The current custom bridge (~40 functions, 450 lines) is purpose-built for EdgeJS's specific N-API usage patterns. emnapi is comprehensive (~150 functions) but adds complexity and may conflict with EdgeJS's custom initialization flow. However, emnapi is battle-tested (Sharp, napi-rs) and handles edge cases (threadsafe functions, async work) that the custom bridge hasn't implemented. If Claude Code hits N-API functions not yet implemented in the custom bridge, emnapi is the proven fallback.

**Confidence:** MEDIUM -- depends on how much of N-API surface Claude Code actually exercises.

### Decision 2: WasmFS vs. Legacy FS for OPFS

**Recommendation:** Use WasmFS with OPFS backend.

**Rationale:** WasmFS is Emscripten's recommended filesystem, is production-stable, supports OPFS natively, and handles the Worker thread requirement for SyncAccessHandle internally. The legacy FS only supports IDBFS for persistence (3-4x slower than OPFS). The build already uses `-sFILESYSTEM=1`; switching to `-sWASMFS` with OPFS mount is straightforward.

**Confidence:** HIGH -- WasmFS OPFS is documented and recommended by Emscripten team.

### Decision 3: Network Strategy

**Recommendation:** High-level http/https module override using fetch(), not low-level TCP interception.

**Rationale:** Claude Code's network usage is HTTPS API calls to `api.anthropic.com`. The Anthropic SDK uses Node's http module or native fetch. Overriding the http/https modules with fetch-based implementations at the browser builtins layer handles this cleanly. Low-level TCP socket emulation via WebSocket/WebTransport proxy is unnecessary complexity for the target use case.

**Confidence:** HIGH -- the Anthropic SDK's network patterns are well-understood.

### Decision 4: JSPI as Primary Async Strategy

**Recommendation:** JSPI as primary, Asyncify as fallback for Safari.

**Rationale:** JSPI is Phase 4 standardized (April 2025), shipping in Chrome 137+ and Firefox 139+. It provides zero-overhead Wasm suspension. Safari has not yet shipped JSPI but has removed objections and assigned implementation. Asyncify adds 10-20% code size overhead and runtime performance penalty. Build with `-sJSPI=1` (already configured) and add Asyncify fallback path.

**Confidence:** HIGH -- JSPI standardization status is verified from W3C and V8 blog.

## Sources

- [Emscripten Building Projects](https://emscripten.org/docs/compiling/Building-Projects.html) -- official compilation guide
- [V8 JSPI Blog Post](https://v8.dev/blog/jspi) -- JSPI architecture and usage
- [JSPI Origin Trial (Chrome)](https://developer.chrome.com/blog/webassembly-jspi-origin-trial) -- browser support status
- [JSPI Phase 4 Standardization](https://github.com/WebAssembly/js-promise-integration/blob/main/proposals/js-promise-integration/Overview.md) -- W3C spec
- [OPFS MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) -- browser API reference
- [SQLite + OPFS (Chrome Blog)](https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system) -- OPFS performance data
- [WasmFS DeepWiki](https://deepwiki.com/emscripten-core/emscripten/3.4-wasmfs) -- WasmFS architecture and OPFS backend
- [emnapi Documentation](https://emnapi-docs.vercel.app/guide/) -- N-API for Emscripten reference implementation
- [napi-wasm (devongovett)](https://github.com/devongovett/napi-wasm) -- alternative N-API Wasm implementation
- [WebContainers (StackBlitz)](https://blog.stackblitz.com/posts/introducing-webcontainers/) -- prior art for browser Node.js
- [V8 to Wasm Issue #9314](https://github.com/emscripten-core/emscripten/issues/9314) -- confirmed infeasible
- [Emscripten Filesystem API](https://emscripten.org/docs/api_reference/Filesystem-API.html) -- FS backend documentation
- [Emscripten OPFS Discussion](https://github.com/emscripten-core/emscripten/discussions/21894) -- WasmFS OPFS use cases
- [Emscripten Wasm Workers API](https://emscripten.org/docs/api_reference/wasm_workers.html) -- Worker threading model

---

*Architecture research: 2026-03-18*
