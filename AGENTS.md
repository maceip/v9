# AGENTS.md

## Cursor Cloud specific instructions

This is an EdgeJS Browser Runtime project — a WebAssembly-compiled Node.js runtime (N-API bridge + Emscripten build pipeline). There is no web server, database, or multi-service architecture.

### Key commands

See `Makefile` targets and `package.json` scripts for the full list. Summary:

| Action | Command | Notes |
|--------|---------|-------|
| Unit tests | `npm test` | Runs `test-basic.mjs` + `test-napi-bridge.mjs` |
| Full tests | `make test` | Also runs `test-wasm-load.mjs` (needs `dist/edgejs.wasm` for full results) |
| Lint | `make lint` | Checks shim header include guards + `node --check napi-bridge/index.js` |
| Configure | `make configure` | Requires Emscripten sourced: `source ~/emsdk/emsdk_env.sh` |
| Build | `make build` | Compiles EdgeJS C++ to `.wasm` via Emscripten (~3 min) |
| Size report | `make size` | Shows raw/gzip/brotli sizes of `dist/edgejs.wasm` |

### Non-obvious notes

- **Emscripten must be sourced** before `make configure` or `make build`: run `source ~/emsdk/emsdk_env.sh` in your shell first.
- **EdgeJS upstream repo**: The Makefile references `aspect-build/aspect-edgejs` which is private/unavailable. The actual working upstream is `wasmerio/edgejs` — clone via `git clone --depth 1 https://github.com/wasmerio/edgejs.git edgejs-src` if `make fetch` fails.
- **No npm dependencies**: `package.json` has zero `dependencies`/`devDependencies`. No `node_modules` directory is needed.
- **Build produces ~7 MB `.wasm`** (2.0 MB brotli). Output goes to `dist/edgejs.wasm`, `dist/edgejs.js`, `dist/edgejs.worker.js`.
- **Undefined symbol warnings during build are expected**: The N-API and libuv symbols are provided by the browser bridge at runtime, not at link time.
- **lint warning**: `wasi-v8-internals-minimal.h` intentionally lacks an include guard — the `make lint` warning about it is known.
- The project uses ES Modules (`"type": "module"` in `package.json`).
- **`initEdgeJS()` runtime init**: Currently fails to load the Emscripten module factory via CJS `require()`. This is expected — full runtime integration is Phase 3+.
- **`edgejs-src/` is gitignored**: It's cloned at build time and not committed to the repo.
