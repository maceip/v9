#!/usr/bin/env bun
/**
 * Bundle in-tab API contract suite (Bun.build, Node target).
 * Output: dist/in-tab-api-contract.js
 *
 * Run: bun scripts/build-in-tab-api-contract.mjs
 */
import { readdir, readFile, writeFile, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outdir = join(root, 'dist');
const entry = join(root, 'tests', 'conformance', 'in-tab-api-contract-bundle-entry.mjs');
const outFinal = join(outdir, 'in-tab-api-contract.js');

mkdirSync(outdir, { recursive: true });

try { unlinkSync(outFinal); } catch {}

const result = await Bun.build({
  entrypoints: [entry],
  outdir,
  target: 'node',
  format: 'esm',
  sourcemap: 'none',
  splitting: false,
  minify: false,
});

if (!result.success) {
  console.error('Bun.build failed:');
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const primary = result.outputs[0];
const builtPath = primary?.path || join(outdir, 'in-tab-api-contract-bundle-entry.js');
await writeFile(outFinal, await readFile(builtPath, 'utf-8'));
if (builtPath !== outFinal) {
  try { unlinkSync(builtPath); } catch {}
}

const files = await readdir(outdir);
const IMPORT_META_REQUIRE = 'var __require = import.meta.require;';
const COMPAT_REQUIRE = 'var __require = typeof import.meta.require === "function" ? import.meta.require : (await import("module")).createRequire(import.meta.url);';

let patched = 0;
for (const file of files) {
  if (!file.endsWith('.js')) continue;
  const filePath = join(outdir, file);
  let content = await readFile(filePath, 'utf-8');
  if (content.includes(IMPORT_META_REQUIRE)) {
    content = content.replace(IMPORT_META_REQUIRE, COMPAT_REQUIRE);
    await writeFile(filePath, content);
    patched++;
  }
}

console.log(
  `Bundled in-tab API contract → ${outFinal} (Bun outputs: ${result.outputs.length}, patched: ${patched})`,
);
