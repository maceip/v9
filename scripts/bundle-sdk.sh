#!/bin/sh
# Bundle @anthropic-ai/sdk for browser use with EdgeJS.
#
# All Node.js builtins are marked external — they resolve to our
# napi-bridge overrides at runtime via _registerBuiltinOverride.
#
# Usage: sh scripts/bundle-sdk.sh

set -e

mkdir -p dist

npx esbuild node_modules/@anthropic-ai/sdk/index.mjs \
  --bundle --platform=neutral --format=esm \
  --external:crypto --external:http --external:https \
  --external:net --external:tls --external:dns \
  --external:fs --external:path --external:os \
  --external:stream --external:events --external:buffer \
  --external:child_process --external:util --external:url \
  --external:zlib --external:worker_threads \
  --outfile=dist/anthropic-sdk-bundle.js

echo "✓ dist/anthropic-sdk-bundle.js ($(wc -c < dist/anthropic-sdk-bundle.js | tr -d ' ') bytes)"
