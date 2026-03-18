import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initEdgeJS } from '../../napi-bridge/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');
const wasmPath = join(rootDir, 'dist', 'edgejs.wasm');
const moduleFactoryPath = join(rootDir, 'build', 'edge');

export async function initRuntimeForTests({
  strictUnknownImports = process.env.EDGEJS_STRICT_IMPORTS === '1',
  captureOutput = true,
  logNapiErrors = true,
} = {}) {
  if (!existsSync(wasmPath)) {
    throw new Error(`Missing wasm artifact at ${wasmPath}; run make build first`);
  }
  if (!existsSync(moduleFactoryPath)) {
    throw new Error(`Missing module factory at ${moduleFactoryPath}; run make build first`);
  }

  const stdout = [];
  const stderr = [];
  const runtime = await initEdgeJS({
    moduleUrl: './__missing_edge_module__.js',
    modulePath: '../build/edge',
    wasmPath: '../dist/edgejs.wasm',
    strictUnknownImports,
    logNapiErrors,
    onStdout: (...args) => {
      if (captureOutput) stdout.push(args.map((v) => String(v)).join(' '));
    },
    onStderr: (...args) => {
      if (captureOutput) stderr.push(args.map((v) => String(v)).join(' '));
    },
  });

  return { runtime, stdout, stderr };
}
