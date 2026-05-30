#!/usr/bin/env node
/**
 * Injects `web/nodejs-in-tab-import-map.json` into HTML files that carry the
 * browser contract import map. Run after editing the JSON; CI checks parity via
 * `npm run test:import-map-consistency`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mapPath = join(root, 'web', 'nodejs-in-tab-import-map.json');
const raw = readFileSync(mapPath, 'utf8');
const parsed = JSON.parse(raw);
if (!parsed.imports || typeof parsed.imports !== 'object') {
  throw new Error('nodejs-in-tab-import-map.json must have an "imports" object');
}

const inner = JSON.stringify({ imports: parsed.imports }, null, 2);
const indented = inner
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n');
const block = `<script type="importmap">\n${indented}\n  </script>`;

const targets = [
  join(root, 'web', 'index.html'),
  join(root, 'web', 'nodejs-in-tab-contract.html'),
];

const IMPORTMAP_RE = /<script type="importmap">[\s\S]*?<\/script>/;

for (const htmlPath of targets) {
  let html = readFileSync(htmlPath, 'utf8');
  if (!IMPORTMAP_RE.test(html)) {
    throw new Error(`No import map script block found in ${htmlPath}`);
  }
  html = html.replace(IMPORTMAP_RE, block);
  writeFileSync(htmlPath, html, 'utf8');
  console.log('Updated import map in', htmlPath);
}
