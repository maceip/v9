# v9 — EdgeJS Browser Runtime Build
# Works in Git Bash / MSYS2 on Windows and native Linux/macOS

# ---- Shell Detection ----
# Always use bash — Git Bash on Windows, /bin/bash elsewhere.
# cmd.exe breaks line continuations (\) and Unix idioms.
SHELL := /bin/bash
.SHELLFLAGS := -c

JOBS ?= $(shell nproc 2>/dev/null || echo $(NUMBER_OF_PROCESSORS) 2>/dev/null || echo 4)

.PHONY: all setup fetch configure build test test-integration test-soak-quick test-nightly clean distclean size help

# ---- Paths ----
# Normalize CURDIR to forward slashes (MSYS make sometimes mixes them)
ROOT_DIR   := $(subst \,/,$(CURDIR))
EDGEJS_SRC := $(ROOT_DIR)/edgejs-src
BUILD_DIR  := $(ROOT_DIR)/build
SHIMS_DIR  := $(ROOT_DIR)/wasi-shims
OUTPUT_DIR := $(ROOT_DIR)/dist

# ---- Emscripten ----
# Resolve EMSDK_DIR. On Windows, HOME may be empty in Make, so fall back to USERPROFILE.
ifdef EMSDK
    EMSDK_DIR := $(subst \,/,$(EMSDK))
else ifdef HOME
    EMSDK_DIR := $(subst \,/,$(HOME))/emsdk
else
    EMSDK_DIR := $(subst \,/,$(USERPROFILE))/emsdk
endif

# On Windows only .bat/.py variants exist (no extensionless scripts)
ifeq ($(OS),Windows_NT)
    EMCC    := $(EMSDK_DIR)/upstream/emscripten/emcc.bat
    EMCMAKE := $(EMSDK_DIR)/upstream/emscripten/emcmake.bat
else
    EMCC    := $(EMSDK_DIR)/upstream/emscripten/emcc
    EMCMAKE := $(EMSDK_DIR)/upstream/emscripten/emcmake
endif

# ---- Build Config ----
BUILD_TYPE ?= Release
EDGE_REPO  := https://github.com/wasmerio/edgejs.git
# Optional: after `make fetch`, pin with: cd edgejs-src && git checkout <sha>

# ---- Outputs ----
WASM_OUT := $(OUTPUT_DIR)/edgejs.wasm
JS_OUT   := $(OUTPUT_DIR)/edgejs.js

# ============================================================
# Targets
# ============================================================

all: fetch configure build test

# ---- Fetch Sources ----
fetch:
	@if [ ! -d "$(EDGEJS_SRC)" ]; then git clone --depth 1 $(EDGE_REPO) "$(EDGEJS_SRC)"; fi
	@cd "$(EDGEJS_SRC)" && git config submodule.napi.url https://github.com/wasmerio/napi.git
	@cd "$(EDGEJS_SRC)" && git config submodule.wasmer-examples.url https://github.com/wasmerio/examples.git
	@cd "$(EDGEJS_SRC)" && git submodule update --init --recursive napi
	@echo ">>> EdgeJS source ready."

# ---- Configure ----
configure: $(BUILD_DIR)/CMakeCache.txt

$(BUILD_DIR)/CMakeCache.txt: emscripten-toolchain.cmake
	@$(MAKE) fetch
	@echo ">>> Ensuring EdgeJS source is clean and patched..."
	@cd "$(EDGEJS_SRC)" && git checkout -- . && git clean -fd
	@cd "$(EDGEJS_SRC)" && git apply "$(ROOT_DIR)/patches/edgejs-emscripten.patch" || (echo ">>> ERROR: patches/edgejs-emscripten.patch did not apply. Try: git -C edgejs-src fetch origin && git -C edgejs-src checkout origin/main && git -C edgejs-src config core.autocrlf false" && exit 1)
	@echo ">>> Configuring EdgeJS for Emscripten (Forcing Internal OpenSSL)..."
	@mkdir -p "$(BUILD_DIR)"
	EMSDK="$(EMSDK_DIR)" "$(EMCMAKE)" cmake \
		-S "$(EDGEJS_SRC)" \
		-B "$(BUILD_DIR)" \
		-DCMAKE_TOOLCHAIN_FILE="$(ROOT_DIR)/emscripten-toolchain.cmake" \
		-DCMAKE_BUILD_TYPE=$(BUILD_TYPE) \
		-DEDGE_NAPI_PROVIDER=imports \
		-DEDGE_PLATFORM=emscripten \
		-DEDGE_EXTRA_INCLUDES="$(SHIMS_DIR)" \
		-DCMAKE_SH="CMAKE_SH-NOTFOUND"
	@echo ">>> Configuration complete"

# ---- Build ----
build: $(WASM_OUT)

$(WASM_OUT): $(BUILD_DIR)/CMakeCache.txt
	@echo ">>> Building EdgeJS..."
	@mkdir -p "$(OUTPUT_DIR)"
	cmake --build "$(BUILD_DIR)" -j $(JOBS)
	@# Emscripten -o edge often emits the JS loader as build/edge (no suffix); normalize to edge.js.
	@if [ ! -f "$(BUILD_DIR)/edge.js" ] && [ -f "$(BUILD_DIR)/edge" ]; then \
	  _s=$$(wc -c < "$(BUILD_DIR)/edge" | tr -d ' \r'); \
	  if [ "$$_s" -gt 5000 ]; then \
	    mv -f "$(BUILD_DIR)/edge" "$(BUILD_DIR)/edge.js"; \
	  fi; \
	fi
	@cp -f "$(BUILD_DIR)/edge.js" "$(JS_OUT)" 2>/dev/null || { echo ">>> ERROR: missing $(BUILD_DIR)/edge.js after build"; exit 1; }
	@cp -f "$(BUILD_DIR)/edge.wasm" "$(WASM_OUT)" 2>/dev/null || { echo ">>> ERROR: missing $(BUILD_DIR)/edge.wasm"; exit 1; }
	@node "$(ROOT_DIR)/scripts/write-build-edge-shim.mjs" "$(BUILD_DIR)"
	@echo ">>> Build complete"

# ---- Release Gate ----
release-gate:
	@echo ">>> Running phase close release gate..."
	cd "$(ROOT_DIR)" && node scripts/release-gate.mjs

# ---- Test Tiers ----
test:
	cd "$(ROOT_DIR)" && node tests/test-basic.mjs && node tests/test-napi-bridge.mjs && node tests/test-guardrails.mjs

test-integration:
	cd "$(ROOT_DIR)" && node tests/test-basic.mjs && node tests/test-napi-bridge.mjs && node tests/test-guardrails.mjs && EDGEJS_STRICT_IMPORTS=1 node tests/test-wasm-load.mjs && node tests/test-memfs-node-modules-seed.mjs && node tests/test-package-exports-resolve.mjs && node tests/test-memfs-esm-entry.mjs && node tests/test-memfs-import-meta-and-dynamic.mjs && node tests/test-memfs-node-test-in-tab.mjs && node tests/test-native-addon-reject.mjs && node tests/test-run-node-entry-argv.mjs && node tests/test-memfs-reference-app.mjs && node tests/test-bundle-app-graph.mjs && node tests/test-node-test-runner.mjs && npm run test:nodejs-in-tab-contract && node tests/test-runtime-stability.mjs && node tests/test-browser-smoke.mjs

test-nightly:
	cd "$(ROOT_DIR)" && EDGEJS_STRICT_IMPORTS=1 node tests/test-soak.mjs --profile nightly

test-soak-quick:
	cd "$(ROOT_DIR)" && npm run test:soak:quick

# ---- Clean ----
clean:
	@rm -rf "$(BUILD_DIR)" "$(OUTPUT_DIR)"

distclean: clean
	@rm -rf "$(EDGEJS_SRC)"

help:
	@echo 'Wasm runtime:  make fetch && source "$$EMSDK/emsdk_env.sh" && make configure && make build'
	@echo "Docs: docs/BUILD_TOOLCHAIN.md (CI, Linux/EC2, Windows, artifacts)."
	@echo "Targets: fetch configure build clean distclean test test-integration test-soak-quick"
