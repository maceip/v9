#!/usr/bin/env node
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runInTab } from '../napi-bridge/run-in-tab.mjs';

function fail(m) {
  console.error('FAIL:', m);
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const wasmPath = join(rootDir, 'dist', 'edgejs.wasm');
const moduleFactoryPath = join(rootDir, 'build', 'edge');

if (!existsSync(wasmPath)) fail(`Missing ${wasmPath}; run make build first`);
if (!existsSync(moduleFactoryPath)) fail(`Missing ${moduleFactoryPath}; run make build first`);

const memfsRoot = '/workspace';
const script = `${memfsRoot}/app/hello.js`;
const files = {
  [script]: `const fs = require('fs');
const m = fs.readFileSync('${memfsRoot}/seed/marker.txt', 'utf8');
console.log(JSON.stringify({ marker: m, env: process.env.NODEJS_IN_TAB_TEST_MARKER }));`,
};

const tmp = mkdtempSync(join(tmpdir(), 'nodejs-in-tab-seed-'));
try {
  writeFileSync(join(tmp, 'marker.txt'), 'ok');

  const { result } = await runInTab({
    root: memfsRoot,
    entry: 'app/hello.js',
    env: { NODEJS_IN_TAB_TEST_MARKER: 'embedder' },
    runtimeInit: {
      files,
      moduleUrl: './__missing_edge_module__.js',
      modulePath: '../build/edge',
      wasmPath: '../dist/edgejs.wasm',
      strictUnknownImports: process.env.EDGEJS_STRICT_IMPORTS === '1',
      preferJsScriptBridge: true,
      logNapiErrors: true,
    },
    seedFromHost: [{ hostPath: tmp, memfsPath: `${memfsRoot}/seed` }],
  });

  if (result.status !== 0) {
    fail(`runInTab status ${result.status}: ${(result.stderr || []).join('\n')}`);
  }
  const line = (result.stdout || []).join('\n').trim();
  const parsed = JSON.parse(line);
  if (parsed.marker !== 'ok') fail(`expected marker ok, got ${parsed.marker}`);
  if (parsed.env !== 'embedder') fail(`expected env marker embedder, got ${parsed.env}`);
  console.log('=== runInTab seed + entry === ok');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
