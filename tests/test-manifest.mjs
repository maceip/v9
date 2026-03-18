import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmPath = join(__dirname, '..', 'dist', 'edgejs.wasm');
const snapshotPath = join(__dirname, 'manifest.snapshot.json');

const COMPRESSED_SIZE_BUDGET_MB = 5.0; // Budget in MB for Brotli compressed size

console.log('=== Export/Import Manifest & Size Regression Check ===\n');

if (!existsSync(wasmPath)) {
  console.log(`SKIP: ${wasmPath} not found.`);
  process.exit(0);
}

const wasmBuffer = readFileSync(wasmPath);

// Compress the buffer to get the wire size
const compressedBuffer = zlib.brotliCompressSync(wasmBuffer);

// Size check
const sizeMB = compressedBuffer.length / (1024 * 1024);
console.log(`Compressed Binary Size: ${sizeMB.toFixed(2)} MB (Budget: ${COMPRESSED_SIZE_BUDGET_MB.toFixed(2)} MB)`);

if (sizeMB > COMPRESSED_SIZE_BUDGET_MB) {
  console.error(`FAIL: Compressed binary size exceeds budget! (${sizeMB.toFixed(2)} MB > ${COMPRESSED_SIZE_BUDGET_MB} MB)`);
  process.exit(1);
} else {
  console.log(`PASS: Compressed binary size is within budget.`);
}

let wasmModule;
try {
  wasmModule = await WebAssembly.compile(wasmBuffer);
} catch (e) {
  console.error(`FAIL: Could not compile Wasm module - ${e.message}`);
  process.exit(1);
}

const exportsInfo = WebAssembly.Module.exports(wasmModule);
const importsInfo = WebAssembly.Module.imports(wasmModule);

const manifest = {
  exports: exportsInfo.map(e => e.name).sort(),
  imports: importsInfo.map(i => `${i.module}::${i.name}`).sort()
};

const currentManifestStr = JSON.stringify(manifest, null, 2);

if (existsSync(snapshotPath)) {
  const snapshotStr = readFileSync(snapshotPath, 'utf8');
  if (currentManifestStr !== snapshotStr) {
    console.error('FAIL: Manifest does not match snapshot!');
    console.error('If this is expected, overwrite tests/manifest.snapshot.json with the new output.');
    process.exit(1);
  } else {
    console.log('PASS: Manifest matches snapshot.');
  }
} else {
  console.error('FAIL: Snapshot not found at tests/manifest.snapshot.json');
  console.error('Cannot run regression check without a baseline.');
  process.exit(1);
}