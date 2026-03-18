/**
 * Soak / leak / perf characterization harness.
 *
 * Profiles:
 *   quick       - short local signal
 *   integration - CI integration-level soak
 *   nightly     - 30+ minute characterization run
 */

import { initRuntimeForTests } from './helpers/runtime-init.mjs';
import nodeProcess from 'node:process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PROFILES = {
  quick: {
    durationSec: 45,
    sampleEveryMs: 1_000,
    maxHandleGrowthPerMin: 240,
    maxJsHeapGrowthMbPerMin: 500,
    maxWasmHeapGrowthMbPerMin: 256,
  },
  integration: {
    durationSec: 5 * 60,
    sampleEveryMs: 2_000,
    maxHandleGrowthPerMin: 120,
    maxJsHeapGrowthMbPerMin: 350,
    maxWasmHeapGrowthMbPerMin: 96,
  },
  nightly: {
    durationSec: 30 * 60,
    sampleEveryMs: 5_000,
    maxHandleGrowthPerMin: 30,
    maxJsHeapGrowthMbPerMin: 200,
    maxWasmHeapGrowthMbPerMin: 32,
  },
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i++;
  }
  return out;
}

function slopePerMinute(startValue, endValue, elapsedMs) {
  const elapsedMin = elapsedMs / 60_000;
  if (elapsedMin <= 0) return 0;
  return (endValue - startValue) / elapsedMin;
}

function nowMs() {
  return Date.now();
}

function mb(bytes) {
  return bytes / 1024 / 1024;
}

const args = parseArgs(process.argv.slice(2));
const profileName = String(args.profile || 'quick');
if (!PROFILES[profileName]) {
  console.error(`Unknown profile '${profileName}'. Expected one of: ${Object.keys(PROFILES).join(', ')}`);
  process.exit(1);
}

const profile = {
  ...PROFILES[profileName],
  durationSec: args['duration-sec'] ? Number(args['duration-sec']) : PROFILES[profileName].durationSec,
};

console.log('=== Soak Harness ===');
console.log(`profile=${profileName} durationSec=${profile.durationSec} sampleEveryMs=${profile.sampleEveryMs}`);

const { runtime } = await initRuntimeForTests({
  strictUnknownImports: process.env.EDGEJS_STRICT_IMPORTS === '1',
  captureOutput: false,
  logNapiErrors: false,
});

runtime.fs.mkdirTree('/soak');
runtime.fs.mkdirTree('/soak/tmp');
runtime.fs.writeFile('/soak/module-load.js', "module.exports = 1;\n");

const startedAt = nowMs();
const stopAt = startedAt + profile.durationSec * 1_000;
let nextSampleAt = startedAt;

const samples = [];

function collectSample(label) {
  const diagnostics = runtime.diagnostics();
  const mem = nodeProcess.memoryUsage();
  samples.push({
    t: nowMs(),
    label,
    activeHandles: diagnostics.activeHandles,
    activeRefs: diagnostics.activeRefs,
    callbackInfoCount: diagnostics.callbackInfoCount,
    wrappedPointerCount: diagnostics.wrappedPointerCount,
    arrayBufferMetadataCount: diagnostics.arrayBufferMetadataCount,
    importErrorsTotal: Object.values(diagnostics.importErrors || {}).reduce((sum, v) => sum + Number(v || 0), 0),
    missingImportsTotal: Object.values(diagnostics.missingImports || {}).reduce((sum, v) => sum + Number(v || 0), 0),
    jsHeapUsedMb: mb(mem.heapUsed),
    wasmHeapMb: runtime.module?.HEAP8?.buffer ? mb(runtime.module.HEAP8.buffer.byteLength) : 0,
  });
}

collectSample('start');

let loopCounter = 0;
while (nowMs() < stopAt) {
  // fs-heavy
  const filePath = `/soak/tmp/file-${loopCounter}.txt`;
  runtime.fs.writeFile(filePath, `payload-${loopCounter}`);
  runtime.fs.readFile(filePath);
  runtime.fs.unlink(filePath);

  // module-load-heavy
  runtime.runFile('/soak/module-load.js');

  // error-heavy
  try {
    runtime.eval(`throw new Error('soak-error-${loopCounter}')`);
  } catch {
    // Expected in error-heavy lane.
  }

  // callback-heavy (exercise function/call paths repeatedly)
  try {
    runtime.eval(`(() => [1,2,3,4,5].map((x) => x + ${loopCounter % 3}).join(','))()`);
  } catch {
    // Bootstrap path may fail; still exercises bridge execution path.
  }

  loopCounter++;

  const now = nowMs();
  if (now >= nextSampleAt) {
    collectSample('tick');
    nextSampleAt = now + profile.sampleEveryMs;
  }
}

collectSample('end');

const warmupIndex = Math.min(samples.length - 1, Math.floor(samples.length * 0.2));
const first = samples[warmupIndex] || samples[0];
const last = samples[samples.length - 1];
const elapsedMs = Math.max(1, last.t - first.t);

const handleGrowthPerMin = slopePerMinute(first.activeHandles, last.activeHandles, elapsedMs);
const jsHeapGrowthPerMin = slopePerMinute(first.jsHeapUsedMb, last.jsHeapUsedMb, elapsedMs);
const wasmHeapGrowthPerMin = slopePerMinute(first.wasmHeapMb, last.wasmHeapMb, elapsedMs);
const finalDiagnostics = runtime.diagnostics();
const importErrorTotal = Object.values(finalDiagnostics.importErrors || {})
  .reduce((sum, v) => sum + Number(v || 0), 0);
const missingImportTotal = Object.values(finalDiagnostics.missingImports || {})
  .reduce((sum, v) => sum + Number(v || 0), 0);

const checks = [
  {
    name: 'no missing imports',
    ok: missingImportTotal === 0,
    details: `missingImportTotal=${missingImportTotal}`,
  },
  {
    name: 'no import errors',
    ok: importErrorTotal === 0,
    details: `importErrorTotal=${importErrorTotal}`,
  },
  {
    name: 'handle growth slope bounded',
    ok: handleGrowthPerMin <= profile.maxHandleGrowthPerMin,
    details: `handleGrowthPerMin=${handleGrowthPerMin.toFixed(2)} max=${profile.maxHandleGrowthPerMin}`,
  },
  {
    name: 'JS heap growth slope bounded',
    ok: jsHeapGrowthPerMin <= profile.maxJsHeapGrowthMbPerMin,
    details: `jsHeapGrowthPerMin=${jsHeapGrowthPerMin.toFixed(2)} max=${profile.maxJsHeapGrowthMbPerMin}`,
  },
  {
    name: 'Wasm heap growth slope bounded',
    ok: wasmHeapGrowthPerMin <= profile.maxWasmHeapGrowthMbPerMin,
    details: `wasmHeapGrowthPerMin=${wasmHeapGrowthPerMin.toFixed(2)} max=${profile.maxWasmHeapGrowthMbPerMin}`,
  },
];

const summary = {
  profile: profileName,
  durationSec: profile.durationSec,
  loopCounter,
  first,
  last,
  handleGrowthPerMin,
  jsHeapGrowthPerMin,
  wasmHeapGrowthPerMin,
  importErrorTotal,
  missingImportTotal,
};

if (nodeProcess.env.SOAK_REPORT_PATH) {
  const reportPath = nodeProcess.env.SOAK_REPORT_PATH;
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(summary, null, 2));
}

console.log('\nSoak summary:');
console.log(JSON.stringify(summary, null, 2));

let failed = 0;
for (const check of checks) {
  if (check.ok) {
    console.log(`  PASS: ${check.name} (${check.details})`);
  } else {
    console.log(`  FAIL: ${check.name} (${check.details})`);
    failed++;
  }
}

process.exit(failed > 0 ? 1 : 0);
