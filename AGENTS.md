# AGENTS.md

## Cursor Cloud specific instructions

This is an EdgeJS Browser Runtime project — a WebAssembly-compiled Node.js runtime (N-API bridge + Emscripten build pipeline). There is no web server, database, or multi-service architecture.

### Key commands

| Action | Command | Notes |
|--------|---------|-------|
| Unit tests | `npm test` | Runs `test-basic.mjs` + `test-napi-bridge.mjs` (N-API bridge JS tests) |
| Full tests | `make test` | Also runs `test-wasm-load.mjs`, which gracefully skips if no `.wasm` built |
| Lint | `make lint` | Checks shim header include guards + `node --check napi-bridge/index.js` |
| Build (Wasm) | `make build` | Requires Emscripten SDK; build is currently incomplete (Phase 2 of 6) |

### Non-obvious notes

- **No npm dependencies**: `package.json` has zero `dependencies`/`devDependencies`. No `node_modules` directory is needed or created.
- **Emscripten SDK**: Full Wasm build requires Emscripten 3.1.64 (`make setup` installs it to `~/emsdk`). This is only needed for `make configure` / `make build`, not for running tests or lint.
- **Wasm build incomplete**: The project is in early development. The `test-wasm-load.mjs` test gracefully skips when `dist/edgejs.wasm` is absent — this is expected.
- **lint warning**: `wasi-v8-internals-minimal.h` intentionally lacks an include guard — the `make lint` warning about it is known and expected.
- The project uses ES Modules (`"type": "module"` in `package.json`).
