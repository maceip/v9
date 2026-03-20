import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { unzipSync } from 'fflate';
import esbuild from 'esbuild';
import { NODE_API_SURFACE_MODULES } from '../napi-bridge/node-api-surface.generated.js';

const execFile = promisify(_execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

const IGNORED_DIRS = new Set(['.git', '.hg', '.svn', 'node_modules', 'dist', 'build', 'target', '.next']);
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const DEFAULT_STAGE_ROOT = path.join(os.tmpdir(), 'parsec-engine-jobs');

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function sanitizeZipPath(entry) {
  const normalized = path.posix.normalize(entry);
  if (normalized.startsWith('../') || normalized === '..' || path.isAbsolute(normalized)) return null;
  return normalized;
}

function parseImportsFromSource(source) {
  const modules = new Set();
  const importRe = /\bimport\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportRe = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  const requireRe = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const re of [importRe, dynamicImportRe, requireRe]) {
    let match;
    while ((match = re.exec(source)) !== null) modules.add(match[1]);
  }

  return [...modules];
}

async function listFilesRecursive(rootDir) {
  const files = [];
  async function walk(currentDir) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(fullPath);
        continue;
      }
      files.push(fullPath);
    }
  }
  await walk(rootDir);
  return files;
}

async function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function scoreEntryCandidate(relPath) {
  const normalized = relPath.toLowerCase();
  if (normalized.endsWith('/index.ts') || normalized.endsWith('/index.js')) return 90;
  if (normalized.endsWith('/main.ts') || normalized.endsWith('/main.js')) return 80;
  if (normalized.includes('/src/')) return 40;
  return 10;
}

async function detectEntryPoint(sourceDir, preferredEntry) {
  if (preferredEntry) {
    const absolute = path.isAbsolute(preferredEntry) ? preferredEntry : path.join(sourceDir, preferredEntry);
    if (existsSync(absolute)) return absolute;
  }

  const packageJson = await readJsonIfExists(path.join(sourceDir, 'package.json'));
  if (packageJson) {
    const packageCandidates = [];
    if (typeof packageJson.module === 'string') packageCandidates.push(packageJson.module);
    if (typeof packageJson.browser === 'string') packageCandidates.push(packageJson.browser);
    if (typeof packageJson.main === 'string') packageCandidates.push(packageJson.main);
    if (typeof packageJson.bin === 'string') packageCandidates.push(packageJson.bin);
    if (packageJson.bin && typeof packageJson.bin === 'object') {
      for (const candidate of Object.values(packageJson.bin)) {
        if (typeof candidate === 'string') packageCandidates.push(candidate);
      }
    }
    for (const candidate of packageCandidates) {
      const fullPath = path.join(sourceDir, candidate);
      if (existsSync(fullPath)) return fullPath;
    }
  }

  const allFiles = await listFilesRecursive(sourceDir);
  const jsCandidates = allFiles
    .filter((fullPath) => JS_EXTENSIONS.has(path.extname(fullPath)))
    .map((fullPath) => ({ fullPath, relPath: toPosix(path.relative(sourceDir, fullPath)) }));
  if (jsCandidates.length === 0) return null;
  jsCandidates.sort((a, b) => scoreEntryCandidate(b.relPath) - scoreEntryCandidate(a.relPath));
  return jsCandidates[0].fullPath;
}

async function analyzeSourceTree(sourceDir) {
  const files = await listFilesRecursive(sourceDir);
  const extensions = {};
  const imports = new Set();

  for (const fullPath of files) {
    const ext = path.extname(fullPath).toLowerCase();
    extensions[ext] = (extensions[ext] || 0) + 1;

    if (!JS_EXTENSIONS.has(ext)) continue;
    const source = await readFile(fullPath, 'utf8');
    for (const specifier of parseImportsFromSource(source)) imports.add(specifier);
  }

  const nodeBuiltinsUsed = [...imports]
    .map((specifier) => specifier.startsWith('node:') ? specifier.slice(5) : specifier)
    .filter((specifier) => NODE_API_SURFACE_MODULES.includes(specifier))
    .sort();
  const externalPackagesUsed = [...imports]
    .filter((specifier) => !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:'))
    .sort();

  return {
    fileCount: files.length,
    extensionHistogram: extensions,
    nodeBuiltinsUsed,
    externalPackagesUsed,
  };
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function copyRawInputToDir(input, targetDir) {
  if (typeof input === 'string') {
    const fullPath = path.resolve(input);
    const info = await stat(fullPath);
    if (info.isDirectory()) {
      await cp(fullPath, targetDir, { recursive: true });
      return;
    }
    await ensureDir(path.dirname(path.join(targetDir, path.basename(fullPath))));
    await cp(fullPath, path.join(targetDir, path.basename(fullPath)));
    return;
  }

  if (input && typeof input === 'object' && input.files && typeof input.files === 'object') {
    for (const [filePath, content] of Object.entries(input.files)) {
      const normalized = sanitizeZipPath(filePath);
      if (!normalized) continue;
      const outputPath = path.join(targetDir, normalized);
      await ensureDir(path.dirname(outputPath));
      await writeFile(outputPath, String(content), 'utf8');
    }
    return;
  }

  throw new Error('raw-js input must be a file path, directory path, or { files } map.');
}

async function unpackZipInput(zipPath, targetDir) {
  const zipBuffer = await readFile(zipPath);
  const unzipped = unzipSync(new Uint8Array(zipBuffer));
  for (const [entryName, content] of Object.entries(unzipped)) {
    const normalized = sanitizeZipPath(entryName);
    if (!normalized || normalized.endsWith('/')) continue;
    const outputPath = path.join(targetDir, normalized);
    await ensureDir(path.dirname(outputPath));
    await writeFile(outputPath, content);
  }
}

async function ingestNpmPackage(packageSpec, targetDir) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'parsec-npm-pack-'));
  try {
    const { stdout } = await execFile('npm', ['pack', packageSpec, '--json'], { cwd: tempDir });
    const parsed = JSON.parse(stdout.trim());
    const tarballName = parsed?.[0]?.filename;
    if (!tarballName) throw new Error(`npm pack did not return tarball filename for ${packageSpec}`);
    await execFile('tar', ['-xzf', tarballName, '--strip-components=1', '-C', targetDir], { cwd: tempDir });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function ingestGithubInput(repoInput, targetDir) {
  if (typeof repoInput !== 'string') {
    throw new Error('github input must be a repository URL or a local path');
  }
  if (/^(https?:\/\/|git@|ssh:\/\/)/.test(repoInput)) {
    await execFile('git', ['clone', '--depth', '1', repoInput, targetDir]);
    return;
  }
  const localPath = path.resolve(repoInput);
  await cp(localPath, targetDir, { recursive: true });
}

async function buildOptimizedBlob(entryPath, outDir, nodeBuiltinsUsed) {
  await ensureDir(outDir);
  const outFile = path.join(outDir, 'app.optimized.js');
  const result = await esbuild.build({
    entryPoints: [entryPath],
    outfile: outFile,
    bundle: true,
    format: 'esm',
    minify: true,
    sourcemap: 'external',
    target: ['es2020'],
    platform: 'browser',
    external: nodeBuiltinsUsed.flatMap((name) => [name, `node:${name}`]),
    logLevel: 'silent',
    metafile: true,
    legalComments: 'none',
    treeShaking: true,
    write: true,
  });
  return {
    outputFile: outFile,
    outputMapFile: `${outFile}.map`,
    metafile: result.metafile || null,
  };
}

async function loadBackendConfig() {
  const raw = await readFile(path.join(__dirname, 'language-backends.json'), 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.backends || [];
}

async function loadHelperCatalog() {
  const raw = await readFile(path.join(__dirname, 'helper-wasm-library.json'), 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.helpers || [];
}

function selectWasmHelpers(nodeBuiltinsUsed, helperCatalog) {
  const neededCaps = new Set();
  const builtins = new Set(nodeBuiltinsUsed);
  if (builtins.has('child_process') || builtins.has('worker_threads')) {
    neededCaps.add('spawn');
    neededCaps.add('fork');
    neededCaps.add('waitpid');
  }
  if (builtins.has('fs')) {
    neededCaps.add('mmap');
    neededCaps.add('munmap');
  }
  if (builtins.has('net') || builtins.has('tls') || builtins.has('http2')) {
    neededCaps.add('socket');
    neededCaps.add('connect');
    neededCaps.add('poll');
  }

  return helperCatalog
    .filter((helper) => helper.capabilities?.some((cap) => neededCaps.has(cap)))
    .map((helper) => ({
      id: helper.id,
      capabilities: helper.capabilities,
      modulePath: helper.modulePath,
      description: helper.description,
    }));
}

function detectLanguageCandidates(analysis, backendConfig, sourceDir) {
  const extHistogram = analysis.extensionHistogram || {};
  const candidates = [];
  for (const backend of backendConfig) {
    const extHit = (backend.extensions || []).some((ext) => (extHistogram[ext] || 0) > 0);
    const probeHit = (backend.probeFiles || []).some((file) => existsSync(path.join(sourceDir, file)));
    if (!extHit && !probeHit) continue;
    candidates.push({
      language: backend.language,
      compileCommands: backend.compileCommands || [],
      environment: backend.environment || {},
      notes: backend.notes || '',
      score: (extHit ? 1 : 0) + (probeHit ? 1 : 0),
    });
  }
  return candidates.sort((a, b) => b.score - a.score);
}

export class ParsecEngine {
  constructor(options = {}) {
    this.stageRoot = options.stageRoot || DEFAULT_STAGE_ROOT;
    this.llmAdvisor = options.llmAdvisor || (async () => []);
    this.tasks = new Map();
  }

  async run(inputSpec, options = {}) {
    if (!inputSpec || typeof inputSpec !== 'object') {
      throw new Error('inputSpec is required and must be an object');
    }

    const jobId = inputSpec.jobId || randomUUID();
    const jobRoot = path.join(this.stageRoot, jobId);
    const sourceDir = path.join(jobRoot, 'source');
    const outputDir = options.outputDir || path.join(jobRoot, 'output');
    const manifestsDir = path.join(jobRoot, 'manifests');
    await ensureDir(sourceDir);
    await ensureDir(outputDir);
    await ensureDir(manifestsDir);

    await this.#ingestInput(inputSpec, sourceDir);

    const analysis = await analyzeSourceTree(sourceDir);
    const entryPath = await detectEntryPoint(sourceDir, inputSpec.entry);
    if (!entryPath) {
      throw new Error('No JS/TS entry point found during stage 1 preparation.');
    }

    const bundleResult = await buildOptimizedBlob(entryPath, outputDir, analysis.nodeBuiltinsUsed || []);
    const stage1Result = {
      sourceDir,
      entryPath,
      analysis,
      bundle: bundleResult,
    };

    const metadata = {
      jobId,
      inputType: inputSpec.type,
      stage1: stage1Result,
      stage2: null,
    };
    await writeFile(path.join(manifestsDir, 'stage1.json'), `${JSON.stringify(stage1Result, null, 2)}\n`, 'utf8');

    if (inputSpec.type === 'github') {
      const stage2Task = await this.startWasmLiftTask({
        jobId,
        sourceDir,
        analysis,
        outputDir,
      });
      metadata.stage2 = { taskId: stage2Task.id, status: stage2Task.status };
      if (options.waitForStage2) {
        const completed = await this.awaitTask(stage2Task.id, options.stage2TimeoutMs || 300_000);
        metadata.stage2 = completed;
      }
    }

    await writeFile(path.join(manifestsDir, 'parsec-job.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
    return metadata;
  }

  async #ingestInput(inputSpec, sourceDir) {
    const { type, input } = inputSpec;
    if (type === 'raw-js') {
      await copyRawInputToDir(input, sourceDir);
      return;
    }
    if (type === 'zip') {
      await unpackZipInput(path.resolve(String(input)), sourceDir);
      return;
    }
    if (type === 'npm') {
      await ingestNpmPackage(String(input), sourceDir);
      return;
    }
    if (type === 'github') {
      await ingestGithubInput(input, sourceDir);
      return;
    }
    throw new Error(`Unsupported input type: ${type}`);
  }

  async startWasmLiftTask({ jobId, sourceDir, analysis, outputDir }) {
    const taskId = `lift-${jobId}`;
    const task = {
      id: taskId,
      jobId,
      status: 'running',
      startedAt: new Date().toISOString(),
      result: null,
      error: null,
    };
    this.tasks.set(taskId, task);

    const run = async () => {
      const backendConfig = await loadBackendConfig();
      const helperCatalog = await loadHelperCatalog();
      const candidates = detectLanguageCandidates(analysis, backendConfig, sourceDir);
      const helperWasm = selectWasmHelpers(analysis.nodeBuiltinsUsed || [], helperCatalog);
      const llmAdvice = await this.llmAdvisor({
        sourceDir,
        analysis,
        candidates,
        helperWasm,
      });

      const attempts = [];
      for (const candidate of candidates) {
        const compilePlan = [];
        for (const command of candidate.compileCommands || []) {
          const [bin, ...args] = command;
          const env = { ...process.env, ...(candidate.environment || {}) };
          const startedAt = Date.now();
          try {
            const { stdout, stderr } = await execFile(bin, args, {
              cwd: sourceDir,
              env,
              timeout: 120_000,
              maxBuffer: 4 * 1024 * 1024,
            });
            compilePlan.push({
              command: [bin, ...args].join(' '),
              ok: true,
              durationMs: Date.now() - startedAt,
              stdout: String(stdout || '').slice(0, 5000),
              stderr: String(stderr || '').slice(0, 5000),
            });
            break;
          } catch (error) {
            compilePlan.push({
              command: [bin, ...args].join(' '),
              ok: false,
              durationMs: Date.now() - startedAt,
              error: error.message,
              stdout: String(error.stdout || '').slice(0, 5000),
              stderr: String(error.stderr || '').slice(0, 5000),
            });
          }
        }
        attempts.push({
          language: candidate.language,
          notes: candidate.notes,
          commands: compilePlan,
        });
      }

      task.result = {
        candidates,
        helperWasm,
        llmAdvice,
        compileAttempts: attempts,
        outputDir,
      };
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
    };

    run().catch((error) => {
      task.status = 'failed';
      task.error = error.message || String(error);
      task.completedAt = new Date().toISOString();
    });

    return task;
  }

  getTask(taskId) {
    return this.tasks.get(taskId) || null;
  }

  async awaitTask(taskId, timeoutMs = 300_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const task = this.getTask(taskId);
      if (!task) throw new Error(`Unknown task id: ${taskId}`);
      if (task.status === 'completed' || task.status === 'failed') return task;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for task ${taskId}`);
  }
}

export function createParsecEngine(options) {
  return new ParsecEngine(options);
}

