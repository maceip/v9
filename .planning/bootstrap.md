# Bootstrap Guide (Phase 1/2)

This document lists the third-party dependencies, utilities, and verification commands used to build and test the recent Phase 1/2 work (Wasm compilation path + N-API bridge hardening planning).

## Required Third-Party Dependencies

Install these first:

- `git` (clone, branch, commit, push)
- `bash` + coreutils (project scripts and Makefile targets)
- `build-essential` (`gcc/g++`, linker, libc headers)
- `make` (primary task runner)
- `cmake` (configure/build generator)
- `python3` (vendored OpenSSL manifest generation and build scripts)
- `curl`, `ca-certificates`, `xz-utils`, `unzip` (tool/bootstrap fetch + archive handling)
- `node` (runs all project tests under `tests/*.mjs`; Node 20 LTS recommended)
- Emscripten SDK `3.1.64` via `emsdk` (C/C++ -> Wasm toolchain)

## Optional but Recommended Utilities

- `brotli` (used by `make size`)
- `bc` (used by `make size` math output)
- `nproc` (parallel job count on Linux; Makefile falls back if missing)
- `pkg-config`, `ninja-build` (handy for local build/debug workflows)

## Vanilla Ubuntu 22.04 / 24.04 Setup

This section assumes a fresh machine with only default Ubuntu packages.

### 1) Base system packages

```bash
sudo apt-get update
sudo apt-get install -y \
  git build-essential make cmake python3 \
  curl ca-certificates xz-utils unzip \
  brotli bc pkg-config ninja-build
```

### 2) Install Node 20 LTS (recommended for tests/tools)

Use `nvm` on Ubuntu 22/24 to avoid distro Node version drift:

```bash
export NVM_DIR="$HOME/.nvm"
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
node -v
npm -v
```

### 3) Install/activate Emscripten via project target

```bash
make setup
source ~/emsdk/emsdk_env.sh
emcc -v
```

### 4) Sanity check toolchain versions

```bash
git --version
cmake --version
python3 --version
node --version
emcc --version
```

## Repository Bootstrap Steps

From repo root:

```bash
make fetch
make configure
make build
```

Notes:
- `make configure` applies `patches/edgejs-emscripten.patch` and runs CMake with `emscripten-toolchain.cmake`.
- Build outputs are expected under `build/` and `dist/`.
- If opening a new shell, run `source ~/emsdk/emsdk_env.sh` again before configure/build.

## Utilities/Commands Used in Recent Work

Primary commands used while hardening and validating Phase 1/2:

- `make setup`
- `make fetch`
- `make configure`
- `make build`
- `make test`
- `git status`, `git diff`, `git log`, `git push`

## Test Commands Used to Verify Recent Work

These are the checks used for recent bridge/phase progress validation:

```bash
node tests/test-basic.mjs
node tests/test-napi-bridge.mjs
node tests/test-wasm-load.mjs
```

Interpretation:
- `test-basic.mjs`: handle table and basic bridge behavior smoke checks.
- `test-napi-bridge.mjs`: extended N-API import/function/exception/handle-scope checks.
- `test-wasm-load.mjs`: wasm binary validation/compile/export/import smoke checks.

## Runtime Probe Commands (Used During Phase 2)

For bridge runtime spot checks (in addition to test files), use node ESM probes that:

- initialize `initEdgeJS(...)`,
- run `eval('1+1')`,
- run `runFile('/probe.js')`,
- inspect `diagnostics()` (`missingImports`, `importErrors`, handle counts).

Keep probe scripts deterministic and record outputs in planning evidence when used for phase acceptance.

## Environment Checklist Before Running Tests

- `EMSDK` is set and `emsdk_env.sh` has been sourced in current shell.
- `node --version` reports a modern LTS (recommended: v20.x).
- `dist/edgejs.wasm` and glue JS exist (after successful build).
- No stale git lock files/processes if operating in worktrees.
- Working tree is clean or intentional changes are known before running release gates.

## Definition of Ready (for another engineer)

A new engineer is ready to execute Phase 1/2 work when they can:

1. Run `make fetch && make configure && make build` without environment errors.
2. Run all three test scripts above successfully.
3. Reproduce a runtime probe and capture diagnostics for planning evidence.
