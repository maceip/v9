#!/usr/bin/env node
/**
 * Assemble `docs/` for GitHub Pages: copy current `web/` + `napi-bridge/`, rewrite
 * absolute /napi-bridge/ import maps to ../napi-bridge/, sync Wasm js from dist/.
 *
 * Run after `make build` (or equivalent) so dist/edgejs.{js,wasm} exist, then run
 * `scripts/bundle-image-to-ascii-demo.mjs` so docs/dist also contains the demo bundle.
 *
 * Usage: node scripts/prepare-github-pages.mjs
 */
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  existsSync,
  copyFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const docsWeb = join(docs, 'web');
const docsBridge = join(docs, 'napi-bridge');
const docsDist = join(docs, 'dist');
const srcWeb = join(root, 'web');
const srcBridge = join(root, 'napi-bridge');
const srcDist = join(root, 'dist');

function rmDir(p) {
  try {
    rmSync(p, { recursive: true, force: true });
  } catch { /* ignore */ }
}

rmDir(docsWeb);
rmDir(docsBridge);
mkdirSync(docsDist, { recursive: true });

// Dev/test pages that should not be served on the public Pages site.
// v9-net-test.html is included so users can verify APK + browser connectivity.
const WEB_EXCLUDE = new Set([]);

cpSync(srcWeb, docsWeb, {
  recursive: true,
  filter: (src) => !WEB_EXCLUDE.has(src.split('/').pop()),
});
cpSync(srcBridge, docsBridge, { recursive: true });

/** Project Pages base is /<repo>/; import maps must not use site-root /napi-bridge/ (breaks under /repo/). */
function rewriteNapiBridgeImports(html) {
  return html.replaceAll('"/napi-bridge/', '"../napi-bridge/').replaceAll("'/napi-bridge/", "'../napi-bridge/");
}

function walkHtmlFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkHtmlFiles(p, out);
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

for (const htmlPath of walkHtmlFiles(docsWeb)) {
  let html = readFileSync(htmlPath, 'utf8');
  html = rewriteNapiBridgeImports(html);
  writeFileSync(htmlPath, html, 'utf8');
}

// Wasm runtime is required — fail if missing
for (const f of ['edgejs.js', 'edgejs.wasm']) {
  const from = join(srcDist, f);
  const to = join(docsDist, f);
  if (!existsSync(from)) {
    console.error(`FATAL: ${from} not found. The wasm runtime is required for deployment.`);
    console.error('  npm run vendor:wasm   (download from CI)');
    console.error('  npm run build         (build from source)');
    process.exit(1);
  }
  copyFileSync(from, to);
}

// Make edgejs.js browser-importable:
// 1. Strip shebang (#!/usr/bin/env node) — invalid JS for import()
// 2. Append ESM export — Emscripten outputs `var EdgeJSModule = (...)()` which is
//    a script, not an ES module. Browser import() sees no exports without this.
{
  const edgeJsDest = join(docsDist, 'edgejs.js');
  let src = readFileSync(edgeJsDest, 'utf8');
  let changed = false;
  if (src.startsWith('#!')) {
    src = src.replace(/^#![^\n]*\n?/, '');
    changed = true;
    console.log('Stripped shebang from docs/dist/edgejs.js');
  }
  if (!src.includes('export default')) {
    src += '\nexport default EdgeJSModule;\n';
    changed = true;
    console.log('Appended ESM export default to docs/dist/edgejs.js');
  }
  if (changed) {
    writeFileSync(edgeJsDest, src, 'utf8');
  }
}

// Optional: SDK bundle
for (const f of ['anthropic-sdk-bundle.js']) {
  const from = join(srcDist, f);
  const to = join(docsDist, f);
  if (existsSync(from)) copyFileSync(from, to);
}

const docsTest = join(docs, 'test');
rmDir(docsTest);

// Disable Jekyll so paths like /web/ and dotfiles are served as static assets.
writeFileSync(join(docs, '.nojekyll'), '', 'utf8');

console.log('GitHub Pages payload prepared under docs/{web,napi-bridge,dist} (generated; see .gitignore)');
