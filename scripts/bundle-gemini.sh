#!/bin/sh
# Bundle @google/gemini-cli for browser use with EdgeJS.
set -e
mkdir -p dist

npx esbuild node_modules/@google/gemini-cli/dist/index.js \
  --banner:js='import{createRequire as __cr}from"module";import{fileURLToPath as __fu}from"url";import{dirname as __dn}from"path";var require=__cr(import.meta.url),__filename=__fu(import.meta.url),__dirname=__dn(__filename);' \
  --bundle --platform=node --format=esm \
  --main-fields=module,main \
  --conditions=import,browser,default \
  --external:undici --external:node-pty \
  --external:react-devtools-core --external:@google/gemini-cli-devtools \
  --external:require-in-the-middle --external:import-in-the-middle \
  --external:http2-wrapper \
  --external:node:* \
  --loader:.wasm=file \
  --outfile=dist/gemini-cli-bundle.js \
  --log-limit=5

# Post-process: fix __toCommonJS for y18n (callable default export)
# y18n exports a function as default but __toCommonJS wraps it as {default: fn}
# Yargs calls it as oe2(opts) expecting the function directly
# Fix: make __toCommonJS return the default if it's a function
# Fix __toCommonJS CJS interop: if default export is a function, make the module itself callable
sed -i 's|var __toCommonJS = (mod[0-9]*) => __copyProps(__defProp({}, "__esModule", { value: true }), mod[0-9]*);|var __toCommonJS = (m) => { var r = __copyProps(__defProp({}, "__esModule", { value: true }), m); if (typeof r.default === "function") { var f = function(...a) { return r.default(...a); }; Object.keys(r).forEach(function(k) { f[k] = r[k]; }); return f; } return r; };|g' dist/gemini-cli-bundle.js 2>/dev/null || true

echo "✓ dist/gemini-cli-bundle.js ($(wc -c < dist/gemini-cli-bundle.js | tr -d ' ') bytes)"
