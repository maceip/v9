#!/bin/sh
# Bundle a vendor CLI for browser use with EdgeJS.
#
# All Node.js builtins are marked external — they resolve to our
# napi-bridge overrides at runtime via _registerBuiltinOverride.
#
# Usage:
#   sh scripts/bundle-vendor.sh sdk      # Bundle @anthropic-ai/sdk
#   sh scripts/bundle-vendor.sh gemini   # Bundle @google/gemini-cli

set -e

TARGET="${1:?Usage: $0 <sdk|gemini>}"
mkdir -p dist

# Shared Node.js builtins marked external for all bundles
NODE_EXTERNALS="--external:crypto --external:http --external:https \
  --external:net --external:tls --external:dns \
  --external:fs --external:path --external:os \
  --external:stream --external:events --external:buffer \
  --external:child_process --external:util --external:url \
  --external:zlib --external:worker_threads"

case "$TARGET" in
  sdk)
    npx esbuild node_modules/@anthropic-ai/sdk/index.mjs \
      --bundle --platform=neutral --format=esm \
      $NODE_EXTERNALS \
      --outfile=dist/anthropic-sdk-bundle.js
    echo "done: dist/anthropic-sdk-bundle.js ($(wc -c < dist/anthropic-sdk-bundle.js | tr -d ' ') bytes)"
    ;;
  gemini)
    npx esbuild node_modules/@google/gemini-cli/dist/index.js \
      --bundle --platform=neutral --format=esm \
      --main-fields=module,main \
      --conditions=import,browser,default \
      $NODE_EXTERNALS \
      --external:process --external:assert --external:tty --external:readline \
      --external:async_hooks --external:module --external:constants \
      --external:string_decoder --external:inspector \
      --external:diagnostics_channel --external:querystring \
      --external:http2 --external:http2-wrapper --external:perf_hooks --external:v8 \
      --external:punycode --external:undici --external:node-pty \
      --external:react-devtools-core --external:@google/gemini-cli-devtools \
      --external:unicorn-magic --external:npm-run-path \
      --external:read-pkg --external:execa --external:node:* \
      --loader:.wasm=file \
      --outfile=dist/gemini-cli-bundle.js \
      --log-limit=0
    echo "done: dist/gemini-cli-bundle.js ($(wc -c < dist/gemini-cli-bundle.js | tr -d ' ') bytes)"
    ;;
  *)
    echo "Unknown target: $TARGET (supported: sdk, gemini)" >&2
    exit 1
    ;;
esac
