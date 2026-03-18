# Architecture

**Analysis Date:** 2026-03-18

## Pattern Overview

**Overall:** Multi-layer WebAssembly bridge architecture with JavaScript-to-Wasm N-API translation layer.

**Key Characteristics:**
- Separation of concerns between Wasm runtime (C++) and browser JS engine
- N-API handle table bridges native code ↔ JavaScript values
- JSPI (JavaScript Promise Integration) enables async I/O without multithreading
- Emscripten compilation targets maximize browser compatibility
- Virtual filesystem (MEMFS) provides Node.js fs module compatibility

## Layers

**Browser JS Engine Layer:**
- Purpose: Execute user JavaScript natively with full JIT/optimization
- Location: Browser's native V8/JSC/SpiderMonkey
- Contains: User application code, API client libraries (Anthropic SDK, OpenAI, etc.)
- Depends on: N-API bridge exports
- Used by: Everything above the Wasm layer

**N-API Bridge Layer:**
- Purpose: Translate between JavaScript values and Wasm-side napi_value handles
- Location: `napi-bridge/index.js`
- Contains: Handle table management, type marshaling, memory read/write utilities
- Depends on: Emscripten runtime, Wasm memory
- Used by: EdgeJS C++ runtime via WebAssembly imports

**Browser Builtins Override Layer:**
- Purpose: Replace heavyweight Wasm-compiled modules with browser-native equivalents
- Location: `napi-bridge/browser-builtins.js`
- Contains: Bridges for crypto, path, url, buffer, process modules
- Depends on: Web Crypto API, URL API, TextEncoder/Decoder
- Used by: EdgeJS module resolution system

**JSPI Adapter Layer:**
- Purpose: Convert blocking POSIX I/O calls to async browser operations
- Location: `napi-bridge/jspi-adapter.js`
- Contains: WebAssembly.Suspending-wrapped imports for network/fs/timers
- Depends on: WebTransport, Web Crypto, fetch, setTimeout
- Used by: EdgeJS Wasm runtime for any blocking syscall

**WASI Shims Layer:**
- Purpose: Fill POSIX API gaps that Emscripten/libc don't provide
- Location: `wasi-shims/*.h` (60+ header files)
- Contains: V8 API stubs, V8 internal API declarations, filesystem hooks
- Depends on: EdgeJS C++ build system
- Used by: EdgeJS C++ compilation

**EdgeJS C++ Runtime Layer:**
- Purpose: Provide Node.js-compatible APIs and module system
- Location: `edgejs-src/src/*.cc` (~46 built-in modules)
- Contains: fs, http, https, crypto (OpenSSL), streams, net, path, url, process, etc.
- Depends on: libuv event loop, OpenSSL, nghttp2, WASI syscalls
- Used by: User JavaScript code executing in the browser

## Data Flow

**JavaScript Execution → Wasm:**

1. User calls `require('fs').readFile(path)` in browser JS
2. N-API bridge allocates handles for arguments: path string → handle H1
3. User JS returns a Promise; EdgeJS Wasm internally schedules callback
4. JSPI-wrapped read syscall suspends Wasm, returns Promise to browser
5. Browser performs actual I/O (Emscripten MEMFS or WebTransport proxy)
6. Promise resolves → Wasm stack resumes with result buffer
7. EdgeJS C++ converts result to JS value: handle H2 created by N-API bridge
8. User callback fires with result → Promise chain continues

**Wasm → JavaScript:**

1. EdgeJS C++ calls `napi_create_string_utf8(env, "hello", 5, &result_handle)`
2. N-API bridge's `napi_create_string_utf8` import executes:
   - Reads UTF-8 bytes from Wasm memory (ptr, len)
   - Creates JS string: `"hello"`
   - Allocates handle H5 in bridge's handle table
   - Writes H5 back to Wasm memory at result_handle pointer
3. EdgeJS C++ continues with handle H5, passes to user callback
4. User JavaScript receives string object normally

**State Management:**

- **Handle Table**: Linear array (`NapiBridge.handles[0..N]`) mapping integer handles to JS values
  - Well-known handles: 0=undefined, 1=null, 2=globalThis
  - Allocated handles: created on demand, recycled via free list
  - Scoped handles: created within `openHandleScope()`...`closeHandleScope()` are released automatically

- **Reference Counting**: `NapiBridge.refs` (Map) tracks N-API persistent references
  - Used for values that must outlive their handle scope
  - Incremented by `napi_create_reference()`, decremented by `napi_delete_reference()`

- **Wasm Memory**: Single `ArrayBuffer` shared between host JS and Wasm
  - Emscripten's heap management handles allocation
  - Read/write via `Uint8Array`, `Int32Array`, `Float64Array` views
  - UTF-8 strings marshaled via TextEncoder/TextDecoder

## Key Abstractions

**NapiBridge Class:**
- Purpose: Implements complete N-API specification for browser JS engine
- Examples: `napi-bridge/index.js` (450 lines, ~40 N-API function implementations)
- Pattern: Handle-based value marshaling with memory copying for strings/buffers
- Core methods:
  - `createHandle(value)`: Allocate new handle for JS value
  - `getHandle(handle)`: Resolve handle to actual value
  - `readString(ptr, len)`: Extract UTF-8 from Wasm memory
  - `writeString(ptr, str, maxLen)`: Encode string to Wasm memory
  - `getImports()`: Generate WebAssembly.imports object with all N-API functions

**Browser Builtin Modules:**
- Purpose: Reduce Wasm binary size by leveraging native browser APIs
- Examples:
  - `cryptoBridge`: SHA-256/384/512 hashing via Web Crypto API
  - `pathBridge`: Pure JS path manipulation
  - `urlBridge`: URL parsing via native URL class
  - `bufferBridge`: Uint8Array wrapper with encoding conversions
  - `processBridge`: Minimal process object (platform, env, cwd)
- Pattern: Object with methods matching Node.js module APIs

**JSPI Wrapper:**
- Purpose: Make async browser operations appear synchronous to Wasm
- Examples: `jspi-adapter.js` (192 lines)
- Pattern: `WebAssembly.Suspending(asyncFn)` - returns Promise, Wasm pauses until resolved
- Fallback: Emscripten's Asyncify (trampolining) if JSPI unavailable

**WASI Shim Headers:**
- Purpose: Fill libc/V8 API gaps for Emscripten+EdgeJS
- Examples:
  - `wasi-v8-missing-types.h`: V8 type definitions not in Emscripten sysroot
  - `wasi-v8-namespace-fix.h`: C++ namespace adjustments
  - `wasi-filesystem-stubs.h`: Minimal filesystem wrappers
- Pattern: Header-only includes, guard blocks, minimal inline implementations

## Entry Points

**Browser Page Loading:**
- Location: User HTML page imports `napi-bridge/index.js`
- Triggers: `initEdgeJS(options)` async function called
- Responsibilities:
  1. Load Emscripten-generated `edgejs.js` module
  2. Create `NapiBridge` instance
  3. Instantiate WebAssembly with N-API imports
  4. Initialize Emscripten filesystem with preloaded files
  5. Return runtime object with `.eval()`, `.runFile()`, `.fs`

**Wasm Module Initialization:**
- Location: `edgejs-src/src/edge_runtime.cc`
- Triggers: Emscripten's `_start()` / `onRuntimeInitialized()`
- Responsibilities:
  1. Initialize libuv event loop
  2. Register ~46 built-in Node modules
  3. Set up N-API context/environment
  4. Parse and execute JavaScript code via `edge_eval()` or `edge_run_file()`

**N-API Function Calls:**
- Location: `napi-bridge/index.js`, `getImports()` method
- Triggers: EdgeJS C++ code calls N-API function imports
- Responsibilities: Type-safe marshaling between Wasm and JS
- Example call chain:
  ```
  EdgeJS C++: napi_create_string_utf8(env, strPtr, len, &out)
    ↓
  Browser JS: bridge.napi_create_string_utf8(env, strPtr, len, outPtr)
    ↓
  Action: Read UTF-8 from Wasm memory, create JS string, allocate handle, write back
  ```

## Error Handling

**Strategy:** Exceptions caught at N-API boundary; errors propagated via return codes and exception flags.

**Patterns:**

1. **N-API Return Codes:**
   - `napi_call_function()` returns `NAPI_PENDING_EXCEPTION` if user JS throws
   - `NAPI_GENERIC_FAILURE` for bridge internal errors
   - `NAPI_OK` (0) for success
   - EdgeJS C++ checks return code and converts to JS exception if needed

2. **Wasm Memory Safety:**
   - `readString()` validates pointer range against Wasm memory size
   - Invalid handle reads throw Error (caught by N-API caller)
   - Out-of-bounds writes silently fail (Uint8Array bounds check)

3. **JSPI Promise Rejection:**
   - If async import Promise rejects, Wasm receives error code
   - EdgeJS C++ converts to POSIX errno (e.g., -1 = EIO)
   - User code receives Node-style error callback

4. **Fallback Behavior:**
   - JSPI not available → use Emscripten Asyncify (slower, but works)
   - WebTransport unavailable → return ENOSYS for network calls
   - Crypto algorithm unsupported → fall back to Wasm OpenSSL

## Cross-Cutting Concerns

**Logging:**
- Emscripten `print()` → captured by `initEdgeJS(options.onStdout)`
- N-API errors logged via `console.error('[napi]' ...)`
- JSPI failures logged to browser console with `[jspi]` prefix
- User application gets normal JavaScript `console.log()`, routed through Emscripten

**Validation:**
- Handle validation: `getHandle()` checks bounds [0, handles.length)
- String length: `readString()` with -1 length scans for null terminator
- Memory bounds: Emscripten's heap checks prevent overflow writes
- N-API type checking: `napi_typeof()` matches JS type to NAPI_* enum

**Authentication:**
- API keys passed via `initEdgeJS(options.env)` → Wasm environment variables
- Web Crypto for HMAC/SHA-256 (no Wasm OpenSSL for credentials)
- HTTPS with TLS 1.3 via fetch/WebTransport (browser enforces)
- No mutable credentials in bridge layer

**Module Resolution:**
- `registerBrowserBuiltins()` hooks EdgeJS's require() to override modules
- Wasm modules (fs, path, url, crypto, buffer, process) checked first
- For overridden modules, returns JS object instead of Wasm implementation
- User code sees seamless integration (no API differences)

---

*Architecture analysis: 2026-03-18*
