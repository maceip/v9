import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const DEFAULT_POLICY_PATH = '.planning/phases/02-napi-bridge-hardening/02-03-PHASE-CLOSE-CHECKLIST.json';

function repoRootFrom(currentFile = import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(currentFile));
  return path.resolve(scriptDir, '..');
}

function readUtf8(rootDir, relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function formatCommand(argv) {
  return argv.map((part) => (typeof part === 'string' && /\s/.test(part) ? JSON.stringify(part) : String(part))).join(' ');
}

function createResult({ id, ok, summary, details = [], command = null }) {
  return { id, ok, summary, details, command };
}

function uniqueIds(items, kind) {
  const seen = new Set();
  for (const item of items) {
    if (!item?.id || typeof item.id !== 'string') {
      throw new Error(`${kind} entries must have a non-empty string id`);
    }
    if (seen.has(item.id)) {
      throw new Error(`${kind} contains duplicate id: ${item.id}`);
    }
    seen.add(item.id);
  }
}

export function loadPolicy(rootDir, policyPath = DEFAULT_POLICY_PATH) {
  const absolutePath = path.join(rootDir, policyPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`release-gate policy not found: ${policyPath}`);
  }

  const policy = JSON.parse(readFileSync(absolutePath, 'utf8'));
  validatePolicy(policy);
  return policy;
}

export function validatePolicy(policy) {
  if (!policy || typeof policy !== 'object') {
    throw new Error('release-gate policy must be a JSON object');
  }
  if (!Array.isArray(policy.checks) || policy.checks.length === 0) {
    throw new Error('release-gate policy must define at least one check');
  }
  if (!Array.isArray(policy.checkpoints) || policy.checkpoints.length === 0) {
    throw new Error('release-gate policy must define at least one checkpoint');
  }

  uniqueIds(policy.checks, 'checks');
  uniqueIds(policy.checkpoints, 'checkpoints');

  const checkIds = new Set(policy.checks.map((check) => check.id));
  for (const check of policy.checks) {
    if (!check.type || typeof check.type !== 'string') {
      throw new Error(`check ${check.id} is missing a type`);
    }
    if (!check.description || typeof check.description !== 'string') {
      throw new Error(`check ${check.id} is missing a description`);
    }
  }

  for (const checkpoint of policy.checkpoints) {
    if (!Array.isArray(checkpoint.requires) || checkpoint.requires.length === 0) {
      throw new Error(`checkpoint ${checkpoint.id} must declare required checks`);
    }
    for (const requiredCheckId of checkpoint.requires) {
      if (!checkIds.has(requiredCheckId)) {
        throw new Error(`checkpoint ${checkpoint.id} references unknown check ${requiredCheckId}`);
      }
    }
  }
}

export function getJsonValue(value, pathSegments) {
  let current = value;
  for (const segment of pathSegments) {
    if (current == null || typeof current !== 'object' || !(segment in current)) {
      return { found: false, value: undefined };
    }
    current = current[segment];
  }
  return { found: true, value: current };
}

export function runCommand(rootDir, argv) {
  const [command, ...args] = argv;
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return {
    command: formatCommand(argv),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? String(result.error.message || result.error) : '',
  };
}

async function runBridgeUnknownImportRejected(rootDir) {
  const modulePath = path.join(rootDir, 'napi-bridge', 'index.js');
  const { NapiBridge } = await import(pathToFileURL(modulePath).href);
  const bridge = new NapiBridge(null);
  bridge.memory = { buffer: new ArrayBuffer(64) };
  const importModule = bridge.getImportModule();
  const missing = importModule.__codex_release_gate_missing_import__;
  const ok = typeof missing === 'undefined';
  return createResult({
    id: 'unknown-import-fallback-removed',
    ok,
    summary: ok
      ? 'unknown N-API imports are rejected instead of silently succeeding'
      : 'unknown N-API imports still resolve through a permissive fallback',
    details: ok ? [] : ['bridge.getImportModule().__codex_release_gate_missing_import__ must be undefined in release mode'],
  });
}

function runRuntimeWrappersRemoved(rootDir) {
  const source = readUtf8(rootDir, 'napi-bridge/index.js');
  const markers = [
    'process.exit(0);',
    'process.exit(1);',
    'const evalPath = `/__edge_eval_',
    'const runnerPath = `/__edge_run_',
  ].filter((marker) => source.includes(marker));
  const ok = markers.length === 0;
  return createResult({
    id: 'runtime-probe-wrappers-removed',
    ok,
    summary: ok
      ? 'public runtime execution APIs are not probe-only wrappers'
      : 'eval/runFile still use probe-oriented temp-script wrappers',
    details: markers.map((marker) => `marker present: ${marker}`),
  });
}

export const BUILTIN_CUSTOM_CHECKS = {
  bridge_unknown_import_rejected: runBridgeUnknownImportRejected,
  runtime_wrappers_removed: runRuntimeWrappersRemoved,
};

export async function evaluateCheck(rootDir, check, options = {}) {
  const commandRunner = options.runCommand || runCommand;
  const customChecks = { ...BUILTIN_CUSTOM_CHECKS, ...(options.customChecks || {}) };

  switch (check.type) {
    case 'required_files': {
      const missing = check.files.filter((relativePath) => !existsSync(path.join(rootDir, relativePath)));
      return createResult({
        id: check.id,
        ok: missing.length === 0,
        summary: missing.length === 0 ? check.description : `${check.description} (missing files)`,
        details: missing.map((relativePath) => `missing: ${relativePath}`),
      });
    }

    case 'forbidden_pattern': {
      const content = readUtf8(rootDir, check.file);
      const pattern = new RegExp(check.pattern, check.flags || '');
      const matches = [...content.matchAll(pattern)].map((match) => match[0].trim()).filter(Boolean);
      return createResult({
        id: check.id,
        ok: matches.length === 0,
        summary: matches.length === 0 ? check.description : `${check.description} (forbidden pattern found)`,
        details: matches.map((snippet) => `${check.file}: ${snippet}`),
      });
    }

    case 'json_field_equals': {
      const jsonPath = path.join(rootDir, check.file);
      if (!existsSync(jsonPath)) {
        return createResult({
          id: check.id,
          ok: false,
          summary: `${check.description} (evidence file missing)`,
          details: [`missing: ${check.file}`],
        });
      }
      const parsed = JSON.parse(readFileSync(jsonPath, 'utf8'));
      const resolved = getJsonValue(parsed, check.path);
      if (!resolved.found) {
        return createResult({
          id: check.id,
          ok: false,
          summary: `${check.description} (field missing)`,
          details: [`missing field: ${check.path.join('.')}`],
        });
      }
      const ok = resolved.value === check.expected;
      return createResult({
        id: check.id,
        ok,
        summary: ok ? check.description : `${check.description} (unexpected value)`,
        details: ok ? [] : [`expected ${JSON.stringify(check.expected)}, got ${JSON.stringify(resolved.value)}`],
      });
    }

    case 'command': {
      const commandResult = commandRunner(rootDir, check.command);
      return createResult({
        id: check.id,
        ok: commandResult.ok,
        summary: commandResult.ok ? check.description : `${check.description} (command failed)`,
        details: commandResult.ok ? [] : [
          `${commandResult.command} (exit ${commandResult.status ?? 'error'})`,
          ...(commandResult.error ? [`error: ${commandResult.error}`] : []),
          ...(commandResult.stderr.trim() ? [`stderr: ${commandResult.stderr.trim().split('\n')[0]}`] : []),
          ...(commandResult.stdout.trim() ? [`stdout: ${commandResult.stdout.trim().split('\n')[0]}`] : []),
        ],
        command: commandResult.command,
      });
    }

    case 'custom': {
      const runner = customChecks[check.name];
      if (typeof runner !== 'function') {
        throw new Error(`unknown custom release-gate check: ${check.name}`);
      }
      const result = await runner(rootDir, check, options);
      return {
        ...result,
        id: check.id,
      };
    }

    default:
      throw new Error(`unsupported release-gate check type: ${check.type}`);
  }
}

export function summarizeCheckpoint(checkpoint, checkResults) {
  const failedRequirements = checkpoint.requires.filter((checkId) => !checkResults.get(checkId)?.ok);
  return {
    id: checkpoint.id,
    description: checkpoint.description,
    ok: failedRequirements.length === 0,
    failedRequirements,
  };
}

export async function evaluateReleaseGate(rootDir, options = {}) {
  const policy = loadPolicy(rootDir, options.policyPath || DEFAULT_POLICY_PATH);
  const checkResults = new Map();

  for (const check of policy.checks) {
    const result = await evaluateCheck(rootDir, check, options);
    checkResults.set(check.id, result);
  }

  const checkpointResults = policy.checkpoints.map((checkpoint) => summarizeCheckpoint(checkpoint, checkResults));
  return {
    ok: checkpointResults.every((checkpoint) => checkpoint.ok),
    policy,
    checks: policy.checks.map((check) => checkResults.get(check.id)),
    checkpoints: checkpointResults,
  };
}

export function printGateReport(report) {
  console.log(`=== Phase Close Release Gate (${report.policy.phase}) ===`);
  console.log('\nChecks:');
  for (const check of report.checks) {
    const icon = check.ok ? 'PASS' : 'FAIL';
    const commandSuffix = check.command ? ` [${check.command}]` : '';
    console.log(`- [${icon}] ${check.id}: ${check.summary}${commandSuffix}`);
    for (const detail of check.details) {
      console.log(`    • ${detail}`);
    }
  }

  console.log('\nCheckpoints:');
  for (const checkpoint of report.checkpoints) {
    const icon = checkpoint.ok ? 'PASS' : 'FAIL';
    console.log(`- [${icon}] ${checkpoint.id}: ${checkpoint.description}`);
    for (const failedRequirement of checkpoint.failedRequirements) {
      console.log(`    • failed requirement: ${failedRequirement}`);
    }
  }

  console.log(`\nRelease gate status: ${report.ok ? 'PASS' : 'FAIL'}`);
}

function parseArgs(argv) {
  const parsed = { policyPath: DEFAULT_POLICY_PATH };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--policy') {
      parsed.policyPath = argv[index + 1];
      index++;
    }
  }
  return parsed;
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = repoRootFrom();
  const report = await evaluateReleaseGate(rootDir, { policyPath: args.policyPath });
  printGateReport(report);
  process.exit(report.ok ? 0 : 1);
}
