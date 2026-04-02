#!/usr/bin/env bash
# Canonical EdgeJS browser build — delegates to the Makefile (edgejs-src/, dist/, patches/).
#
# Prerequisites:
#   - Git, CMake, Python 3, GNU make, bash
#   - Emscripten SDK 3.1.64 activated: source "$EMSDK/emsdk_env.sh"
#
# Usage:
#   ./build-emscripten.sh          # Release
#   ./build-emscripten.sh --debug # Debug

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v emcc &>/dev/null; then
  echo "ERROR: Emscripten not on PATH. Activate emsdk first, e.g.:"
  echo "  source \"\$EMSDK/emsdk_env.sh\""
  exit 1
fi

if [[ "${1:-}" == "--debug" ]]; then
  exec make fetch configure build BUILD_TYPE=Debug
fi

exec make fetch configure build
