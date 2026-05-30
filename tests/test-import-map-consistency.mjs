#!/usr/bin/env node
/**
 * Ensures web/index.html and web/nodejs-in-tab-contract.html import maps match
 * web/nodejs-in-tab-import-map.json (single source of truth).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, 'web', 'nodejs-in-tab-import-map.json');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function stableImportsString(imports) {
  const keys = Object.keys(imports).sort();
  const sorted = {};
  for (const k of keys) sorted[k] = imports[k];
  return JSON.stringify(sorted, null, 2);
}

function parseImportMapFromHtml(html, label) {
  const m = html.match(/<script type="importmap">\s*([\s\S]*?)<\/script>/);
  if (!m) fail(`${label}: no <script type="importmap"> found`);
  let obj;
  try {
    obj = JSON.parse(m[1]);
  } catch (e) {
    fail(`${label}: invalid JSON in import map: ${e?.message || e}`);
  }
  if (!obj.imports || typeof obj.imports !== 'object') {
    fail(`${label}: import map must have an "imports" object`);
  }
  return obj.imports;
}

const expected = JSON.parse(readFileSync(jsonPath, 'utf8')).imports;
const expectedCanon = stableImportsString(expected);

const files = ['web/index.html', 'web/nodejs-in-tab-contract.html'];
const seen = new Set();

for (const rel of files) {
  const html = readFileSync(join(root, rel), 'utf8');
  const imports = parseImportMapFromHtml(html, rel);
  const canon = stableImportsString(imports);
  if (canon !== expectedCanon) {
    fail(
      `${rel} import map does not match web/nodejs-in-tab-import-map.json — run: node scripts/apply-web-import-map.mjs`,
    );
  }
  seen.add(canon);
}

if (seen.size !== 1) {
  fail('web/index.html and web/nodejs-in-tab-contract.html import maps differ from each other');
}

console.log('=== import map consistency === ok');
