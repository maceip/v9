# Phase 1: Wasm Compilation - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Compile a minimal set of Node.js C++ modules to a .wasm binary via Emscripten that loads and initializes in the browser without errors. This phase does NOT wire up the N-API bridge for full JS execution (Phase 2) or implement Node.js module APIs (Phase 3+). The deliverable is: `emcmake cmake && make` produces a .wasm that loads in Chrome.

</domain>

<decisions>
## Implementation Decisions

### Shim Strategy
- **Layered approach**: Keep individual shim header files but add a strict inclusion order via a master index header. Each file retains a single class of fix, but the master index defines the correct include sequence.
- **Consolidate before pushing forward**: Reorganize the existing 44 headers into a clean layered structure before tackling new compilation errors. Don't add more fragmented headers on top of the existing mess.
- **Static assertions for pointer widths**: Add `static_assert` checks for every V8 embedding API pointer offset in the shims. The wasm32 pointer width issue (flagged by research) must be caught at compile time, not discovered as silent runtime corruption.
- **Patch files for EdgeJS modifications**: When compilation errors require changes to EdgeJS C++ source (not just shim headers), use git-format patch files in the `patches/` directory applied at build time. Keep the EdgeJS submodule clean for upstream tracking.

### Module Scope
- **Minimal first**: Start with the absolute minimum module set: fs, path, events, buffer, util, process. Get a tiny .wasm loading in the browser.
- **Stub non-essential modules**: Modules not in the minimal set get empty .cc stub files that export symbols but do nothing. Linker stays happy; runtime throws "not implemented" if called.
- **Later phases expand**: Phase 1 = minimal .wasm loads. Phases 3-5 add modules (crypto, http, streams, etc.) as their features require them.
- **Binary size: don't optimize yet**: No size ceiling for Phase 1. Get it compiling first, optimize later.

### Claude's Discretion
- Emscripten version: stay on 3.1.64 or upgrade to 4.0.23 — Claude evaluates based on what causes fewer shim rewrites
- Exact module stub approach (empty functions vs #ifdef exclusion vs CMake targets)
- Build configuration details (optimization level, debug symbols, link flags)
- How to handle the wasi-shims-index.h master include ordering

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Build System
- `Makefile` — Build orchestration: setup, fetch, configure, build, test targets
- `emscripten-toolchain.cmake` — CMake toolchain: compiler flags, Wasm features, link flags, exported functions
- `build-emscripten.sh` — Legacy build script wrapper

### WASI Shims (current state)
- `wasi-shims/wasi-shims-index.h` — Current master include file
- `wasi-shims/wasi-v8-internals.h` — V8 Internals class rewrite for wasm32 pointers (critical for pointer width correctness)
- `wasi-shims/wasi-bytecodes-builtins-list.h` — Bytecode handler mappings (542 lines)
- `wasi-shims/wasi-v8-sandbox-stubs.h` — Sandbox/pointer table type stubs
- `wasi-shims/wasi-wasm32-arch-fixes.h` — Architecture-specific wasm32 fixes (112 lines)

### Codebase Analysis
- `.planning/codebase/CONCERNS.md` — Known bugs, tech debt, fragile areas (esp. shim fragmentation, pointer assumptions)
- `.planning/codebase/STACK.md` — Current toolchain versions and dependencies
- `.planning/codebase/ARCHITECTURE.md` — N-API bridge architecture and layer boundaries

### Research
- `.planning/research/STACK.md` — Emscripten version analysis, JSPI status, recommended upgrades
- `.planning/research/PITFALLS.md` — V8 pointer offset risks, compilation gotchas, memory management traps
- `.planning/research/ARCHITECTURE.md` — Build order recommendations, component boundaries

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `wasi-shims/` (44 headers, 3,875 lines): Existing shim work covering V8 embedding API, POSIX gaps, namespace fixes. Must be reorganized but not rewritten.
- `patches/` directory: Already exists in repo structure for EdgeJS source patches.
- `Makefile`: Full build pipeline with setup/fetch/configure/build/test/size targets.
- `emscripten-toolchain.cmake`: Complete Emscripten toolchain config with Wasm features, link flags, exported functions.

### Established Patterns
- Shim headers use `#ifndef` include guards (lint target checks this).
- EdgeJS configured with `EDGE_NAPI_PROVIDER=imports` and `EDGE_PLATFORM=emscripten`.
- Build outputs to `dist/` directory (edgejs.wasm, edgejs.js, edgejs.worker.js).
- `V8_JITLESS_MODE=1` defined — V8 engine internals are stubbed, not executed.

### Integration Points
- `edgejs-src/CMakeLists.txt` — EdgeJS build system that must accept our toolchain and shim includes.
- `EDGE_EXTRA_INCLUDES` CMake variable — how shims are injected into the build.
- `patches/` directory — where EdgeJS source modifications go (applied at build time).

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The user wants the iterative compile-fix-shim loop to converge on a clean build, using consolidated shims and static assertions to prevent silent corruption.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-wasm-compilation*
*Context gathered: 2026-03-18*
