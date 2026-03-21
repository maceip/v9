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

# Post-process: improve __toCommonJS callable-default interop.
# Some modules export a callable function with attached members (e.g. Parser.detailed).
# Return the original callable default object (not a wrapper closure) so attached members survive.
sed -i 's|var __toCommonJS = (mod[0-9]*) => __copyProps(__defProp({}, "__esModule", { value: true }), mod[0-9]*);|var __toCommonJS = (m) => { var r = __copyProps(__defProp({}, "__esModule", { value: true }), m); if (typeof r.default === "function") { return __copyProps(r.default, r); } return r; };|g' dist/gemini-cli-bundle.js 2>/dev/null || true

echo "✓ dist/gemini-cli-bundle.js ($(wc -c < dist/gemini-cli-bundle.js | tr -d ' ') bytes)"
