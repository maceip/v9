# Pitfalls Research

**Domain:** Browser-native Node.js runtime via Emscripten (C++ to Wasm compilation with N-API bridge)
**Researched:** 2026-03-18
**Confidence:** HIGH (combination of project-specific codebase analysis, Emscripten official docs, and ecosystem post-mortems)

## Critical Pitfalls

### Pitfall 1: V8 Embedding API Pointer Width Mismatch on wasm32

**What goes wrong:**
V8's `v8::internal::Internals` class hardcodes pointer offsets assuming 64-bit (8-byte) pointers. On wasm32, pointers are 4 bytes. Shim headers that stub these offsets without adjusting for pointer width produce silent memory corruption: struct field accesses read/write at wrong offsets, corrupting adjacent fields or reading garbage data. The code compiles cleanly but produces wrong behavior at runtime.

**Why it happens:**
V8's embedding API was never designed for wasm32. The `Internals` class uses raw byte offsets (e.g., `kNodeFlagsOffset`, `kNodeStateFlagsFieldOffset`) computed for the host architecture. Developers write shims that get the types right but copy the offset constants verbatim from the x86_64 V8 headers.

**How to avoid:**
- Audit every `Internals` offset constant in shims against the actual struct layout under wasm32 (`sizeof(void*) == 4`). Compute offsets by summing member sizes with 4-byte pointer assumption.
- Write a compile-time static_assert that validates critical struct sizes match expected values under wasm32.
- For sandbox-related types (`SandboxedPointer`, `ExternalPointerTable`), provide complete no-op stubs since the V8 sandbox is irrelevant when V8 itself is not compiled.
- Use `offsetof()` macro where possible instead of hardcoded byte offsets.

**Warning signs:**
- Compilation succeeds but runtime crashes with misaligned memory access.
- N-API handle values appear corrupted (e.g., getting object when expecting string).
- Mysterious segfaults inside Emscripten's `__wasm_call_ctors`.
- Values shifted by exactly 4 bytes from expected position.

**Phase to address:**
Phase 1 (Compilation) -- must be correct before any runtime testing is meaningful. Every shim header in `wasi-shims/` that touches V8 internal types needs this audit.

---

### Pitfall 2: JSPI Performance Cliff on JS-to-Wasm-to-JS Call Chains

**What goes wrong:**
JSPI (JavaScript Promise Integration) is 350x slower than Asyncify when JavaScript calls into Wasm which then calls async JavaScript. This is the exact call pattern of the N-API bridge: browser JS calls `require('fs').readFile()` -> enters Wasm -> Wasm calls N-API import (back to JS) -> JS does async fetch/OPFS operation. Every N-API function invocation from a JS-initiated call path hits this penalty.

**Why it happens:**
JSPI's stack-switching mechanism has asymmetric performance. C-to-JS async calls are fast (3x faster than Asyncify), but JS-to-C-to-JS chains require full stack suspension and reconstruction per call. This is a browser engine implementation issue (filed as Chromium bug), not an Emscripten bug.

**How to avoid:**
- Do NOT use JSPI as the sole async strategy. Use JSPI for Wasm-initiated async (libuv event loop callbacks calling out to browser APIs) and Asyncify for JS-initiated calls into Wasm.
- Alternatively, batch N-API calls: instead of one Wasm import per N-API function, batch multiple operations into a single cross-boundary call that returns a result buffer.
- Profile early with realistic call patterns (not microbenchmarks) to measure actual overhead.
- Consider a hybrid approach: `-sJSPI=1` for the primary async path, but explicit `JSPI_IMPORTS` and `JSPI_EXPORTS` lists to control which functions use JSPI vs synchronous calls.

**Warning signs:**
- Simple operations (string creation, property access) taking milliseconds instead of microseconds.
- The event loop appearing "stuck" or sluggish despite low CPU usage.
- Performance 10-100x worse than expected based on native Node.js benchmarks.

**Phase to address:**
Phase 2 (Runtime bootstrapping) -- must validate async strategy before building features on top of it. This is an architectural decision that is expensive to change later.

---

### Pitfall 3: Wasm Memory Can Never Shrink -- Monotonic Growth to OOM

**What goes wrong:**
WebAssembly linear memory can grow via `memory.grow()` but can NEVER shrink. The current config (`INITIAL_MEMORY=128MB`, `MAXIMUM_MEMORY=4GB`) means any memory spike permanently consumes that memory for the tab's lifetime. A Claude Code conversation that processes large files will ratchet memory up and never release it, eventually hitting the 4GB ceiling or browser tab OOM.

**Why it happens:**
This is a fundamental WebAssembly specification limitation. Emscripten's `malloc`/`free` reuse freed blocks within the current memory, but if a spike causes `memory.grow()`, those pages are permanently allocated even after the data is freed. The browser tab's virtual address space is consumed and never returned.

**How to avoid:**
- Set `INITIAL_MEMORY` as high as the expected steady-state usage (not minimum). This prevents frequent growth operations. Estimate based on profiling: Node.js runtime + OpenSSL + libuv typically needs 64-96MB baseline.
- Implement a memory pressure monitoring system in the N-API bridge that tracks Wasm heap usage and warns before approaching limits.
- For large data processing (file reads, HTTP response bodies), stream through fixed-size buffers in Wasm memory instead of allocating proportional to data size. Use the browser-side JS heap for large temporary data.
- Design the OPFS file I/O to never load entire files into Wasm memory -- stream via chunked reads through a fixed 64KB transfer buffer.
- Consider module splitting: if memory pressure is critical, spawn a fresh Wasm instance in a Web Worker for heavy operations, let it OOM-safely, and collect results.

**Warning signs:**
- `performance.measureUserAgentSpecificMemory()` showing monotonic growth.
- Wasm memory usage reported by `emscripten_get_heap_size()` only ever increasing.
- Browser tab becoming sluggish after processing several large files.
- OOM crashes on mobile browsers (which have ~1-2GB limits, not 4GB).

**Phase to address:**
Phase 2 (Runtime) for monitoring, Phase 3 (File I/O) for streaming architecture. The streaming-not-buffering principle must be established before implementing fs, http, or crypto modules.

---

### Pitfall 4: N-API Handle Table Leak Causes Silent Memory Exhaustion

**What goes wrong:**
The handle table (`NapiBridge.handles[]`) grows without bounds. Each N-API call creates handles for arguments, return values, and intermediate objects. If handle scopes are not correctly paired (open/close) -- which is common during error paths -- handles leak permanently. Over an extended Claude Code session (hundreds of tool calls), the handle table grows to millions of entries, consuming browser memory on the JS side.

**Why it happens:**
N-API's handle scope model requires precise discipline: every `napi_open_handle_scope` must have a matching `napi_close_handle_scope`, even on error paths. The current implementation has exception handling stubbed out (`napi_is_exception_pending` always returns 0), so error paths skip cleanup. Additionally, persistent references (`napi_create_reference`) are tracked separately and never audited for leaks.

**How to avoid:**
- Implement a handle scope watermark: if handles exceed a threshold (e.g., 10,000) without returning to scope depth 0, log a warning with allocation stack traces.
- Add a periodic handle table compaction that runs during idle libuv ticks: identify handles not referenced by any active scope and release them.
- Fix exception handling BEFORE building features on the bridge. The stubbed `napi_is_exception_pending` means every error path is a potential handle leak.
- Implement handle scope nesting validation: detect double-close, missing close, and imbalanced open/close pairs by tracking scope IDs on a stack.

**Warning signs:**
- `bridge.handles.length` growing monotonically across operations.
- Browser DevTools heap snapshot showing NapiBridge as a top retainer.
- Performance degradation after many operations (linear scan through large handle array).
- `handleFreeList` becoming very large (sign of high churn without compaction).

**Phase to address:**
Phase 1 (N-API bridge hardening) -- this must be solid before any extended runtime testing. Handle leaks are invisible in short tests but fatal in production sessions.

---

### Pitfall 5: Cross-Origin Isolation Headers Break Third-Party Integrations

**What goes wrong:**
SharedArrayBuffer requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers. These headers break OAuth popups, third-party iframes, payment widgets, analytics scripts, and any cross-origin resource without explicit CORS/CORP headers. Deploying EdgeJS into an existing web app silently breaks unrelated features.

**Why it happens:**
The project requires `SharedArrayBuffer` for `-sSHARED_MEMORY=1` and `-pthread` (used for Wasm threading). COOP `same-origin` prevents `window.opener` relationships, breaking popup-based OAuth flows. COEP `require-corp` blocks cross-origin resources that don't send `Cross-Origin-Resource-Policy` headers.

**How to avoid:**
- Determine if threading is actually required. If the libuv event loop can run single-threaded with JSPI for async, drop `-sSHARED_MEMORY=1` and `-pthread` entirely, eliminating the cross-origin isolation requirement.
- If threading is needed, run the Wasm module in a dedicated Web Worker (which can be cross-origin isolated independently) while the main page remains un-isolated.
- If full-page isolation is unavoidable, use `credentialless` COEP instead of `require-corp` (Chrome 96+), which is less restrictive for third-party resources.
- Document the header requirements prominently in the SDK and provide a diagnostic function that checks headers before initialization.

**Warning signs:**
- OAuth "Sign in with Google/GitHub" flows silently failing.
- Third-party scripts (analytics, error tracking) blocked in DevTools Network panel.
- Console errors: `blocked:NotSameOriginAfterDefaultedToSameOriginByCoep`.
- SharedArrayBuffer constructor throwing on instantiation.

**Phase to address:**
Phase 1 (Build configuration) -- this architectural decision cascades into every deployment. Evaluate single-threaded feasibility first.

---

### Pitfall 6: Emscripten Binary Size Explosion from Unused Node.js Modules

**What goes wrong:**
Compiling all ~46 Node.js C++ built-in modules to Wasm produces a 40-50MB binary. Claude Code only uses a subset (fs, path, crypto, http/https, stream, buffer, process, child_process, url, events). Dead code elimination fails because Node.js module registration uses function pointers in a global table, preventing LTO from proving modules are unused.

**Why it happens:**
Node.js built-in modules register via `NODE_MODULE_CONTEXT_AWARE_INTERNAL(name, init)` which stores function pointers in a linker-visible table. Even with `-O3` and LTO, the linker cannot eliminate modules whose init function is in the table. OpenSSL alone is 5-10MB of Wasm. Modules like `cluster`, `dgram`, `tls` (raw sockets), `v8` (profiler) are dead weight in a browser.

**How to avoid:**
- Build a module whitelist: only compile the ~12 modules Claude Code actually uses. Stub the rest with `napi_throw_error("Module not available in browser")`.
- Use Emscripten's `-sEXPORT_NAME` with explicit `EXPORTED_FUNCTIONS` to enable aggressive dead code elimination.
- Enable LTO (`-flto` on all compilation units AND link step) to allow cross-module inlining and elimination.
- Use `wasm-opt -Oz` post-link for Binaryen-level size optimization.
- Enable `-sEVAL_CTORS` to evaluate static constructors at compile time and snapshot the result.
- Split the module: defer-load rarely-used modules (crypto, http2) as separate Wasm chunks via Emscripten module splitting.

**Warning signs:**
- Wasm binary exceeds 20MB compressed (target should be 8-12MB gzipped).
- `wasm-objdump --section` showing large `.data` segments from OpenSSL cipher tables.
- Initial page load taking >5 seconds on broadband.
- Mobile users unable to load the application at all.

**Phase to address:**
Phase 1 (Compilation) for module whitelist, Phase 3 (Optimization) for LTO/splitting. The whitelist decision should happen early because it reduces compilation iteration time.

---

### Pitfall 7: Null Terminator Scanning as a DoS Vector in N-API Bridge

**What goes wrong:**
When N-API functions receive `length == -1` (meaning "null-terminated string"), the bridge scans Wasm memory with `indexOf(0, ptr)` starting from the pointer. If the string is not null-terminated -- due to a bug, corruption, or malicious Wasm -- the scan traverses up to 128MB-4GB of memory, freezing the browser tab for seconds to minutes.

**Why it happens:**
N-API convention allows `-1` as a "compute the length" sentinel. The Node.js native implementation handles this safely because native memory access is fast and address sanitizers catch overruns. In the browser, scanning a `Uint8Array` view of Wasm memory is JavaScript-speed, orders of magnitude slower, and there's no guard page to fault on.

**How to avoid:**
- Cap null-terminator scans at a reasonable maximum (e.g., 1MB). Return `NAPI_STRING_EXPECTED` if no terminator found within the cap.
- Where possible, mandate explicit length parameters from the Wasm side (never pass -1). Audit EdgeJS C++ source for all `napi_create_string_utf8` calls with `-1` length.
- Use a WebAssembly-side helper function (exported from Wasm) to compute string length, which executes at Wasm speed instead of JS speed.
- Add a timeout to the scan: if scanning takes >10ms, abort and return error.

**Warning signs:**
- Browser DevTools showing long tasks (>50ms) in the N-API bridge during string operations.
- Tab becoming unresponsive during routine operations.
- Performance varying wildly depending on where in Wasm memory strings are allocated.

**Phase to address:**
Phase 1 (N-API bridge hardening) -- fix before any integration testing. This is both a performance and security issue.

---

### Pitfall 8: Asyncify Code Size and Stack Depth Explosion

**What goes wrong:**
Asyncify (the fallback for non-JSPI browsers) instruments ALL functions in the call graph between async entry points and async leaves. For a codebase as large as Node.js core (~46 modules + libuv + OpenSSL), this means instrumenting thousands of functions, adding ~50% to binary size AND ~50% runtime overhead per instrumented call.

**Why it happens:**
Asyncify works by transforming every function in the potential async call chain to save/restore its local state. Without explicit `ASYNCIFY_ONLY` lists, Emscripten conservatively instruments everything. The Node.js call graph is deep (user JS -> N-API -> module -> libuv -> syscall), meaning nearly every function gets instrumented.

**How to avoid:**
- Use `ASYNCIFY_ONLY` to whitelist only the functions that actually need async support. This requires tracing the call paths from POSIX blocking calls (read, write, connect, etc.) back to their N-API entry points.
- Prefer JSPI as the primary path and accept that Asyncify fallback will be slower and larger. Do not try to make both paths equally optimized.
- If supporting non-JSPI browsers, build two separate Wasm binaries: one with JSPI (smaller, faster), one with Asyncify (larger, wider compat). Detect at runtime and load the appropriate one.
- Use `-sASYNCIFY_STACK_SIZE` carefully -- too small causes stack overflow in deep call chains, too large wastes memory per suspended call.

**Warning signs:**
- Asyncify-instrumented binary being >2x the size of non-instrumented.
- Stack overflow errors in Asyncify'd code paths.
- `-sASYNCIFY_ADVISE` showing thousands of instrumented functions.

**Phase to address:**
Phase 2 (Async I/O strategy) -- decide the dual-binary approach before optimizing. This affects build pipeline architecture.

---

### Pitfall 9: Wasm Module Instantiation Race Condition

**What goes wrong:**
N-API bridge functions are called before `onRuntimeInitialized` fires. The bridge's `this.memory` is null, causing all pointer dereferences to throw. This manifests as a cryptic error during `__wasm_call_ctors` (Emscripten's static constructor phase) because static constructors in C++ call N-API functions to set up the module registry.

**Why it happens:**
Emscripten runs `__wasm_call_ctors` as part of module instantiation, before the `onRuntimeInitialized` callback. If EdgeJS's static constructors call N-API functions (e.g., `napi_module_register`), these calls hit the bridge before `memory` is set. The current code (per CONCERNS.md) has no initialization barrier.

**How to avoid:**
- Set `bridge.memory` from the Wasm import object creation (before instantiation), not from the `onRuntimeInitialized` callback. The memory export is available as soon as the module is instantiated.
- Implement an initialization queue: if `memory` is not yet set when an N-API function is called, queue the call and replay after initialization.
- Alternatively, use Emscripten's `--pre-js` to inject memory setup code that runs before `__wasm_call_ctors`.
- Add a clear error message: "N-API bridge called before initialization" instead of a null dereference.

**Warning signs:**
- Crashes on module load with no useful stack trace.
- `TypeError: Cannot read properties of null (reading 'buffer')` in the N-API bridge.
- Module works in one browser but not another (different static constructor ordering).

**Phase to address:**
Phase 1 (Module bootstrap) -- this blocks all subsequent work. First thing to fix when the Wasm module first compiles successfully.

---

### Pitfall 10: Browser fetch Proxy Losing HTTP Semantics

**What goes wrong:**
Routing Node.js HTTP/HTTPS requests through browser `fetch()` silently drops features that Claude Code's Anthropic SDK depends on: streaming response bodies (SSE for conversation streaming), custom HTTP headers that browsers restrict (e.g., `Host`, `Connection`), request cancellation, and HTTP/2 server push. The SDK appears to work for simple requests but fails for streaming conversations.

**Why it happens:**
Browser `fetch()` is not a raw HTTP client. It enforces CORS, restricts certain headers ("forbidden headers"), does not expose raw TCP streams, and handles redirects/cookies differently than Node.js's `http` module. Developers build the proxy for simple GET/POST and miss the streaming case.

**How to avoid:**
- Prioritize streaming response support from day one. Use `fetch()` with `response.body.getReader()` to get a `ReadableStream`, then feed chunks back to the Wasm-side http module's data events.
- Maintain a list of "forbidden headers" that Node.js sets but browsers block, and silently drop them instead of erroring.
- For SSE (Server-Sent Events), which is how Claude's API streams responses, implement a proper EventSource or fetch-with-streaming bridge, not a simple request/response pattern.
- Test with the actual Anthropic SDK streaming endpoint early -- do not defer network testing to late phases.

**Warning signs:**
- Simple API calls working but streaming conversations hanging or returning empty.
- CORS preflight errors in browser console.
- Missing response headers that the SDK expects (e.g., `x-request-id`).
- Request cancellation not working (fetch `AbortController` semantics differ from `req.destroy()`).

**Phase to address:**
Phase 3 (Networking) -- but design the streaming architecture in Phase 2 when establishing the N-API bridge patterns. This is the make-or-break feature for Claude Code.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Stubbing exception handling (`napi_is_exception_pending` returns 0) | Faster N-API bridge iteration | Every error path leaks handles, silent failures impossible to debug | Never -- fix in Phase 1 before building features |
| `-sERROR_ON_UNDEFINED_SYMBOLS=0` in toolchain | Compilation proceeds past missing symbols | Runtime crashes on any call to an unresolved symbol, with no useful error | Only during initial compilation iteration (Phase 1). Must be removed before Phase 2 |
| `ALLOW_UNIMPLEMENTED_SYSCALLS=1` | Stubs missing POSIX calls as no-ops | Syscalls that silently return 0 instead of ENOSYS cause wrong behavior (e.g., `flock()` appearing to succeed) | Only in Phase 1. Replace with explicit stubs that log warnings in Phase 2 |
| Copying all V8 offset constants from x86_64 headers | Shims compile quickly | Silent memory corruption on wasm32 due to pointer width mismatch | Never -- always compute offsets for wasm32 |
| Single Wasm binary for all browsers | Simpler build pipeline | JSPI-only users pay Asyncify overhead, Asyncify-only users can't use JSPI speed | Acceptable for MVP, split binaries in optimization phase |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Anthropic API (streaming) | Using simple fetch request/response, missing SSE streaming | Use `fetch()` with `ReadableStream` reader, pipe chunks to Node.js http `IncomingMessage` events |
| OPFS (persistent filesystem) | Treating OPFS as synchronous like Node.js fs | OPFS access handles are async. Use `createSyncAccessHandle()` in Web Workers for sync-like access, async API from main thread |
| Web Crypto API | Assuming identical API surface to Node.js crypto | Web Crypto is async-only (returns Promises), missing many algorithms Node.js supports (e.g., `createCipher` with arbitrary algorithms). Must fall back to Wasm OpenSSL for unsupported operations |
| Web Workers (child_process) | Spawning workers with same Wasm module expecting shared memory | Each Worker gets its own Wasm memory instance. SharedArrayBuffer requires cross-origin isolation. Communication is via `postMessage()` serialization, not shared memory by default |
| xterm.js (terminal UI) | Connecting stdout/stderr directly to xterm | Emscripten's `print`/`printErr` are synchronous. xterm.js `write()` may buffer. Need flow control to prevent output overwhelming the terminal renderer |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| TextEncoder/TextDecoder per N-API call | 20-50x slower string marshaling than cached instances | Cache a single global `TextEncoder` and `TextDecoder` instance, reuse across all N-API calls | Immediately -- every N-API string operation |
| Full Wasm memory scan for null terminators | Tab freeze for 100ms-10s during string creation | Cap scan length, mandate explicit lengths from Wasm side | Strings allocated near end of 128MB+ heap |
| Handle table linear growth without compaction | Gradual memory increase, GC pressure, slower handle lookup | Implement generational handle table or periodic compaction during idle ticks | After ~100K handle allocations (typical in a 30-minute Claude Code session) |
| Synchronous Wasm compilation on main thread | Chrome refuses to compile modules >4KB synchronously | Use `WebAssembly.compileStreaming()` with async instantiation. Never `new WebAssembly.Module()` for production Wasm | Immediately for any non-trivial module |
| Emscripten filesystem (MEMFS) for large files | High memory usage, slow reads for files >1MB | Stream through fixed-size transfer buffers. Use OPFS for persistence, MEMFS only for small temp files | Files exceeding ~10MB |
| JSPI JS-to-Wasm-to-JS call chains | 350x slower than expected for common N-API patterns | Batch N-API calls, minimize cross-boundary round-trips per operation | Noticeable at >100 N-API calls per second |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing handle table indices in error messages | Wasm module can enumerate all JS values by probing handle IDs | Use opaque error messages, validate handle ownership per scope |
| No pointer bounds checking in N-API imports | Wasm can read/write arbitrary JS heap via crafted pointers | Validate all pointer arguments are within Wasm memory bounds before dereferencing |
| API keys in Wasm environment variables readable via memory dump | Browser DevTools or malicious extension can read Wasm linear memory | Keep API keys in JS-side closure, pass per-request via N-API call, never store in Wasm memory |
| `napi_call_function` with no allowlist | Wasm can invoke any JS function via handle table (including `eval`, DOM manipulation) | Implement function call proxy that restricts callable functions to a known set |
| SharedArrayBuffer enabling Spectre-class timing attacks | Side-channel attacks on same-origin data | Only enable SharedArrayBuffer if threading is genuinely needed. Prefer single-threaded with JSPI |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| 40-50MB initial download with no progress indicator | User sees blank page for 10-30 seconds, assumes broken | Show loading progress bar with phase indicators (downloading, compiling, initializing). Use `compileStreaming` for progressive compilation |
| OOM crash with no recovery | Tab crashes, user loses conversation state | Monitor memory pressure, warn user before OOM, persist conversation state to OPFS incrementally |
| Asyncify fallback silently 50% slower | Firefox/Safari users have degraded experience with no explanation | Detect engine capabilities on load, show banner: "For best performance, use Chrome 123+" |
| COOP/COEP headers breaking host page features | Developer integrating EdgeJS SDK finds their OAuth, analytics, payments broken | Document header requirements prominently. Provide Web Worker isolation mode that avoids main-page header requirements |
| Missing Node.js module errors at runtime | User tries `require('net')` and gets cryptic Wasm trap | Return clear error: "Module 'net' is not available in the browser environment. See docs for alternatives." |

## "Looks Done But Isn't" Checklist

- [ ] **N-API bridge:** Exception handling stubbed -- verify `napi_throw_error` actually propagates to JS caller and `napi_is_exception_pending` returns correct state
- [ ] **Streaming HTTP:** Simple request/response works but verify SSE streaming with `Transfer-Encoding: chunked` delivers incremental chunks to Node.js callback
- [ ] **Handle scopes:** Open/close works in happy path -- verify handles are actually freed on scope close, and error paths don't leak
- [ ] **Filesystem:** `readFile`/`writeFile` works -- verify `createReadStream`/`createWriteStream` with backpressure, and `watch()`/`watchFile()` (needed by Claude Code)
- [ ] **Process module:** `process.env` and `process.cwd()` work -- verify `process.exit()`, `process.on('uncaughtException')`, `process.nextTick()` (critical for Node.js event loop semantics)
- [ ] **Crypto:** SHA-256 hashing works -- verify `crypto.createSign()`, `crypto.randomBytes()` (synchronous!), and HMAC which Anthropic SDK uses for request signing
- [ ] **Child process:** Web Worker spawning works -- verify `child_process.spawn()` with stdout/stderr piping, exit codes, and signal handling (Claude Code spawns git, ripgrep, etc.)
- [ ] **Binary size:** Module compiles -- verify gzipped size is <15MB and initial load time is <5 seconds on median connection
- [ ] **Memory stability:** Short test works -- verify 30-minute continuous session doesn't show monotonic memory growth

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| V8 pointer width mismatch | MEDIUM | Audit all shim headers, add static_asserts, recompile. Localized to `wasi-shims/` directory |
| JSPI performance cliff | HIGH | Requires architectural change to async strategy. May need dual-binary approach or N-API call batching redesign |
| Wasm memory never shrinks | MEDIUM | Implement streaming I/O patterns retroactively. Add memory monitoring. Cannot fix the fundamental Wasm limitation |
| Handle table leaks | MEDIUM | Fix exception handling, add scope validation, implement compaction. Requires N-API bridge refactor but doesn't change external API |
| Cross-origin isolation breaks integrations | LOW | Move Wasm to Web Worker, or evaluate dropping threading requirement. Configuration change, not code rewrite |
| Binary size explosion | MEDIUM | Create module whitelist, enable LTO, strip unused modules. Build system changes, may require EdgeJS source patches |
| Null terminator scanning DoS | LOW | Add length cap to `readString()`. One-line fix with large impact |
| Asyncify code bloat | MEDIUM | Add `ASYNCIFY_ONLY` whitelist or build separate binary. Requires call graph analysis |
| Initialization race condition | LOW | Move memory assignment to pre-instantiation. Small code change |
| fetch proxy missing streaming | HIGH | Redesign HTTP bridge for streaming. Must touch N-API bridge, http module shim, and test with real API |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| V8 pointer width mismatch | Phase 1 (Compilation) | `static_assert(sizeof(void*) == 4)` passes; no memory corruption in runtime tests |
| JSPI performance cliff | Phase 2 (Runtime bootstrap) | Benchmark N-API round-trip: <1ms for 100 calls from JS-initiated path |
| Wasm memory never shrinks | Phase 2-3 (Runtime + I/O) | 30-minute session memory stays within 2x of baseline |
| Handle table leaks | Phase 1 (N-API hardening) | Handle count returns to baseline after scope close; 1000-iteration stress test shows no growth |
| Cross-origin isolation | Phase 1 (Build config) | SDK works in a page without COOP/COEP, OR documents requirements and provides Worker isolation |
| Binary size explosion | Phase 1 (Compilation) | Gzipped Wasm <15MB; loads in <5s on 50Mbps connection |
| Null terminator scanning | Phase 1 (N-API hardening) | `readString` with no terminator returns error within 1ms, not tab freeze |
| Asyncify code bloat | Phase 2 (Async strategy) | Asyncify binary <2x JSPI binary size; `ASYNCIFY_ADVISE` shows <200 instrumented functions |
| Initialization race | Phase 1 (Module bootstrap) | N-API calls during `__wasm_call_ctors` succeed without null dereference |
| fetch proxy streaming | Phase 3 (Networking) | Anthropic SDK streaming conversation delivers tokens incrementally to terminal |

## Sources

- [Emscripten Asyncify Documentation](https://emscripten.org/docs/porting/asyncify.html) -- JSPI vs Asyncify tradeoffs, JSPI_IMPORTS/JSPI_EXPORTS configuration
- [JSPI Performance Issue #21081](https://github.com/emscripten-core/emscripten/issues/21081) -- 350x JS-to-Wasm-to-JS slowdown benchmarks
- [JSPI SuspendError Issue #24302](https://github.com/emscripten-core/emscripten/issues/24302) -- __wasm_call_ctors suspension failures
- [WebAssembly Memory Design Issue #1397](https://github.com/WebAssembly/design/issues/1397) -- memory can never shrink, fundamental limitation
- [StackBlitz: Debugging V8 WebAssembly Memory](https://blog.stackblitz.com/posts/debugging-v8-webassembly/) -- V8 address space exhaustion at ~100 Wasm instances
- [V8 Blog: 4GB Wasm Memory](https://v8.dev/blog/4gb-wasm-memory) -- browser memory limits and alignment issues
- [Emscripten Optimization Docs](https://emscripten.org/docs/optimizing/Optimizing-Code.html) -- LTO, meta-DCE, EVAL_CTORS, module splitting
- [NAPI-RS WebAssembly](https://napi.rs/docs/concepts/webassembly) -- SharedArrayBuffer requirements, zero-copy patterns
- [Cross-Origin Isolation Guide (web.dev)](https://web.dev/articles/cross-origin-isolation-guide) -- COOP/COEP deployment pitfalls
- [Emscripten FAQ](https://emscripten.org/docs/getting_started/FAQ.html) -- inline assembly, main loop, data type incompatibilities
- [V8 Blog: JSPI Introduction](https://v8.dev/blog/jspi) -- JSPI standardization and usage patterns
- [Emscripten Settings Reference](https://emscripten.org/docs/tools_reference/settings_reference.html) -- compiler flags and configuration
- [Reusing Legacy Code in WebAssembly (arXiv)](https://arxiv.org/html/2412.20258v1) -- cross-compilation semantics preservation challenges
- Project codebase: `.planning/codebase/CONCERNS.md`, `emscripten-toolchain.cmake`, `napi-bridge/index.js`

---
*Pitfalls research for: Browser-native Node.js runtime (EdgeJS v9)*
*Researched: 2026-03-18*
