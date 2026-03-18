# Codebase Concerns

**Analysis Date:** 2026-03-18

## Tech Debt

**N-API Handle Management - Unbounded Growth:**
- Issue: Handle table (`NapiBridge.handles` array) grows indefinitely without cleanup mechanisms for long-running applications.
- Files: `napi-bridge/index.js` (lines 51-86)
- Impact: Memory leaks over extended runtime. Freed handles are recycled via `handleFreeList`, but if free list is exhausted or application creates handles faster than they're freed, array grows without bounds.
- Fix approach: Implement generational handle table or weak reference-based cleanup. Track allocation patterns to set reasonable limits or implement periodic compaction.

**Memory Pointer Assumptions in N-API Bridge:**
- Issue: String length calculations use `indexOf(0, ptr)` to find null terminators, which scans entire memory region if terminator is missing.
- Files: `napi-bridge/index.js` (lines 187-188, 249-250, 256-258, 265-266)
- Impact: DoS vulnerability—malformed or malicious Wasm can trigger full memory scans. Also assumes strings are always null-terminated, which may not hold for all Wasm callers.
- Fix approach: Add explicit length parameter validation, enforce length limits before scanning, or use pre-agreed string length protocols instead of null-termination detection.

**WASI Shims - Fragmented Header Architecture:**
- Issue: 47 separate header files with overlapping responsibilities create maintenance burden and unclear dependencies.
- Files: `wasi-shims/*.h` (entire directory)
- Impact: Changes to V8 or Node internals require updates across multiple files. Hard to test impact of changes. Difficult for new contributors to know which shim to modify.
- Fix approach: Consolidate shims by responsibility (V8 stubs, platform fixes, syscalls) into 3-4 master files. Create inclusion order documentation. Add CI test for missing symbols.

## Known Bugs

**String Creation Missing Length Validation:**
- Symptoms: `napi_create_string_utf8` accepts `length == -1` to indicate null-terminated string, but if actual data isn't null-terminated, reads past buffer boundary.
- Files: `napi-bridge/index.js` (lines 186-191)
- Trigger: Call with negative length and non-null-terminated data in Wasm memory.
- Workaround: Ensure all strings from Wasm are null-terminated and pass explicit lengths.

**Exception Handling Stubbed Out:**
- Symptoms: `napi_is_exception_pending` always returns 0, `napi_throw_error` only logs to console.
- Files: `napi-bridge/index.js` (lines 345-355)
- Impact: Errors from C++ in Wasm don't propagate to caller. Silent failures hard to debug. No way for Wasm to signal errors back to JS caller.
- Workaround: Return status codes from all operations instead of relying on exceptions.

**Browser Builtins Module Registration Not Implemented:**
- Symptoms: `registerBrowserBuiltins()` checks for `edgeInstance._registerBuiltinOverride` which doesn't exist.
- Files: `napi-bridge/browser-builtins.js` (lines 295-298)
- Impact: Browser-native crypto, path, url, process overrides are never injected into EdgeJS module system. Wasm always uses full OpenSSL/compiled implementations.
- Workaround: Manually integrate crypto operations using Web Crypto API before passing to Wasm.

## Security Considerations

**N-API Function Signature Mismatches:**
- Risk: N-API functions receive raw memory pointers from Wasm without validation. Incorrect pointer math or type confusion could corrupt handles table or global state.
- Files: `napi-bridge/index.js` (all import object functions)
- Current mitigation: Type checking via `typeof`, but no bounds checking on pointer arguments.
- Recommendations: Add pointer validation layer—verify offsets are within allocated ranges before dereferencing. Implement argument validation for all napi_* imports.

**Arbitrary Code Execution via Function Calls:**
- Risk: `napi_call_function` constructs function calls from Wasm without security context. Wasm can invoke any function in browser JS scope via handle table.
- Files: `napi-bridge/index.js` (lines 271-289)
- Current mitigation: None. Assumes Wasm is trusted source.
- Recommendations: If loading untrusted Wasm, implement function call whitelist or proxy pattern to restrict which browser APIs Wasm can invoke.

**Handle Table Enumeration:**
- Risk: If Wasm discovers handle table structure (via error messages or timing), it can enumerate stored JS objects by handle ID.
- Files: `napi-bridge/index.js` (line 91)
- Current mitigation: Error messages leak handle validity.
- Recommendations: Don't expose handle numbers in error messages. Use opaque handles or cryptographic tokens instead of array indices.

**Memory Buffer Overflow via writeString:**
- Risk: `writeString` trusts `maxLen` parameter. If Wasm passes small maxLen but large data, truncation is silent—could corrupt adjacent Wasm state.
- Files: `napi-bridge/index.js` (lines 132-141)
- Current mitigation: Truncation happens, but no status returned to indicate truncation.
- Recommendations: Return truncation status or throw on length mismatch.

## Performance Bottlenecks

**String Encoding/Decoding on Every Call:**
- Problem: Every `napi_create_string_utf8` and `napi_get_value_string_utf8` creates new TextEncoder/TextDecoder instances and encodes/decodes strings.
- Files: `napi-bridge/index.js` (lines 126-141, 186-191, 235-244)
- Cause: Naive implementation re-creates encoder/decoder per call. EdgeJS may call these frequently for argument marshaling.
- Improvement path: Cache global TextEncoder/TextDecoder instances. Consider lazy UTF-8 conversion (store as bytes, decode on demand).

**Handle Freelist Linear Search:**
- Problem: `handleFreeList.pop()` is O(1), but if free list is large, memory locality suffers.
- Files: `napi-bridge/index.js` (lines 72-79)
- Cause: Freed handles accumulate in list without compaction.
- Improvement path: Use object pool with preallocated slots, or implement handle recycling with generations.

**Full Memory Scan for Null Terminators:**
- Problem: `indexOf(0, ptr)` scans potentially MB of Wasm memory to find string terminator.
- Files: `napi-bridge/index.js` (lines 188, 250, 257, 266)
- Cause: Lazy null-termination detection instead of explicit length parameters.
- Improvement path: Make length parameter mandatory, remove indexOf pattern.

**Emscripten Link-Time Overhead:**
- Problem: Large initial Wasm payload (reportedly ~46 MB uncompressed before gzip, estimated 10-15 MB gzipped based on Makefile comments).
- Files: `emscripten-toolchain.cmake` (lines 51-65)
- Cause: Includes entire Node.js core library (~46 modules). OpenSSL, libuv, nghttp2 all compiled to Wasm.
- Improvement path: Tree-shake unused modules at link time. Stub out modules not needed in browser (e.g., cluster, child_process).

## Fragile Areas

**N-API Bridge Type Coercion:**
- Files: `napi-bridge/index.js` (lines 217-227)
- Why fragile: `napi_get_value_int32` uses JavaScript's `| 0` truncation, which silently truncates numbers. Large integers or NaN will silently convert to 0.
- Safe modification: Add explicit type guards before coercion. Return error status if value is not actually an integer.
- Test coverage: Tests in `tests/test-napi-bridge.mjs` cover happy path but not edge cases (NaN, Infinity, very large numbers).

**Handle Scope Invariants:**
- Files: `napi-bridge/index.js` (lines 105-121)
- Why fragile: Reference counting logic assumes scopes are properly nested and closed. If Wasm violates nesting (close scope twice, or close non-existent scope), undefined behavior.
- Safe modification: Add scope ID validation before popping. Implement scope stack consistency checks.
- Test coverage: `test-napi-bridge.mjs` line 275 tests open/close but doesn't test error cases (double-close, mismatched close).

**Wasm Module Initialization Race Condition:**
- Files: `napi-bridge/index.js` (lines 389-429)
- Why fragile: `bridge.memory` is set in `onRuntimeInitialized` callback, but other N-API functions may be called before initialization completes.
- Safe modification: Implement initialization barrier—block all N-API calls until `onRuntimeInitialized` fires, or queue pending operations.
- Test coverage: No test verifies behavior when N-API is called before initialization.

**Build Configuration Brittleness:**
- Files: `Makefile`, `build-emscripten.sh`
- Why fragile: Hardcoded assumptions about Emscripten SDK location (`~/emsdk`), CMake, git. Build fails if dependencies are missing or in non-standard paths.
- Safe modification: Validate all prerequisites before build. Provide clear error messages with remediation steps.
- Test coverage: Manual testing only. No CI to verify build reproducibility.

## Scaling Limits

**Wasm Memory Growth:**
- Current capacity: Configured for 128 MB initial, 4 GB maximum (line 53-54, `emscripten-toolchain.cmake`)
- Limit: Browser memory available to single tab. Most modern browsers can't allocate 4 GB per tab.
- Scaling path: For large payloads, implement streaming/chunked processing. Consider memmap-like interface for files. Monitor actual peak memory usage and set realistic INITIAL_MEMORY.

**Handle Table Unbounded Growth:**
- Current capacity: Grows as needed, no hard limit
- Limit: Each handle stores a JS reference. If application leaks handles, will eventually hit available memory.
- Scaling path: Implement max handles cap with eviction policy (LRU or weak references). Add metrics/warnings when approaching limit.

**String Length Handling:**
- Current capacity: No explicit limit on string length in N-API bridge
- Limit: `writeString` buffers in Wasm memory (configurable but typically 128 MB). Very long strings (>100 MB) will fail.
- Scaling path: Add chunk-based string transfer for large strings. Implement streaming string I/O.

## Dependencies at Risk

**Emscripten SDK Version Coupling:**
- Risk: Build hardcoded to Emscripten 3.1.64. If bug discovered in that version or newer V8 incompatibilities arise, stuck on old version.
- Impact: Security patches in newer Emscripten not available. V8 version in Emscripten drifts from upstream Node.js.
- Migration plan: Test compatibility with newer Emscripten versions quarterly. Implement version constraints in CI.

**EdgeJS Upstream Dependency:**
- Risk: Clones from `https://github.com/aspect-build/aspect-edgejs.git` (not original wasmerio). If this fork becomes unmaintained, updates from upstream Node.js won't flow through.
- Impact: Security issues in Node.js won't be patched. Missing features from newer Node releases.
- Migration plan: Maintain patch tracking against wasmerio/edgejs. Document which upstream commits are integrated.

**WASI Shims Adaptation Maintenance:**
- Risk: WASI shims adapted from node-wasix32 project (Multi-V-VM). If that project is abandoned or takes breaking changes, shims will diverge.
- Impact: New V8 versions may require additional shims. Build may fail on different platform architectures.
- Migration plan: Regularly sync with node-wasix32 upstream. Contribute improvements back to reduce maintenance burden.

## Missing Critical Features

**Error Propagation from C++ to JavaScript:**
- Problem: Exception handling is stubbed (always returns 0). If C++ code in Wasm throws, JS caller has no way to know.
- Blocks: Reliable error handling in applications using EdgeJS. Debugging becomes very difficult.
- Priority: High—this affects all error cases in Wasm code.

**Promise/Async Support in N-API:**
- Problem: N-API bridge has no async function support. All calls are synchronous.
- Blocks: Wasm calling back to browser async APIs (fetch, IndexedDB, etc.).
- Priority: High—modern browser applications are async-first.

**File System Performance Optimization:**
- Problem: Emscripten's virtual filesystem is implemented in JavaScript, very slow for large files.
- Blocks: File-heavy workloads (bundler, compiler running in browser).
- Priority: Medium—affects performance but not functionality.

**Module Hot Reload:**
- Problem: Once Wasm module is loaded, cannot reload updated code without full page refresh.
- Blocks: Development workflows. Can't hot-reload code changes in EditorJS or CLI.
- Priority: Medium—important for developer experience.

## Test Coverage Gaps

**N-API Error Cases:**
- What's not tested: Invalid handles, out-of-bounds pointers, type mismatches, memory corruption scenarios.
- Files: `tests/test-napi-bridge.mjs` tests happy path only (lines 15-350)
- Risk: Subtle memory corruption bugs won't be caught. Silent failures in edge cases.
- Priority: High

**Browser Builtin Integration:**
- What's not tested: Whether crypto/path/url overrides actually get injected and used by EdgeJS.
- Files: No test for `registerBrowserBuiltins()` (napi-bridge/browser-builtins.js)
- Risk: Wasm always uses slow Wasm-compiled implementations instead of browser APIs.
- Priority: High

**Emscripten Configuration Validation:**
- What's not tested: Whether `-sJSPI=1` (async support), `-sSTACK_SIZE=8MB`, threading flags actually work.
- Files: `emscripten-toolchain.cmake` (lines 50-65)
- Risk: Features may not work despite being configured. Build succeeds but runtime fails.
- Priority: Medium

**Cross-Platform Build Verification:**
- What's not tested: Build on macOS, Windows (WSL), different Linux distributions.
- Files: `Makefile`, `build-emscripten.sh`
- Risk: `stat` command differs between `stat -c%s` (GNU) and `stat -f%z` (BSD). Emscripten path assumptions may fail.
- Priority: Medium

**Memory Leak Detection:**
- What's not tested: Long-running applications creating/destroying many handles.
- Files: No stress test or leak detection
- Risk: Handle table grows indefinitely, consuming all available memory.
- Priority: High

---

*Concerns audit: 2026-03-18*
