#!/usr/bin/env node
/**
 * Write build/edge — tiny CommonJS shim that loads build/edge.js (Emscripten MODULARIZE output).
 * Must be authored in JS: a Makefile printf cannot safely embed template literals/backticks.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'path';

const buildDir = process.argv[2];
if (!buildDir) {
  console.error('usage: write-build-edge-shim.mjs <build-dir>');
  process.exit(1);
}

const lines = [
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  "const filename = path.join(__dirname, 'edge.js');",
  "const source = fs.readFileSync(filename, 'utf8');",
  "const wrapped = new Function('exports', 'require', 'module', '__filename', '__dirname',",
  "  source + '\\n;return module.exports || globalThis.EdgeJSModule || global.EdgeJSModule;');",
  'module.exports = wrapped(module.exports, require, module, filename, __dirname);',
  '',
];
writeFileSync(join(buildDir, 'edge'), lines.join('\n'));
