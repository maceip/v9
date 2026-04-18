#!/usr/bin/env node
/**
 * Bundle the image-to-ascii landing-page demo into a single browser-friendly
 * ESM file for both GitHub Pages and local dev.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const entry = join(repoRoot, 'demo', 'image-to-ascii-demo.mjs');
const outDirDocs = join(repoRoot, 'docs', 'dist');
const outDirDist = join(repoRoot, 'dist');
const outfileDocs = join(outDirDocs, 'image-to-ascii-demo.js');
const outfileDist = join(outDirDist, 'image-to-ascii-demo.js');

mkdirSync(outDirDocs, { recursive: true });
mkdirSync(outDirDist, { recursive: true });

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  outfile: outfileDocs,
  logLevel: 'warning',
  banner: {
    js: '/* image-to-ascii landing-page demo bundle */\n',
  },
});

let text = readFileSync(outfileDocs, 'utf8');
if (text.startsWith('#!')) {
  text = text.replace(/^#![^\n]*/, '');
  writeFileSync(outfileDocs, text, 'utf8');
}
writeFileSync(outfileDist, text, 'utf8');

console.log(`Bundled image-to-ascii demo → ${outfileDocs}`);
console.log(`Also copied for local dev → ${outfileDist}`);
