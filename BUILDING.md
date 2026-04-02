# Building v9 from scratch

Developer quick-start for building the entire EdgeJS WebAssembly toolchain on a clean machine. For CI parity, Docker, Cory/EC2 runbook, and troubleshooting, see [`docs/BUILD_TOOLCHAIN.md`](docs/BUILD_TOOLCHAIN.md).

## Prerequisites

| Dependency | Version | Notes |
|---|---|---|
| **Node.js** | >= 18 (CI uses 22) | ESM, tests, dev server |
| **Git** | any | Clone repo + EdgeJS source |
| **Python 3** | >= 3.6 | Required by Emscripten SDK |
| **CMake** | >= 3.20 | EdgeJS build system |
| **GNU Make** | >= 4.0 | Build orchestration |
| **Bash** | >= 4.0 | Git Bash on Windows |

Optional: **Chromium** (integration tests), **Bun** (faster contract bundling).

## One-command setup + build

```bash
git clone <repo-url> && cd v9
make setup                        # installs emsdk 3.1.64 + npm ci
source ~/emsdk/emsdk_env.sh       # activate Emscripten in your shell
make all                          # fetch → configure → build → test
```

`make setup` clones the [Emscripten SDK](https://github.com/emscripten-core/emsdk) to `~/emsdk` and installs version **3.1.64** (matching CI). Override with:

```bash
EMSDK_VERSION=3.1.70 make setup-emsdk     # different version
EMSDK=/opt/emsdk make setup-emsdk         # different install location
```

## Step by step

### 1. Install Emscripten

Automated:
```bash
make setup-emsdk
source ~/emsdk/emsdk_env.sh
```

Or manual:
```bash
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk && ./emsdk install 3.1.64 && ./emsdk activate 3.1.64
source ~/emsdk/emsdk_env.sh
```

### 2. Install Node.js dependencies

```bash
make setup-node-deps    # validates Node >= 18, runs npm ci
```

### 3. Fetch, configure, build

```bash
make fetch       # clone EdgeJS into edgejs-src/ (shallow), init napi submodule
make configure   # reset source, apply patches/edgejs-emscripten.patch, run emcmake cmake
make build       # compile → dist/edgejs.{wasm,js} + build/edge (CJS loader stub)
```

### 4. Verify

```bash
test -f dist/edgejs.wasm && test -f dist/edgejs.js && test -f build/edge && echo OK
make test        # quick: basic + napi-bridge + guardrails
```

## Build outputs

| File | Description |
|---|---|
| `dist/edgejs.wasm` | WebAssembly runtime binary (~40-80 MB) |
| `dist/edgejs.js` | Emscripten JS loader/glue |
| `build/edge` | CommonJS loader stub for Node.js require() |

Run `make size` for exact sizes with gzip estimates.

## Makefile reference

Run `make help` for the full list. Key targets:

| Target | Description |
|---|---|
| `make setup` | Install emsdk + npm deps (one-time) |
| `make all` | fetch → configure → build → test |
| `make test-integration` | Full suite (requires Chromium + wasm) |
| `make test-soak-quick` | Short soak test |
| `make test-soak-nightly` | Long nightly soak |
| `make lint` / `make size` | Lint JS, report artifact sizes |
| `make clean` / `make distclean` | Remove build outputs / + sources |

Key variables: `EMSDK_VERSION` (default `3.1.64`), `BUILD_TYPE` (`Release`/`Debug`), `JOBS` (parallel jobs).

## Alternative: shell script

`./build-emscripten.sh` delegates to `make fetch configure build`. Supports `--debug` for debug builds.

## Architecture

```
EdgeJS C++ (upstream)  ──→  patches/edgejs-emscripten.patch
         │
    emcmake cmake  +  emscripten-toolchain.cmake  +  wasi-shims/
         │
    cmake --build
         │
    dist/edgejs.{wasm,js}  +  build/edge
         │
    napi-bridge/ (67 JS modules: Node built-ins → browser APIs)
         │
    web/index.html  +  import maps  +  xterm.js terminal
```

## Next steps

- **Run integration tests**: see [`docs/BUILD_TOOLCHAIN.md`](docs/BUILD_TOOLCHAIN.md) for Chromium setup, `CHROME_BIN`, Docker, and CI parity
- **Dev server**: `node scripts/dev-server.mjs` → `http://localhost:8080/web/index.html`
- **Roadmap**: `docs/NODEJS_IN_TAB_ROADMAP.md`
