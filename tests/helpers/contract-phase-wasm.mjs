/**
 * Phase 2 of the unified in-tab contract: EdgeJS initEdgeJS + MEMFS + runFileAsync executes
 * the same behavioral suite (esbuild CJS bundle, bridge target, offline HTTPS).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { initRuntimeForTests } from './runtime-init.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = join(__dirname, '..', '..');

/**
 * @param {{ rootDir?: string, runBuild?: boolean }} [opts]
 * runBuild: run `node scripts/build-in-tab-api-contract-wasm.mjs` if artifacts missing (default true)
 */
export async function runWasmMemfsContractPhase(opts = {}) {
  const rootDir = opts.rootDir ?? DEFAULT_ROOT;
  const runBuild = opts.runBuild !== false;
  const libPath = join(rootDir, 'dist', 'in-tab-api-contract-wasm-lib.cjs');
  const runPath = join(rootDir, 'dist', 'in-tab-api-contract-wasm-run.cjs');

  if ((!existsSync(libPath) || !existsSync(runPath)) && runBuild) {
    const script = join(rootDir, 'scripts', 'build-in-tab-api-contract-wasm.mjs');
    const r = spawnSync(process.execPath, [script], { stdio: 'inherit', cwd: rootDir });
    if (r.status !== 0) {
      return {
        ok: false,
        name: 'wasm-memfs',
        checksPassed: 0,
        checksFailed: 1,
        notes: ['build-in-tab-api-contract-wasm.mjs failed'],
      };
    }
  }

  if (!existsSync(libPath) || !existsSync(runPath)) {
    return {
      ok: false,
      name: 'wasm-memfs',
      checksPassed: 0,
      checksFailed: 1,
      notes: [`Missing ${libPath} or ${runPath}`],
    };
  }

  const prevTarget = process.env.CONFORMANCE_TARGET;
  const prevOff = process.env.CLAUDE_CONTRACT_OFFLINE;
  const prevOff2 = process.env.NODEJS_CONTRACT_OFFLINE;
  process.env.CONFORMANCE_TARGET = 'bridge';
  process.env.CLAUDE_CONTRACT_OFFLINE = '1';
  process.env.NODEJS_CONTRACT_OFFLINE = '1';

  try {
    const libSrc = readFileSync(libPath, 'utf8');
    const runSrc = readFileSync(runPath, 'utf8');

    const { runtime, stdout } = await initRuntimeForTests({
      strictUnknownImports: false,
      captureOutput: true,
      preferJsScriptBridge: true,
      env: {
        CONFORMANCE_TARGET: 'bridge',
        CLAUDE_CONTRACT_OFFLINE: '1',
        NODEJS_CONTRACT_OFFLINE: '1',
      },
    });

    runtime.fs.mkdirSync('/contracts', { recursive: true });
    runtime.fs.writeFileSync('/contracts/in-tab-api-contract-wasm-lib.cjs', libSrc, 'utf8');
    runtime.fs.writeFileSync('/contracts/in-tab-api-contract-wasm-run.cjs', runSrc, 'utf8');

    if (typeof runtime.runFileAsync !== 'function') {
      return {
        ok: false,
        name: 'wasm-memfs',
        checksPassed: 0,
        checksFailed: 1,
        notes: ['runtime.runFileAsync missing'],
      };
    }

    delete globalThis.__HARNESS_BROWSER_RESULT__;

    const code = await runtime.runFileAsync('/contracts/in-tab-api-contract-wasm-run.cjs');
    const harness = globalThis.__HARNESS_BROWSER_RESULT__;
    delete globalThis.__HARNESS_BROWSER_RESULT__;

    if (code !== 0) {
      return {
        ok: false,
        name: 'wasm-memfs',
        checksPassed: 0,
        checksFailed: 1,
        notes: [`runFileAsync exit ${code}`, stdout.slice(-3).join('\n')].filter(Boolean),
      };
    }

    if (!harness?.ok) {
      return {
        ok: false,
        name: 'wasm-memfs',
        checksPassed: 0,
        checksFailed: 1,
        notes: [`harness not ok: ${JSON.stringify(harness)}`],
      };
    }

    return {
      ok: true,
      name: 'wasm-memfs',
      checksPassed: 1,
      checksFailed: 0,
      notes: [`${harness.passed} passed, ${harness.skipped} skipped, ${harness.failed} failed`],
      harness,
    };
  } finally {
    if (prevTarget !== undefined) process.env.CONFORMANCE_TARGET = prevTarget;
    else delete process.env.CONFORMANCE_TARGET;
    if (prevOff !== undefined) process.env.CLAUDE_CONTRACT_OFFLINE = prevOff;
    else delete process.env.CLAUDE_CONTRACT_OFFLINE;
    if (prevOff2 !== undefined) process.env.NODEJS_CONTRACT_OFFLINE = prevOff2;
    else delete process.env.NODEJS_CONTRACT_OFFLINE;
  }
}
