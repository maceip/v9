#!/usr/bin/env node
/**
 * Pre-bundle an app entry with esbuild (escape hatch when interpretive resolution is not enough).
 *
 * Usage:
 *   node scripts/bundle-app-graph.mjs --entry ./myapp/index.js --outfile ./dist/app-bundle.cjs
 *
 * The output is CommonJS by default so load it via MEMFS require() / runFileAsync.
 */
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const { values } = parseArgs({
  options: {
    entry: { type: 'string' },
    outfile: { type: 'string' },
    /** `node` treats built-ins as external; use `neutral` for browser-shaped graphs. */
    platform: { type: 'string', default: 'node' },
    format: { type: 'string', default: 'cjs' },
  },
});

if (!values.entry || !values.outfile) {
  console.error('Usage: node scripts/bundle-app-graph.mjs --entry <path> --outfile <path>');
  process.exit(1);
}

const entry = resolve(values.entry);
const outfile = resolve(values.outfile);

const result = await build({
  absWorkingDir: process.cwd(),
  entryPoints: [entry],
  bundle: true,
  format: values.format,
  platform: values.platform,
  target: 'es2022',
  write: false,
  sourcemap: false,
});

if (!result.outputFiles?.length) {
  console.error('esbuild produced no output');
  process.exit(1);
}

mkdirSync(resolve(outfile, '..'), { recursive: true });
writeFileSync(outfile, result.outputFiles[0].text);
console.log(`Wrote ${outfile}`);
