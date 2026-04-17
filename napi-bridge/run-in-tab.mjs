/**
 * Stable embedder entry: init EdgeJS + optional MEMFS seed + runNodeEntry.
 * See docs/RUN_IN_TAB.md.
 */
import { posix } from 'node:path';
import { initEdgeJS } from './index.js';
import { seedMemfsFromHostPath } from './seed-memfs-from-host.mjs';

/**
 * @param {object} runtime - return value of initEdgeJS()
 * @param {object} opts
 * @param {string} opts.entry - MEMFS script path
 * @param {string} [opts.cwd='/workspace']
 * @param {string} [opts.argv0='node']
 * @param {string[]} [opts.argv] - extra args after entry (not including argv0 or entry)
 * @param {Record<string, string>} [opts.env]
 * @returns {Promise<{status: number, stdout: string[], stderr: string[]}>}
 */
export function runNodeEntry(runtime, opts = {}) {
  if (!runtime || typeof runtime.runNodeEntry !== 'function') {
    throw new TypeError('runNodeEntry: runtime.runNodeEntry is missing');
  }
  return runtime.runNodeEntry(opts);
}

function nodejsInTabEnvFromProcess() {
  if (typeof process === 'undefined' || !process.env) return {};
  const out = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('NODEJS_IN_TAB_') && v != null) out[k] = String(v);
  }
  return out;
}

/**
 * Run a third-party app entry on MEMFS: init runtime, optional host→MEMFS seed, then runNodeEntry.
 *
 * @param {object} opts
 * @param {string} [opts.root] - App root in MEMFS; default `process.env.NODEJS_IN_TAB_ROOT` or `/workspace`
 * @param {string} opts.entry - Entry script (absolute MEMFS path or relative to `root`)
 * @param {string} [opts.cwd] - Working directory; defaults to `root`
 * @param {string} [opts.argv0='node']
 * @param {string[]} [opts.argv] - Args after the entry path in `process.argv`
 * @param {Record<string,string>} [opts.env] - Merged into `processBridge.env` after `NODEJS_IN_TAB_*` from the host (Node only) and `opts.runtimeInit.env`
 * @param {boolean} [opts.captureOutput=true] - Buffer stdout/stderr when `runtimeInit` does not set `onStdout`/`onStderr`
 * @param {Array<{ hostPath: string, memfsPath: string }>} [opts.seedFromHost] - Copy host trees into MEMFS before run
 * @param {object} [opts.runtimeInit] - Passed to initEdgeJS (e.g. wasmPath, modulePath, preferJsScriptBridge)
 * @returns {Promise<{ runtime: object, result: { status: number, stdout: string[], stderr: string[] }, stdout: string[], stderr: string[] }>}
 */
export async function runInTab(opts = {}) {
  if (opts.entry == null || opts.entry === '') {
    throw new TypeError('runInTab: opts.entry is required');
  }

  const root =
    opts.root ??
    (typeof process !== 'undefined' && process.env?.NODEJS_IN_TAB_ROOT) ??
    '/workspace';

  let entry = String(opts.entry);
  if (!entry.startsWith('/')) {
    entry = posix.join(root, entry);
  }

  const cwd = opts.cwd ?? root;

  const tabEnv = nodejsInTabEnvFromProcess();
  const initOpts = { ...(opts.runtimeInit || {}) };
  const mergedEnv = {
    ...tabEnv,
    ...(initOpts.env && typeof initOpts.env === 'object' ? initOpts.env : {}),
    ...(opts.env && typeof opts.env === 'object' ? opts.env : {}),
  };
  initOpts.env = mergedEnv;

  const stdout = [];
  const stderr = [];
  const capture = opts.captureOutput !== false;
  if (capture && typeof initOpts.onStdout !== 'function') {
    initOpts.onStdout = (chunk) => {
      stdout.push(String(chunk));
    };
  }
  if (capture && typeof initOpts.onStderr !== 'function') {
    initOpts.onStderr = (chunk) => {
      stderr.push(String(chunk));
    };
  }

  const runtime = await initEdgeJS(initOpts);

  for (const seed of opts.seedFromHost || []) {
    seedMemfsFromHostPath({
      hostPath: seed.hostPath,
      memfsPath: seed.memfsPath,
      runtimeFs: runtime.fs,
    });
  }

  const result = await runNodeEntry(runtime, {
    entry,
    cwd,
    argv0: opts.argv0,
    argv: opts.argv,
    env: opts.env,
  });

  return { runtime, result, stdout, stderr };
}
