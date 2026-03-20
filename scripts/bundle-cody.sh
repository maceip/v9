#!/bin/sh
# Wrap Cody's CJS bundle in an ESM wrapper with require shim.
# Cody's dist/index.js is already bundled as CJS — we just need to
# provide require/module/exports/__dirname/__filename.
set -e

SRC="dist/cody-cli-raw.js"
OUT="dist/cody-cli.js"

if [ ! -f "$SRC" ]; then
  echo "Error: $SRC not found. Copy the Cody npm package's dist/index.js to $SRC"
  exit 1
fi

cat > "$OUT" << 'HEADER'
import { createRequire as __cr } from "module";
import { fileURLToPath as __fu } from "url";
import { dirname as __dn } from "path";
var require = __cr(import.meta.url);
var __filename = __fu(import.meta.url);
var __dirname = __dn(__filename);
var module = { exports: {} };
var exports = module.exports;
HEADER

# Strip the shebang if present
sed '1s|^#!/usr/bin/env node||' "$SRC" >> "$OUT"

echo "export default module.exports;" >> "$OUT"

echo "✓ $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
