# External Integrations

**Analysis Date:** 2026-03-18

## APIs & External Services

**Networking & HTTP:**
- HTTP/HTTPS - Built-in via nghttp2 and OpenSSL in Wasm
  - SDK/Client: nghttp2 (C library, compiled to Wasm)
  - Used for: HTTP requests, HTTPS connections, HTTP/2 protocol
- WebTransport (planned) - Mentioned in README for proxy to internet
  - Purpose: Secure, low-latency communication to external APIs
  - Target services: api.anthropic.com, api.openai.com

**Networking (Low-level):**
- DNS - Built-in via Wasm module
  - SDK/Client: c-ares or system DNS resolver (via POSIX syscalls)
  - Used for: Domain resolution

## Data Storage

**Databases:**
- None detected - Project is a JavaScript runtime, not an application with persistent storage
- Virtual filesystem only - In-memory filesystem provided by Emscripten

**File Storage:**
- Local filesystem only - Virtual filesystem provided by Emscripten (`-sFILESYSTEM=1`)
  - Backed by Wasm linear memory, not browser localStorage or IndexedDB
  - Initialized via `preRun` hook in `napi-bridge/index.js`

**Caching:**
- None - No built-in caching layer

## Authentication & Identity

**Auth Provider:**
- Custom - Application-level authentication handled by JavaScript code running in the runtime
- Implementation: Users of EdgeJS implement their own auth mechanisms
  - Web Crypto API available for key material handling
  - OpenSSL compiled to Wasm for certificate operations

## Monitoring & Observability

**Error Tracking:**
- None built-in - Errors logged to console via N-API bridge

**Logs:**
- Console output - Via Emscripten's `print` and `printErr` callbacks
- Configurable via `napi-bridge/index.js:initEdgeJS()`:
  - `options.onStdout` - stdout capture (default: console.log)
  - `options.onStderr` - stderr capture (default: console.error)

## CI/CD & Deployment

**Hosting:**
- Browser-based - WebAssembly runs natively in browser tab
- Development: Node.js (simulates browser loading)
- Production: Modern browsers with WebAssembly support

**CI Pipeline:**
- None detected - No GitHub Actions, Travis CI, or other CI configuration visible
- Manual build via Makefile: `make all`

## Environment Configuration

**Required env vars:**
- `EMSDK` - Path to Emscripten SDK directory (mandatory for build)
  - Default: `$HOME/emsdk`
  - Must be sourced: `source $EMSDK/emsdk_env.sh`

**Optional env vars:**
- `EMSDK_DIR` - Emscripten SDK directory (Makefile override, default: ~/emsdk)
- `BUILD_TYPE` - Release or Debug (default: Release)
- `JOBS` - Parallel build jobs (default: nproc)
- `EDGEJS_BRANCH` - EdgeJS git branch (default: main)
- `WASIX32_BRANCH` - node-wasix32 reference branch (default: main)

**Secrets location:**
- No secrets required for build
- Secrets would be passed at runtime via `initEdgeJS()` options in browser

## Webhooks & Callbacks

**Incoming:**
- None - Project is a runtime library, not a server

**Outgoing:**
- HTTP/HTTPS requests - Initiated by JavaScript code running in EdgeJS
- WebTransport connections (planned) - For secure communication to external services
- DNS queries - For domain resolution

## Runtime Integration Points

**Browser APIs Used:**
- Web Crypto API (`crypto.getRandomValues()`, `crypto.randomUUID()`, `crypto.subtle`)
  - Fallback implementations in `napi-bridge/browser-builtins.js`
- WebAssembly API (`WebAssembly.instantiate`, `WebAssembly.Suspending`)
- JSPI (JavaScript Promise Integration) - For async I/O operations
  - Requires Chrome 123+ or equivalent browser support
  - Graceful fallback to synchronous mode when unavailable

**Emscripten Integration:**
- Memory growth - Linear memory can expand up to 4GB
- Shared memory - For Web Worker threads
- JSPI support - Async operation suspension/resumption
- Filesystem abstraction - Virtual filesystem bridge
- Syscall layer - POSIX syscall mapping to browser/Emscripten APIs

## N-API Bridge Details

**Location:** `napi-bridge/index.js`

**Exports:**
- `NapiBridge` class - Manages Wasm ↔ JS engine integration
- `initEdgeJS(options)` - Async initialization function

**Options Object:**
```javascript
{
  moduleUrl: './edgejs.js',      // Emscripten module URL
  env: {},                        // Environment variables
  fs: { path: content },          // Initial filesystem files
  onStdout: console.log,          // stdout callback
  onStderr: console.error         // stderr callback
}
```

**Handle System:**
- Maps integer handles (0-N) to JavaScript values
- Well-known handles: 0=undefined, 1=null, 2=globalThis
- Handle scopes for automatic memory management

**Functions Implemented (50+):**
- Value creation: `napi_create_int32`, `napi_create_string_utf8`, `napi_create_object`, etc.
- Value access: `napi_get_value_int32`, `napi_get_value_double`, etc.
- Property operations: `napi_set_named_property`, `napi_get_named_property`, etc.
- Function calls: `napi_call_function`
- Type checking: `napi_typeof`
- Handle scopes: `napi_open_handle_scope`, `napi_close_handle_scope`
- References: `napi_create_reference`, `napi_delete_reference`
- Error handling: `napi_throw_error`, `napi_is_exception_pending`

## Browser Builtin Replacements

**Location:** `napi-bridge/browser-builtins.js`

**Module replacements available:**
- `crypto` - Partial: Web Crypto API for hash, random, key derivation
  - Falls back to Wasm OpenSSL for unsupported algorithms
  - Uses `crypto.getRandomValues()`, `crypto.subtle`
- More modules can be added as performance optimizations

## JSPI & Async I/O

**Location:** `napi-bridge/jspi-adapter.js`

**Purpose:** Bridge blocking POSIX I/O to async browser APIs

**Functions:**
- `wrapAsyncImport(asyncFn)` - Wraps async function for JSPI suspension
  - Uses `WebAssembly.Suspending` if available
  - Fallback: Emscripten Asyncify
- `wrapAsyncExport(wasmExport)` - Wraps Wasm export to handle Promise results

---

*Integration audit: 2026-03-18*
