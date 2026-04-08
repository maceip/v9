#!/usr/bin/env node
/**
 * Download pre-built EdgeJS wasm artifacts from the latest CI run.
 *
 * Usage:
 *   npm run vendor:wasm
 *
 * Requires: `gh` CLI (https://cli.github.com/) authenticated.
 *
 * What it does:
 *   1. Finds the most recent successful CI run on main
 *   2. Downloads edgejs-wasm-* artifacts
 *   3. Places dist/edgejs.js + dist/edgejs.wasm + build/edge
 *
 * After running, the wasm files are ready. Commit them to vendor for
 * embedding devs: git add dist/edgejs.js dist/edgejs.wasm
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BUILD = join(ROOT, 'build');
const TMP = join(ROOT, '.tmp', 'wasm-download');

function die(msg) {
  console.error(`\x1b[31m${msg}\x1b[0m`);
  process.exit(1);
}

function info(msg) {
  console.log(`\x1b[36m${msg}\x1b[0m`);
}

// Check gh CLI
try {
  execSync('gh --version', { stdio: 'ignore' });
} catch {
  die(
    'gh CLI not found. Install it: https://cli.github.com/\n' +
    'Then authenticate: gh auth login'
  );
}

// Detect repo from git remote
let repo;
try {
  const remote = execSync('git remote get-url origin', { cwd: ROOT, encoding: 'utf8' }).trim();
  const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  repo = match?.[1];
} catch { /* fallback below */ }
if (!repo) repo = 'maceip/v9';

info(`Looking for wasm artifacts in ${repo} CI...`);

// Find latest successful CI run on main
let runId;
try {
  const result = execSync(
    `gh run list --repo "${repo}" --workflow CI --branch main --status success --limit 5 --json databaseId,conclusion`,
    { cwd: ROOT, encoding: 'utf8' }
  );
  const runs = JSON.parse(result);
  const successful = runs.find(r => r.conclusion === 'success');
  if (successful) runId = successful.databaseId;
} catch (err) {
  die(`Failed to query CI runs: ${err.message}\nMake sure you're authenticated: gh auth login`);
}

if (!runId) {
  die('No successful CI run found on main. Build manually: npm run build');
}

info(`Downloading from CI run ${runId}...`);

// Download artifacts
mkdirSync(TMP, { recursive: true });
const dl = spawnSync('gh', [
  'run', 'download', String(runId),
  '--repo', repo,
  '--pattern', 'edgejs-wasm-*',
  '--dir', TMP,
], { cwd: ROOT, stdio: 'inherit' });

if (dl.status !== 0) {
  die('Download failed. Check gh auth and network.');
}

// Find and copy artifacts
mkdirSync(DIST, { recursive: true });
mkdirSync(BUILD, { recursive: true });

function findFile(dir, name) {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(p, name);
      if (found) return found;
    } else if (entry.name === name) {
      return p;
    }
  }
  return null;
}

const wasmSrc = findFile(TMP, 'edgejs.wasm');
const jsSrc = findFile(TMP, 'edgejs.js');
const edgeSrc = findFile(TMP, 'edge');

if (!wasmSrc || !jsSrc) {
  die(`Artifacts incomplete. Found: wasm=${!!wasmSrc} js=${!!jsSrc}\nCheck CI run ${runId} artifacts.`);
}

copyFileSync(wasmSrc, join(DIST, 'edgejs.wasm'));
copyFileSync(jsSrc, join(DIST, 'edgejs.js'));
if (edgeSrc) copyFileSync(edgeSrc, join(BUILD, 'edge'));

// Clean up
try {
  execSync(`rm -rf "${TMP}"`, { stdio: 'ignore' });
} catch { /* ignore */ }

const wasmSize = existsSync(join(DIST, 'edgejs.wasm'))
  ? (statSync(join(DIST, 'edgejs.wasm')).size / 1024 / 1024).toFixed(1)
  : '?';

console.log('');
console.log(`\x1b[32mWasm runtime vendored:\x1b[0m`);
console.log(`  dist/edgejs.js`);
console.log(`  dist/edgejs.wasm  (${wasmSize} MB)`);
if (edgeSrc) console.log(`  build/edge`);
console.log('');
console.log(`To commit for embedding devs:`);
console.log(`  git add dist/edgejs.js dist/edgejs.wasm`);
