#!/usr/bin/env bun
/**
 * Bundle the Claude-style API contract test the same way claude-code-main
 * builds its CLI: Bun.build into outdir + import.meta.require patch (build.ts).
 *
 * Run: bun scripts/build-claude-contract.mjs
 * Then: node dist/claude-api-contract.js
 */
import { readdir, readFile, writeFile, mkdirSync, rmSync, copyFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outdir = join(root, 'dist');
const entry = join(root, 'tests', 'conformance', 'claude-contract-bundle-entry.mjs');
const outFinal = join(outdir, 'claude-api-contract.js');

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

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
const builtPath = primary?.path || join(outdir, 'claude-contract-bundle-entry.js');
copyFileSync(builtPath, outFinal);
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
  `Bundled claude API contract → ${outFinal} (Bun outputs: ${result.outputs.length}, patched: ${patched})`,
);
