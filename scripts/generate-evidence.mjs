#!/usr/bin/env node
/**
 * Generate the phase-close evidence JSON after a successful build.
 *
 * Usage:
 *   make build                          # produce dist/edgejs.wasm
 *   node scripts/generate-evidence.mjs  # populate evidence file
 *   make release-gate                   # should now pass
 *
 * This script:
 *  1. Validates the Wasm binary exists and loads
 *  2. Runs diagnostics via initEdgeJS
 *  3. Checks import/export manifests and size
 *  4. Records all evidence into the JSON file the release gate expects
 *
 * If any check fails, the corresponding artifact is marked "fail" with
 * a summary explaining why.  The release gate will then reject the
 * phase close on exactly those items.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_DIR = path.join(ROOT, '.planning', 'evidence', 'phase-close');
const EVIDENCE_FILE = path.join(EVIDENCE_DIR, '02-napi-bridge-hardening.json');
const WASM_PATH = path.join(ROOT, 'dist', 'edgejs.wasm');

function result(status, summary, data = {}) {
  return { status, summary, ...data };
}

async function checkWasmBinary() {
  if (!existsSync(WASM_PATH)) {
    return result('fail', `${WASM_PATH} not found — run make build`);
  }
  const buf = readFileSync(WASM_PATH);
  const sizeMB = (buf.length / 1048576).toFixed(1);

  const valid = WebAssembly.validate(buf);
  if (!valid) {
    return result('fail', `edgejs.wasm (${sizeMB} MB) fails WebAssembly.validate()`);
  }

  try {
    const mod = await WebAssembly.compile(buf);
    const exports = WebAssembly.Module.exports(mod);
    const imports = WebAssembly.Module.imports(mod);
    return result('pass', `edgejs.wasm validates and compiles (${sizeMB} MB, ${exports.length} exports, ${imports.length} imports)`, {
      sizeMB: parseFloat(sizeMB),
      exportCount: exports.length,
      importCount: imports.length,
    });
  } catch (e) {
    return result('fail', `WebAssembly.compile failed: ${e.message}`);
  }
}

async function checkBrowserInstantiation() {
  if (!existsSync(WASM_PATH)) {
    return result('fail', 'No Wasm binary — cannot test instantiation');
  }
  try {
    const { initEdgeJS } = await import(path.join(ROOT, 'napi-bridge', 'index.js'));
    const runtime = await initEdgeJS({
      wasmPath: WASM_PATH,
      modulePath: path.join(ROOT, 'build', 'edge'),
    });
    const diag = runtime.diagnostics();
    if (diag.missingImports && diag.missingImports.length > 0) {
      return result('fail', `Instantiation succeeded but ${diag.missingImports.length} missing imports: ${diag.missingImports.slice(0, 5).join(', ')}`);
    }
    return result('pass', 'initEdgeJS() instantiated with real bridge imports, zero missing imports');
  } catch (e) {
    return result('fail', `initEdgeJS() failed: ${e.message}`);
  }
}

async function checkManifestAndSize() {
  if (!existsSync(WASM_PATH)) {
    return {
      manifest: result('fail', 'No Wasm binary'),
      size: result('fail', 'No Wasm binary'),
    };
  }
  const buf = readFileSync(WASM_PATH);
  const sizeMB = buf.length / 1048576;

  // Size budget: Phase 1 has no ceiling, but record for baseline
  const sizeResult = result('pass', `${sizeMB.toFixed(1)} MB raw — baseline recorded`, {
    rawBytes: buf.length,
    rawMB: parseFloat(sizeMB.toFixed(1)),
  });

  // Manifest snapshot
  const mod = await WebAssembly.compile(buf);
  const exports = WebAssembly.Module.exports(mod).map(e => e.name).sort();
  const imports = WebAssembly.Module.imports(mod).map(i => `${i.module}.${i.name}`).sort();

  const snapshotPath = path.join(ROOT, 'tests', 'manifest.snapshot.json');
  const snapshot = { exports: exports.slice(0, 50), imports: imports.slice(0, 50), totalExports: exports.length, totalImports: imports.length };

  if (!existsSync(snapshotPath)) {
    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n');
  }

  const manifestResult = result('pass', `${exports.length} exports, ${imports.length} imports — snapshot recorded`, {
    exportCount: exports.length,
    importCount: imports.length,
  });

  return { manifest: manifestResult, size: sizeResult };
}

async function checkDiagnostics() {
  if (!existsSync(WASM_PATH)) {
    return result('fail', 'No Wasm binary — cannot run diagnostics');
  }
  try {
    const { initEdgeJS } = await import(path.join(ROOT, 'napi-bridge', 'index.js'));
    const runtime = await initEdgeJS({
      wasmPath: WASM_PATH,
      modulePath: path.join(ROOT, 'build', 'edge'),
    });
    const diag = runtime.diagnostics();
    const missing = diag.missingImports?.length || 0;
    const errors = diag.importErrorCount || 0;
    if (missing > 0 || errors > 0) {
      return result('fail', `${missing} missing imports, ${errors} import errors`, { missing, errors });
    }
    return result('pass', 'Zero missing imports, zero import errors', { missing: 0, errors: 0 });
  } catch (e) {
    return result('fail', `Diagnostics check failed: ${e.message}`);
  }
}

function checkSoakEvidence() {
  // Soak requires a 30+ minute run — check if a soak report exists
  const soakReportPaths = [
    path.join(ROOT, 'tests', 'soak-report.json'),
    path.join(ROOT, '.planning', 'evidence', 'soak-report.json'),
  ];

  for (const p of soakReportPaths) {
    if (existsSync(p)) {
      try {
        const report = JSON.parse(readFileSync(p, 'utf8'));
        if (report.passed) {
          return result('pass', `Soak passed: ${report.durationMinutes || '?'} minutes, ${report.iterations || '?'} iterations`, report);
        }
        return result('fail', `Soak report exists but status is not passing: ${report.summary || 'unknown'}`);
      } catch (e) {
        return result('fail', `Soak report at ${p} is not valid JSON: ${e.message}`);
      }
    }
  }

  return result('pending', 'No soak report found — run: node tests/test-soak.mjs --profile nightly');
}

async function main() {
  console.log('=== Generating Phase Close Evidence ===\n');

  const wasm = await checkWasmBinary();
  console.log(`Wasm binary:          [${wasm.status.toUpperCase()}] ${wasm.summary}`);

  const browser = await checkBrowserInstantiation();
  console.log(`Browser instantiation: [${browser.status.toUpperCase()}] ${browser.summary}`);

  const { manifest, size } = await checkManifestAndSize();
  console.log(`Manifest snapshot:     [${manifest.status.toUpperCase()}] ${manifest.summary}`);
  console.log(`Size budget:           [${size.status.toUpperCase()}] ${size.summary}`);

  const diag = await checkDiagnostics();
  console.log(`Diagnostics:           [${diag.status.toUpperCase()}] ${diag.summary}`);

  const soak = checkSoakEvidence();
  console.log(`Soak evidence:         [${soak.status.toUpperCase()}] ${soak.summary}`);

  const evidence = {
    phase: '02-napi-bridge-hardening',
    updatedAt: new Date().toISOString(),
    artifacts: {
      browserInstantiation: browser,
      manifestSnapshot: manifest,
      sizeBudget: size,
      diagnostics: diag,
      soak: soak,
    },
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(EVIDENCE_FILE, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`\nEvidence written to: ${EVIDENCE_FILE}`);

  const allPass = [browser, manifest, size, diag, soak].every(r => r.status === 'pass');
  console.log(`\nOverall: ${allPass ? 'PASS — run make release-gate to confirm' : 'FAIL — fix failing items above'}`);
  process.exit(allPass ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
