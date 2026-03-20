#!/bin/sh
# Bundle @google/gemini-cli for browser use with EdgeJS.
#
# Key decisions:
#   - All Node.js builtins → external (resolve to napi-bridge shims at runtime)
#   - undici → external (browser uses native fetch(); undici's diagnostics_channel
#     dependency crashes in browser with _parentWrap error)
#   - node-pty → external (resolves to our node-pty-shim)
#   - --conditions=browser for packages that export browser-specific code
#
# Usage: sh scripts/bundle-gemini.sh

set -e

mkdir -p dist

npx esbuild node_modules/@google/gemini-cli/dist/index.js \
  --banner:js='import{createRequire as __cr}from"module";import{fileURLToPath as __fu}from"url";import{dirname as __dn}from"path";var require=__cr(import.meta.url),__filename=__fu(import.meta.url),__dirname=__dn(__filename);' \
  --bundle --platform=node --format=esm \
  --main-fields=module,main \
  --conditions=import,browser,default \
  --external:crypto --external:http --external:https \
  --external:net --external:tls --external:dns \
  --external:fs --external:path --external:os \
  --external:stream --external:events --external:buffer \
  --external:child_process --external:util --external:url \
  --external:zlib --external:worker_threads --external:process \
  --external:assert --external:tty --external:readline \
  --external:async_hooks --external:module --external:constants \
  --external:string_decoder --external:inspector \
  --external:diagnostics_channel --external:querystring \
  --external:http2 --external:http2-wrapper --external:perf_hooks --external:v8 \
  --external:punycode \
  --external:undici \
  --external:node-pty \
  --external:react-devtools-core \
  --external:@google/gemini-cli-devtools \
  --external:unicorn-magic --external:npm-run-path \
  --external:read-pkg --external:execa \
  --external:require-in-the-middle --external:import-in-the-middle \
  --external:node:* \
  --loader:.wasm=file \
  --outfile=dist/gemini-cli-bundle.js \
  --log-limit=0

echo "✓ dist/gemini-cli-bundle.js ($(wc -c < dist/gemini-cli-bundle.js | tr -d ' ') bytes)"
