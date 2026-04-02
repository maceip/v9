#!/usr/bin/env bash
# Activate Emscripten for every container command (PATH, EMSDK_*, etc.).
set -euo pipefail
source "${EMSDK:-/opt/emsdk}/emsdk_env.sh"
exec "$@"
