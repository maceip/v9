# v9 — EdgeJS Browser Runtime

Browser-native Node.js runtime based on [EdgeJS](https://github.com/wasmerio/edgejs),
compiled to WebAssembly via Emscripten.

**Goal**: Run Claude Code, Codex CLI, and Gemini CLI in the browser.

## Module Structure

```
v9/
├── edgejs-src/              # EdgeJS upstream source (git submodule)
├── napi-bridge/             # N-API → browser JS engine bridge
│   └── index.js             # Handle table, type marshaling, function calls
├── wasi-shims/              # POSIX gap shims (from node-wasix32 research)
├── emscripten-toolchain.cmake  # CMake toolchain for Emscripten target
├── build-emscripten.sh      # Main build script
├── build/                   # Build output directory
└── tests/                   # Integration tests
```

## How It Works

EdgeJS separates the JS engine from Node.js APIs via N-API:

1. **EdgeJS C++ runtime** compiles to `.wasm` via Emscripten
   - Includes: fs, http, https, crypto, tls, streams, net, path, url, etc.
   - libuv event loop, module loader, process management
2. **N-API bridge** (`napi-bridge/`) connects Wasm ↔ browser JS engine
   - Browser's V8/JSC/SpiderMonkey executes user JavaScript
   - No need to compile V8 to Wasm — we get JIT performance for free
3. **wasi-shims** patch remaining POSIX gaps that Emscripten doesn't cover

## Setup

```bash
# 1. Clone EdgeJS source
git clone https://github.com/wasmerio/edgejs.git edgejs-src/

# 2. Ensure Emscripten is available
source $EMSDK/emsdk_env.sh

# 3. Build
./build-emscripten.sh

# 4. Test
cd tests && node test-basic.js
```

## Tooling Additions

### 1) Full Node API Surface Toolchain

To avoid one-by-one builtin breakage, generate a complete Node core module
surface (CJS + ESM wrappers + import-map entries):

```bash
node scripts/build-node-api-surface.mjs
```

This produces:
- `napi-bridge/node-api-surface.generated.js` (module/export manifest)
- `napi-bridge/generated-node-api/*.js` (ESM wrappers)
- `web/node-api-importmap.generated.json` (drop-in import-map entries)

The runtime also auto-expands builtin overrides using this manifest via
`napi-bridge/node-api-surface.js`.

`scripts/generate-esm-wrappers.mjs` is now legacy-only and intentionally
disabled by default to avoid reintroducing old stub-only wrappers.

### 2) Parsec Engine (Two-Stage Pipeline)

Run the parser/prep/packaging engine from CLI:

```bash
node experimental/parsec-engine/cli.mjs --type raw-js --input ./my-app --output ./dist/parsec
```

Useful flags:
- `--backend-target edgejs-browser|wali-edge-remote` (plan package for local browser runtime or remote Wali execution)
- `--package-strategy single|split` (single-file bundle vs code-split package outputs)
- `--prune-problematic-builtins` (rewrite known problematic builtins such as `child_process`/`net` to explicit Parsec-pruned shims)

Note: Parsec remains experimental and is isolated under `experimental/parsec-engine/`.

Supported input types:
- `npm` (package name or local package path)
- `raw-js` (single file, directory, or file map)
- `zip` (zip archive path)
- `github` (repo URL or local repo path)
- `wasm` (raw `.wasm` file or directory containing wasm artifacts)

Behavior:
1. **Stage 1**: Ingest + static analysis + **source-to-source rewrite** (builtin specifier normalization, shebang stripping, browser rewrites) + aggressive ESM bundling/minification.
2. **Stage 2** (`github` input): Start **selective wasm lifting** using language backend detection, helper wasm matching, and per-component compile attempts for "easy" subcomponents first.

For `wasm` input, Stage 1 runs loader-focused validation (`WebAssembly.compile` + import/export extraction), packages the raw wasm artifact, and emits `parsec-load-plan.json` / `parsec-package-manifest.json` for runtime loader verification.

## Architecture

```
┌──────────────────────────────────────────┐
│              Browser Tab                  │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │     EdgeJS Runtime (.wasm)          │ │
│  │     ~46 Node.js built-in modules    │ │
│  │     libuv, OpenSSL, nghttp2, etc.   │ │
│  └──────────┬────────────┬─────────────┘ │
│        N-API │            │ Syscalls      │
│             ▼            ▼               │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │ Browser JS   │  │ Emscripten       │  │
│  │ Engine       │  │ Syscall Layer    │  │
│  │ (V8/JSC)     │  │ + JSPI async     │  │
│  └──────────────┘  └──────────────────┘  │
│                                           │
│  ┌─────────────────────────────────────┐ │
│  │ WebTransport Proxy → Internet       │ │
│  │ (api.anthropic.com, api.openai.com) │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

## Prior Art

- **EdgeJS** (wasmerio): N-API split, WASIX build, ~46 Node modules
- **node-wasix32** (Multi-V-VM): 30+ wasi-*.h shims mapping V8/Node POSIX gaps
- **kasm** (this repo): WebTransport proxy, Emscripten build pipeline
