# Technology Stack

**Analysis Date:** 2026-03-18

## Languages

**Primary:**
- C/C++ (C++20) - EdgeJS runtime, Node.js modules, crypto, HTTP, networking, filesystem
- JavaScript (ES modules) - N-API bridge, test harnesses, browser integration layer
- CMake - Build configuration and dependency management
- Bash - Build scripts and toolchain setup

**Secondary:**
- Python3 - Build system support (CMake)
- C - NAPI headers, system integration

## Runtime

**Environment:**
- Emscripten SDK (version 3.1.64) - WebAssembly compiler toolchain
- Node.js (>= 18.0.0) - Development, testing, browser environment simulation
- WebAssembly (wasm32) - Target runtime platform

**Package Manager:**
- npm - Node.js dependencies
- No lockfile present - single package.json with no runtime dependencies

## Frameworks

**Core:**
- EdgeJS (upstream from aspect-build/aspect-edgejs) - JavaScript runtime with Node.js API compatibility, ~46 built-in modules
- Emscripten - WebAssembly compilation and runtime features (memory, threading, JSPI)

**Testing:**
- Node.js built-in assertions - Custom test harness in `tests/test-basic.mjs`
- No external test framework (Jest, Vitest, etc.)

**Build/Dev:**
- CMake (3.20+) - Primary build system
- Emscripten SDK - WebAssembly toolchain (emcc, em++, emcmake)
- Make - Task automation

## Key Dependencies

**Critical:**
- OpenSSL (vendored) - TLS/SSL cryptography, HTTPS support
- libuv - Event loop, async I/O, platform abstraction
- nghttp2 - HTTP/2 protocol implementation
- V8 (bundled via N-API) - JavaScript engine runtime via N-API imports, not compiled to Wasm
- Brotli - Compression algorithm support
- zstd - Compression support (Zstandard)

**Infrastructure:**
- llhttp - HTTP parser
- ada - URL parsing (WHATWG spec-compliant)
- zlib - gzip compression
- ICU (icu-small) - Internationalization, Unicode support
- simdjson - SIMD-optimized JSON parsing
- simdutf - SIMD UTF-8 validation
- acorn - JavaScript parser/transpiler
- amaro - JavaScript source map support
- cjs-module-lexer - CommonJS module analysis
- googletest - C++ test framework (for EdgeJS internal tests, not in browser build)
- nbytes - Binary data utilities

## Configuration

**Environment:**
- EMSDK environment variable - Emscripten SDK path (default: ~/emsdk)
- Emscripten activation - Via `source $EMSDK/emsdk_env.sh`
- BUILD_TYPE - Release (default) or Debug
- JOBS - Parallel build jobs (default: nproc)

**Build:**
- `emscripten-toolchain.cmake` - CMake toolchain for cross-compilation to wasm32
- `Makefile` - Main build orchestration (setup, fetch, configure, build, test, clean)
- `build-emscripten.sh` - Build script wrapper (legacy support)
- `.gitmodules` - Git submodule configuration for edgejs-src and node-wasix32 reference

**Compiler Flags:**
- Wasm features: `-msimd128`, `-mbulk-memory`, `-matomics`, `-mtail-call`, `-fwasm-exceptions`
- Threading: `-pthread`
- Link options:
  - `-sALLOW_MEMORY_GROWTH=1` - Dynamic memory expansion
  - `-sMAXIMUM_MEMORY=4GB` - Max Wasm linear memory
  - `-sINITIAL_MEMORY=128MB` - Initial memory allocation
  - `-sSTACK_SIZE=8MB` - Wasm stack size
  - `-sSHARED_MEMORY=1` - Shared memory for threading
  - `-sJSPI=1` - JavaScript Promise Integration support
  - `-sMODULARIZE=1` - Modular output
  - `-sFILESYSTEM=1` - Virtual filesystem
  - `-sALLOW_UNIMPLEMENTED_SYSCALLS=1` - Graceful syscall fallback

## Platform Requirements

**Development:**
- git - Source control, EdgeJS submodule
- cmake (>= 3.20) - Build configuration
- python3 - Build system
- node (>= 18.0.0) - Testing
- Emscripten SDK (3.1.64+) - WebAssembly compiler
- gzip, brotli (optional) - Size compression in build reports

**Production:**
- Browser with WebAssembly support
- Browser with Web Workers (for threading)
- Browser JSPI support (Chrome 123+) or Asyncify fallback for I/O operations
- Web Crypto API - For crypto operations

## Exported Artifacts

**Distribution:**
- `dist/edgejs.wasm` - WebAssembly runtime (~40-50 MB raw, ~10-15 MB gzipped)
- `dist/edgejs.js` - Emscripten glue code and module loader
- `dist/edgejs.worker.js` - Worker thread support
- `napi-bridge/index.js` - N-API bridge exports (NapiBridge class, initEdgeJS function)

---

*Stack analysis: 2026-03-18*
