# WASI Shims Inventory

**Date:** 2026-03-18

This document classifies every shim in `wasi-shims/` according to its necessity for the Emscripten/V8 build. 

## Classification Categories
*   **Retain:** Necessary and correct for the current architecture.
*   **Replace:** Contains fake behavior or mock success; needs actual implementation or strict failure.
*   **Remove:** Dead compatibility scaffold, no longer needed in Emscripten.

## Inventory

| Shim Header | Classification | Notes |
| :--- | :--- | :--- |
| `wasi-additional-fixes.h` | **Retain** | Core compatibility fixes. |
| `wasi-all-fixes.h` | **Replace** | Currently provides broad synthetic substitutes; need to narrow to only engine-fidelity implementations. |
| `wasi-bytecodes-builtins-list.h` | **Retain** | Required for V8 bytecode mapping. |
| `wasi-comprehensive-fixes.h` | **Remove** | Overly broad; should break down into specific retained fixes. |
| `wasi-consolidated-fixes.h` | **Remove** | Legacy node-wasix32 scaffold. |
| `wasi-cppgc-stubs.h` | **Replace** | Fake GC stubs; should be wired to Emscripten's memory management or strict failures. |
| `wasi-cppheap-pointer-table-stub.h` | **Replace** | Fake stub. |
| `wasi-emscripten-mmap-overrides.cc` | **Retain** | (Refactored) Essential for V8 memory alignment expectations. Strict semantics enforced. |
| `wasi-external-pointer-compat.h` | **Retain** | Compatibility for 32-bit pointers. |
| `wasi-filesystem-stubs.h` | **Replace** | Currently an empty placeholder; needs OPFS/JSPI implementation or strict errors. |
| `wasi-minimal-fixes.h` | **Remove** | Redundant. |
| `wasi-namespace-fixes.h` | **Replace** | Synthetic substitutes. |
| `wasi-node-compat.h` | **Retain** | Essential Node.js structural compat. |
| `wasi-platform-fixes.h` | **Retain** | Platform-specific constants. |
| `wasi-pointer-assertions.h` | **Retain** | Wasm32 pointer size checks. |
| `wasi-runtime-profiler-fixes.h` | **Replace** | Fake stubs. |
| `wasi-shims-index.h` | **Retain** | Index file. |
| `wasi-simdutf-compat.h` | **Retain** | SIMD compatibility mapping. |
| `wasi-simdutf-stubs.h` | **Replace** | Fake behavior. |
| `wasi-system-compat.h` | **Retain** | System POSIX definitions. |
| `wasi-v8-api-additions.h` | **Retain** | V8 API layer compat. |
| `wasi-v8-api-stubs.h` | **Replace** | Fake API implementations. |
| `wasi-v8-base-includes.h` | **Retain** | Core V8 includes. |
| `wasi-v8-bits-fixes.h` | **Retain** | Bitwise operation patches for 32-bit. |
| `wasi-v8-complete-missing.h` | **Remove** | Broad scaffold. |
| `wasi-v8-complete-types.h` | **Retain** | Type definitions. |
| `wasi-v8-custom-arguments.h` | **Retain** | ABI compatibility. |
| `wasi-v8-essential-constants.h`| **Retain** | Math/size constants. |
| `wasi-v8-flags-fix.h` | **Retain** | Command-line flag parsing compat. |
| `wasi-v8-initialization-functions.h`| **Retain** | Bootstrapping compat. |
| `wasi-v8-internals-constants.h`| **Retain** | V8 internal constants. |
| `wasi-v8-internals-minimal.h` | **Remove** | Redundant. |
| `wasi-v8-internals.h` | **Retain** | V8 internal structures. |
| `wasi-v8-isolate-extensions.h` | **Retain** | Isolate layout patches. |
| `wasi-v8-lazy-instance-fix.h` | **Retain** | Lazy instantiation compat. |
| `wasi-v8-minimal-missing.h` | **Remove** | Redundant scaffold. |
| `wasi-v8-missing-methods.h` | **Replace** | Fake empty method bodies. |
| `wasi-v8-missing-types.h` | **Retain** | Type declarations. |
| `wasi-v8-namespace-fix.h` | **Retain** | Internal namespace mappings. |
| `wasi-v8-node-missing.h` | **Replace** | Node.js polyfills that mock success. |
| `wasi-v8-operator-fix.h` | **Retain** | Operator overloading compat. |
| `wasi-v8-sandbox-stubs.h` | **Replace** | Fake V8 sandbox implementations. |
| `wasi-v8-segmented-table-fix.h`| **Retain** | Memory layout fix. |
| `wasi-v8-template-utils.h` | **Retain** | Template metaprogramming compat. |
| `wasi-v8-value-methods.h` | **Retain** | Value representation compat. |
| `wasi-wasm32-arch-fixes.h` | **Retain** | Essential Wasm32 architecture definition patches. |