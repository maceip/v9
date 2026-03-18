import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const CHECKLIST_RELATIVE_PATH = '.planning/phases/02-napi-bridge-hardening/02-03-PHASE-CLOSE-CHECKLIST.md';
const REQUIRED_DOCS = [
  '.planning/PROJECT.md',
  '.planning/STATE.md',
  '.planning/phases/02-napi-bridge-hardening/02-01-PLAN.md',
  '.planning/phases/02-napi-bridge-hardening/02-01-SUMMARY.md',
  '.planning/phases/02-napi-bridge-hardening/02-02-ENGINEERING-WORKSTREAMS.md',
  CHECKLIST_RELATIVE_PATH,
];
const REQUIRED_CHECKLIST_IDS = [
  'P1-GATE-STRICT-BUILD',
  'P1-GATE-BROWSER-INSTANTIATION',
  'P2-GATE-NAPI-CONFORMANCE',
  'P2-GATE-RUNTIME-CONTRACT',
  'P2-GATE-SOAK-EVIDENCE',
  'P2-GATE-RELEASE-GUARDS',
];
const DEFAULT_COMMANDS = [
  ['node', 'tests/test-basic.mjs'],
  ['node', 'tests/test-napi-bridge.mjs'],
  ['node', 'tests/test-wasm-load.mjs'],
];
const FORBIDDEN_TEST_SUPPRESSION_PATTERNS = [
  { file: 'Makefile', pattern: /(^|\n)[^\n]*test[^\n]*\|\|\s*true/g },
  { file: 'package.json', pattern: /"(?:test|test:[^"]+)"\s*:\s*"[^"]*\|\|\s*true[^"]*"/g },
];

function repoRootFrom(currentFile = import.meta.url) {
  const scriptDir = path.dirname(fileURLToPath(currentFile));
  return path.resolve(scriptDir, '..');
}

function readUtf8(rootDir, relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function formatCommand(argv) {
  return argv.map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(' ');
}

function createResult(id, ok, summary, details = []) {
  return { id, ok, summary, details };
}

export function evaluateRequiredDocs(rootDir) {
  const missing = REQUIRED_DOCS.filter((relativePath) => !existsSync(path.join(rootDir, relativePath)));
  if (missing.length > 0) {
    return createResult(
      'required-docs',
      false,
      'required planning and checklist documents are missing',
      missing.map((relativePath) => `missing: ${relativePath}`),
    );
  }
  return createResult('required-docs', true, 'required planning and checklist documents are present');
}

export function evaluateChecklistDocument(markdown) {
  const missingIds = REQUIRED_CHECKLIST_IDS.filter((id) => !markdown.includes(id));
  if (missingIds.length > 0) {
    return createResult(
      'checklist-document',
      false,
      'phase close checklist is missing required release-gate checkpoints',
      missingIds.map((id) => `missing checkpoint id: ${id}`),
    );
  }
  return createResult('checklist-document', true, 'phase close checklist contains all required gate checkpoints');
}

export function findForbiddenTestSuppressions(files) {
  const matches = [];
  for (const { file, pattern } of FORBIDDEN_TEST_SUPPRESSION_PATTERNS) {
    const content = files[file];
    if (typeof content !== 'string') continue;
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      matches.push({ file, snippet: match[0].trim() });
    }
  }
  return matches;
}

export function evaluateTestSuppressions(files) {
  const matches = findForbiddenTestSuppressions(files);
  if (matches.length > 0) {
    return createResult(
      'test-suppression',
      false,
      'test commands still contain suppression that can mask failures',
      matches.map(({ file, snippet }) => `${file}: ${snippet}`),
    );
  }
  return createResult('test-suppression', true, 'test commands do not suppress failures with || true');
}

export async function evaluateUnknownImportFallback(rootDir) {
  const modulePath = path.join(rootDir, 'napi-bridge', 'index.js');
  const { NapiBridge } = await import(pathToFileURL(modulePath).href);
  const bridge = new NapiBridge(null);
  bridge.memory = { buffer: new ArrayBuffer(64) };
  const importModule = bridge.getImportModule();
  const missing = importModule.__codex_release_gate_missing_import__;
  const ok = typeof missing === 'undefined';
  if (!ok) {
    return createResult(
      'unknown-import-fallback',
      false,
      'unknown N-API imports still resolve through a permissive fallback',
      ['bridge.getImportModule().__codex_release_gate_missing_import__ should be undefined in release mode'],
    );
  }
  return createResult('unknown-import-fallback', true, 'unknown N-API imports are rejected instead of silently succeeding');
}

export function evaluateRuntimeWrapperFallbacks(source) {
  const markers = [
    'process.exit(0);',
    'process.exit(1);',
    'const evalPath = `/__edge_eval_',
    'const runnerPath = `/__edge_run_',
  ].filter((marker) => source.includes(marker));
  if (markers.length > 0) {
    return createResult(
      'runtime-wrapper-fallbacks',
      false,
      'eval/runFile still use probe-oriented temp-script wrappers',
      markers.map((marker) => `marker present: ${marker}`),
    );
  }
  return createResult('runtime-wrapper-fallbacks', true, 'eval/runFile do not rely on temp-script probe wrappers');
}

export function runVerificationCommands(rootDir, commands = DEFAULT_COMMANDS) {
  const results = [];
  for (const argv of commands) {
    const [cmd, ...args] = argv;
    const run = spawnSync(cmd, args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    results.push({
      command: formatCommand(argv),
      ok: run.status === 0,
      status: run.status,
      stdout: run.stdout || '',
      stderr: run.stderr || '',
      error: run.error ? String(run.error.message || run.error) : '',
    });
  }
  return results;
}

export function evaluateVerificationCommands(commandResults) {
  const failures = commandResults.filter((result) => !result.ok);
  if (failures.length > 0) {
    return createResult(
      'verification-commands',
      false,
      'one or more required verification commands failed',
      failures.map((result) => `${result.command} (exit ${result.status ?? 'error'})`),
    );
  }
  return createResult('verification-commands', true, 'required verification commands succeeded');
}

export async function evaluateReleaseGate(rootDir, commandRunner = runVerificationCommands) {
  const checklistText = readUtf8(rootDir, CHECKLIST_RELATIVE_PATH);
  const makefileText = readUtf8(rootDir, 'Makefile');
  const packageJsonText = readUtf8(rootDir, 'package.json');
  const bridgeSource = readUtf8(rootDir, 'napi-bridge/index.js');
  const commandResults = commandRunner(rootDir);

  const results = [
    evaluateRequiredDocs(rootDir),
    evaluateChecklistDocument(checklistText),
    evaluateTestSuppressions({ Makefile: makefileText, 'package.json': packageJsonText }),
    await evaluateUnknownImportFallback(rootDir),
    evaluateRuntimeWrapperFallbacks(bridgeSource),
    evaluateVerificationCommands(commandResults),
  ];

  return {
    ok: results.every((result) => result.ok),
    results,
    commandResults,
  };
}


function printGateReport(report) {
  console.log('=== Phase Close Release Gate ===');
  for (const result of report.results) {
    const icon = result.ok ? 'PASS' : 'FAIL';
    console.log(`- [${icon}] ${result.id}: ${result.summary}`);
    for (const detail of result.details) {
      console.log(`    • ${detail}`);
    }
  }

  console.log('\nVerification Commands:');
  for (const command of report.commandResults) {
    const icon = command.ok ? 'PASS' : 'FAIL';
    console.log(`- [${icon}] ${command.command}`);
    if (!command.ok) {
      if (command.error) {
        console.log(`    • error: ${command.error}`);
      }
      if (command.stderr.trim()) {
        console.log(`    • stderr: ${command.stderr.trim().split('\n')[0]}`);
      }
      if (command.stdout.trim()) {
        console.log(`    • stdout: ${command.stdout.trim().split('\n')[0]}`);
      }
    }
  }

  console.log(`\nRelease gate status: ${report.ok ? 'PASS' : 'FAIL'}`);
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const rootDir = repoRootFrom();
  const report = await evaluateReleaseGate(rootDir);
  printGateReport(report);
  process.exit(report.ok ? 0 : 1);
}
