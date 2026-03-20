import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { unzipSync } from 'fflate';
import esbuild from 'esbuild';
import { NODE_API_SURFACE_EXPORTS, NODE_API_SURFACE_MODULES } from '../../napi-bridge/node-api-surface.generated.js';

const execFile = promisify(_execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

const IGNORED_DIRS = new Set(['.git', '.hg', '.svn', 'node_modules', 'dist', 'build', 'target', '.next']);
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const DEFAULT_STAGE_ROOT = path.join(os.tmpdir(), 'parsec-engine-jobs');
const NODE_BUILTIN_SET = new Set(NODE_API_SURFACE_MODULES);
const EASY_HARD_REWRITE_PROFILE = {
  name: 'easy-hard',
  normalizeBuiltinSpecifiers: true,
  stripShebang: true,
  rewriteProcessBrowser: true,
  pruneProblematicBuiltins: false,
  virtualizeNetworkLayer: false,
};
const BACKEND_TARGETS = new Set(['edgejs-browser', 'wali-edge-remote']);
const PACKAGE_STRATEGIES = new Set(['single', 'split']);
const DEFAULT_PROBLEMATIC_BUILTINS = [
  'child_process',
  'worker_threads',
  'cluster',
  'net',
  'tls',
  'dgram',
  'dns',
];
const DEFAULT_PROBLEMATIC_BUILTIN_SET = new Set(DEFAULT_PROBLEMATIC_BUILTINS);
const DEFAULT_NETWORK_BUILTINS = [
  'net',
  'tls',
  'dns',
  'dgram',
  'http',
  'https',
  'http2',
];
const DEFAULT_NETWORK_BUILTIN_SET = new Set(DEFAULT_NETWORK_BUILTINS);
const HARD_HARD_SIGNAL_PATTERNS = [
  { id: 'directEval', regex: /\beval\s*\(/g },
  { id: 'newFunction', regex: /\bnew\s+Function\s*\(/g },
  { id: 'dynamicRequire', regex: /\brequire\(\s*(?!['"`])[^)]+\)/g },
];

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function sanitizeZipPath(entry) {
  const normalized = path.posix.normalize(entry);
  if (normalized.startsWith('../') || normalized === '..' || path.isAbsolute(normalized)) return null;
  return normalized;
}

function normalizeBuiltinSpecifier(specifier) {
  const clean = specifier.startsWith('node:') ? specifier.slice(5) : specifier;
  if (!NODE_BUILTIN_SET.has(clean)) return specifier;
  return `node:${clean}`;
}

function canonicalizeBuiltinSpecifier(specifier) {
  return specifier.startsWith('node:') ? specifier.slice(5) : specifier;
}

function toProblematicVirtualSpecifier(moduleName) {
  return `@parsec/problematic/${encodeURIComponent(moduleName)}`;
}

function fromProblematicVirtualSpecifier(specifier) {
  if (!specifier.startsWith('@parsec/problematic/')) return null;
  return decodeURIComponent(specifier.slice('@parsec/problematic/'.length));
}

function toSharedNetworkVirtualSpecifier(moduleName) {
  return `@parsec/network/${encodeURIComponent(moduleName)}`;
}

function fromSharedNetworkVirtualSpecifier(specifier) {
  if (!specifier.startsWith('@parsec/network/')) return null;
  return decodeURIComponent(specifier.slice('@parsec/network/'.length));
}

function resolveBuildOutputPath(filePath, outDir) {
  if (!filePath) return null;
  if (path.isAbsolute(filePath)) return filePath;
  const fromOutDir = path.join(outDir, filePath);
  if (existsSync(fromOutDir)) return fromOutDir;
  return path.resolve(filePath);
}

function applySpecifierRewrite(source, regex, operationName, operations, profile) {
  return source.replace(regex, (full, prefix, specifier, suffix) => {
    if (!profile.normalizeBuiltinSpecifiers) return full;
    const normalized = normalizeBuiltinSpecifier(specifier);
    if (normalized === specifier) return full;
    operations.push({
      op: operationName,
      from: specifier,
      to: normalized,
    });
    return `${prefix}${normalized}${suffix}`;
  });
}

function applyProblematicBuiltinRewrite(source, regex, operationName, operations, profile) {
  if (!profile.pruneProblematicBuiltins || !profile.problematicBuiltins) return source;
  return source.replace(regex, (full, prefix, specifier, suffix) => {
    const canonical = canonicalizeBuiltinSpecifier(specifier);
    if (!profile.problematicBuiltins.has(canonical)) return full;
    const target = toProblematicVirtualSpecifier(canonical);
    operations.push({
      op: operationName,
      from: specifier,
      to: target,
      builtin: canonical,
      reason: 'problematic-builtin-pruned',
    });
    return `${prefix}${target}${suffix}`;
  });
}

function applySharedNetworkRewrite(source, regex, operationName, operations, profile) {
  if (!profile.virtualizeNetworkLayer || !profile.networkBuiltins) return source;
  return source.replace(regex, (full, prefix, specifier, suffix) => {
    const canonical = canonicalizeBuiltinSpecifier(specifier);
    if (!profile.networkBuiltins.has(canonical)) return full;
    const target = toSharedNetworkVirtualSpecifier(canonical);
    operations.push({
      op: operationName,
      from: specifier,
      to: target,
      builtin: canonical,
      reason: 'network-layer-virtualized',
    });
    return `${prefix}${target}${suffix}`;
  });
}

function rewriteJavaScriptSource(source, relativePath, profile = EASY_HARD_REWRITE_PROFILE) {
  let rewritten = source;
  const operations = [];

  if (profile.stripShebang && rewritten.startsWith('#!')) {
    const firstLineEnd = rewritten.indexOf('\n');
    rewritten = firstLineEnd >= 0 ? rewritten.slice(firstLineEnd + 1) : '';
    operations.push({ op: 'strip-shebang' });
  }

  rewritten = applySpecifierRewrite(
    rewritten,
    /(\bimport\s+(?:[^'"`]*?\s+from\s*)?['"])([^'"]+)(['"])/g,
    'rewrite-import-specifier',
    operations,
    profile,
  );
  rewritten = applySpecifierRewrite(
    rewritten,
    /(\bexport\s+(?:\*|\{[^}]*\})\s+from\s*['"])([^'"]+)(['"])/g,
    'rewrite-export-specifier',
    operations,
    profile,
  );
  rewritten = applySpecifierRewrite(
    rewritten,
    /(\bimport\(\s*['"])([^'"]+)(['"]\s*\))/g,
    'rewrite-dynamic-import-specifier',
    operations,
    profile,
  );
  rewritten = applySpecifierRewrite(
    rewritten,
    /(\brequire\(\s*['"])([^'"]+)(['"]\s*\))/g,
    'rewrite-require-specifier',
    operations,
    profile,
  );
  rewritten = applyProblematicBuiltinRewrite(
    rewritten,
    /(\bimport\s+(?:[^'"`]*?\s+from\s*)?['"])([^'"]+)(['"])/g,
    'rewrite-problematic-builtin',
    operations,
    profile,
  );
  rewritten = applyProblematicBuiltinRewrite(
    rewritten,
    /(\bexport\s+(?:\*|\{[^}]*\})\s+from\s*['"])([^'"]+)(['"])/g,
    'rewrite-problematic-builtin',
    operations,
    profile,
  );
  rewritten = applyProblematicBuiltinRewrite(
    rewritten,
    /(\bimport\(\s*['"])([^'"]+)(['"]\s*\))/g,
    'rewrite-problematic-builtin',
    operations,
    profile,
  );
  rewritten = applyProblematicBuiltinRewrite(
    rewritten,
    /(\brequire\(\s*['"])([^'"]+)(['"]\s*\))/g,
    'rewrite-problematic-builtin',
    operations,
    profile,
  );
  rewritten = applySharedNetworkRewrite(
    rewritten,
    /(\bimport\s+(?:[^'"`]*?\s+from\s*)?['"])([^'"]+)(['"])/g,
    'rewrite-shared-network-builtin',
    operations,
    profile,
  );
  rewritten = applySharedNetworkRewrite(
    rewritten,
    /(\bexport\s+(?:\*|\{[^}]*\})\s+from\s*['"])([^'"]+)(['"])/g,
    'rewrite-shared-network-builtin',
    operations,
    profile,
  );
  rewritten = applySharedNetworkRewrite(
    rewritten,
    /(\bimport\(\s*['"])([^'"]+)(['"]\s*\))/g,
    'rewrite-shared-network-builtin',
    operations,
    profile,
  );
  rewritten = applySharedNetworkRewrite(
    rewritten,
    /(\brequire\(\s*['"])([^'"]+)(['"]\s*\))/g,
    'rewrite-shared-network-builtin',
    operations,
    profile,
  );

  if (profile.rewriteProcessBrowser && /\bprocess\.browser\b/.test(rewritten)) {
    rewritten = rewritten.replace(/\bprocess\.browser\b/g, 'true');
    operations.push({ op: 'rewrite-process-browser' });
  }

  return {
    code: rewritten,
    changed: rewritten !== source,
    operations,
    file: relativePath,
  };
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

async function detectWasmEntry(sourceDir, preferredEntry) {
  if (preferredEntry) {
    const absolute = path.isAbsolute(preferredEntry) ? preferredEntry : path.join(sourceDir, preferredEntry);
    if (existsSync(absolute) && path.extname(absolute).toLowerCase() === '.wasm') {
      return absolute;
    }
  }

  const allFiles = await listFilesRecursive(sourceDir);
  const wasmCandidates = allFiles
    .filter((fullPath) => path.extname(fullPath).toLowerCase() === '.wasm')
    .sort();
  if (wasmCandidates.length === 0) return null;
  return wasmCandidates[0];
}

async function validateWasmArtifact(wasmPath) {
  const bytes = await readFile(wasmPath);
  let compiled;
  try {
    compiled = await WebAssembly.compile(bytes);
  } catch (error) {
    throw new Error(`Invalid wasm module at ${wasmPath}: ${error.message}`);
  }
  const imports = WebAssembly.Module.imports(compiled).map((entry) => ({
    module: entry.module,
    name: entry.name,
    kind: entry.kind,
  }));
  const exports = WebAssembly.Module.exports(compiled).map((entry) => ({
    name: entry.name,
    kind: entry.kind,
  }));
  return {
    valid: true,
    bytes: bytes.byteLength,
    imports,
    exports,
  };
}

async function analyzeSourceTree(sourceDir) {
  const files = await listFilesRecursive(sourceDir);
  const extensions = {};
  const imports = new Set();
  const nativeAddonSignals = new Set();
  const hardHardSignals = {};

  for (const signal of HARD_HARD_SIGNAL_PATTERNS) {
    hardHardSignals[signal.id] = { count: 0, files: [] };
  }

  function recordHardHardSignal(signalId, fullPath, matchCount) {
    if (!hardHardSignals[signalId]) return;
    hardHardSignals[signalId].count += matchCount;
    const relPath = toPosix(path.relative(sourceDir, fullPath));
    if (!hardHardSignals[signalId].files.includes(relPath)) {
      hardHardSignals[signalId].files.push(relPath);
    }
  }

  for (const fullPath of files) {
    const ext = path.extname(fullPath).toLowerCase();
    extensions[ext] = (extensions[ext] || 0) + 1;
    const base = path.basename(fullPath);
    if (base === 'binding.gyp' || base === 'Cargo.toml' || base === 'CMakeLists.txt' ||
        base === 'Makefile' || base.endsWith('.node')) {
      nativeAddonSignals.add(base);
    }

    if (!JS_EXTENSIONS.has(ext)) continue;
    const source = await readFile(fullPath, 'utf8');
    for (const specifier of parseImportsFromSource(source)) imports.add(specifier);

    for (const signal of HARD_HARD_SIGNAL_PATTERNS) {
      const matches = source.match(signal.regex);
      if (!matches || matches.length === 0) continue;
      recordHardHardSignal(signal.id, fullPath, matches.length);
    }
  }

  const nodeBuiltinsUsed = [...imports]
    .map((specifier) => specifier.startsWith('node:') ? specifier.slice(5) : specifier)
    .filter((specifier) => NODE_API_SURFACE_MODULES.includes(specifier))
    .sort();
  const networkBuiltinsUsed = nodeBuiltinsUsed
    .filter((specifier) => DEFAULT_NETWORK_BUILTIN_SET.has(specifier))
    .sort();
  const problematicNodeBuiltinsUsed = nodeBuiltinsUsed
    .filter((specifier) => DEFAULT_PROBLEMATIC_BUILTIN_SET.has(specifier))
    .sort();
  const externalPackagesUsed = [...imports]
    .filter((specifier) => !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:'))
    .sort();
  const blockers = [];
  if (hardHardSignals.directEval.count > 0) blockers.push('direct-eval');
  if (hardHardSignals.newFunction.count > 0) blockers.push('new-function');
  if (hardHardSignals.dynamicRequire.count > 0) blockers.push('dynamic-require');
  if (nativeAddonSignals.size > 0) blockers.push('native-addons');
  if (problematicNodeBuiltinsUsed.length > 0) blockers.push('problematic-node-builtins');
  const readinessPenalty = Math.min(30, hardHardSignals.directEval.count * 10)
    + Math.min(20, hardHardSignals.newFunction.count * 10)
    + Math.min(24, hardHardSignals.dynamicRequire.count * 8)
    + Math.min(40, nativeAddonSignals.size * 20)
    + Math.min(28, problematicNodeBuiltinsUsed.length * 7);
  const easyHardReadiness = {
    ready: blockers.length === 0,
    score: Math.max(0, 100 - readinessPenalty),
    blockers,
  };
  const backendPlan = {
    edgejsBrowser: {
      recommended: problematicNodeBuiltinsUsed.length === 0,
      notes: problematicNodeBuiltinsUsed.length
        ? 'Enable pruneProblematicBuiltins or target wali-edge-remote.'
        : 'Direct browser EdgeJS execution is a good fit.',
    },
    waliEdgeRemote: {
      recommended: problematicNodeBuiltinsUsed.length > 0 || nativeAddonSignals.size > 0,
      notes: 'Remote backend can preserve process/native-heavy Node semantics.',
    },
  };

  return {
    fileCount: files.length,
    extensionHistogram: extensions,
    nodeBuiltinsUsed,
    networkBuiltinsUsed,
    problematicNodeBuiltinsUsed,
    externalPackagesUsed,
    nativeAddonSignals: [...nativeAddonSignals].sort(),
    hardHardSignals,
    easyHardReadiness,
    backendPlan,
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

async function ingestWasmInput(input, targetDir) {
  if (typeof input !== 'string') {
    throw new Error('wasm input must be a file path or directory path');
  }

  const fullPath = path.resolve(input);
  const info = await stat(fullPath);
  if (info.isDirectory()) {
    await cp(fullPath, targetDir, { recursive: true });
    return;
  }
  if (path.extname(fullPath).toLowerCase() !== '.wasm') {
    throw new Error(`wasm input must point to a .wasm file, got: ${fullPath}`);
  }
  await cp(fullPath, path.join(targetDir, path.basename(fullPath)));
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

async function rewriteSourceTree(sourceDir, preparedDir, profile = EASY_HARD_REWRITE_PROFILE) {
  await ensureDir(preparedDir);
  const files = await listFilesRecursive(sourceDir);
  const changedFiles = [];
  const opHistogram = {};
  const problematicBuiltinsRewritten = new Set();
  const networkBuiltinsRewritten = new Set();
  let jsFileCount = 0;

  for (const fullPath of files) {
    const relPath = path.relative(sourceDir, fullPath);
    const outputPath = path.join(preparedDir, relPath);
    await ensureDir(path.dirname(outputPath));

    const ext = path.extname(fullPath).toLowerCase();
    if (!JS_EXTENSIONS.has(ext)) {
      await cp(fullPath, outputPath);
      continue;
    }

    jsFileCount++;
    const source = await readFile(fullPath, 'utf8');
    const rewriteResult = rewriteJavaScriptSource(source, toPosix(relPath), profile);
    await writeFile(outputPath, rewriteResult.code, 'utf8');

    if (rewriteResult.changed) {
      changedFiles.push({
        file: rewriteResult.file,
        operations: rewriteResult.operations,
      });
      for (const operation of rewriteResult.operations) {
        opHistogram[operation.op] = (opHistogram[operation.op] || 0) + 1;
        if (operation.op === 'rewrite-problematic-builtin' && operation.builtin) {
          problematicBuiltinsRewritten.add(operation.builtin);
        }
        if (operation.op === 'rewrite-shared-network-builtin' && operation.builtin) {
          networkBuiltinsRewritten.add(operation.builtin);
        }
      }
    }
  }

  return {
    profile: profile.name || 'custom',
    totalFiles: files.length,
    jsFileCount,
    changedFileCount: changedFiles.length,
    changedFiles,
    operationHistogram: opHistogram,
    problematicBuiltinsRewritten: [...problematicBuiltinsRewritten].sort(),
    networkBuiltinsRewritten: [...networkBuiltinsRewritten].sort(),
  };
}

function getBundleBanner() {
  return [
    "import process from 'node:process';",
    "import { Buffer } from 'node:buffer';",
    'globalThis.global ??= globalThis;',
    'globalThis.process ??= process;',
    'globalThis.Buffer ??= Buffer;',
  ].join('\n');
}

function createProblematicBuiltinPlugin({ backendTarget, problematicBuiltinModules }) {
  const problematicSet = new Set(problematicBuiltinModules || []);
  if (problematicSet.size === 0) return null;

  return {
    name: 'parsec-problematic-builtins',
    setup(build) {
      build.onResolve({ filter: /^@parsec\/problematic\// }, (args) => {
        const moduleName = fromProblematicVirtualSpecifier(args.path);
        if (!moduleName) return null;
        return {
          path: moduleName,
          namespace: 'parsec-problematic',
        };
      });

      build.onLoad({ filter: /.*/, namespace: 'parsec-problematic' }, (args) => {
        if (!problematicSet.has(args.path)) return null;
        const available = (NODE_API_SURFACE_EXPORTS[args.path] || [])
          .filter((name) => name !== 'default' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name));
        const lines = [
          `const __parsecModuleName = ${JSON.stringify(args.path)};`,
          `const __parsecBackendTarget = ${JSON.stringify(backendTarget)};`,
          'function __parsecPrunedBuiltin(..._args) {',
          "  const err = new Error(`Parsec pruned builtin ${__parsecModuleName} for backend ${__parsecBackendTarget}.`);",
          "  err.code = 'ERR_PARSEC_PRUNED_BUILTIN';",
          '  throw err;',
          '}',
          'const __defaultProxy = new Proxy({}, {',
          '  get() { return __parsecPrunedBuiltin; },',
          '});',
          ...available.map((name) => `export const ${name} = __parsecPrunedBuiltin;`),
          'export default __defaultProxy;',
          '',
        ];
        return { contents: lines.join('\n'), loader: 'js' };
      });
    },
  };
}

function createSharedNetworkPlugin({ backendTarget, sharedNetworkModules }) {
  const sharedSet = new Set(sharedNetworkModules || []);
  if (sharedSet.size === 0) return null;

  return {
    name: 'parsec-shared-network-layer',
    setup(build) {
      build.onResolve({ filter: /^@parsec\/network\// }, (args) => {
        const moduleName = fromSharedNetworkVirtualSpecifier(args.path);
        if (!moduleName) return null;
        return {
          path: moduleName,
          namespace: 'parsec-shared-network',
        };
      });

      build.onLoad({ filter: /.*/, namespace: 'parsec-shared-network' }, (args) => {
        if (!sharedSet.has(args.path)) return null;
        const available = (NODE_API_SURFACE_EXPORTS[args.path] || [])
          .filter((name) => name !== 'default' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name));
        const lines = [
          `const __parsecModuleName = ${JSON.stringify(args.path)};`,
          `const __parsecBackendTarget = ${JSON.stringify(backendTarget)};`,
          'function __parsecResolveSharedLayer() {',
          '  return globalThis.__PARSEC_SHARED_NETWORK__ || null;',
          '}',
          'function __parsecResolveModuleApi() {',
          '  const layer = __parsecResolveSharedLayer();',
          '  if (!layer) {',
          "    const err = new Error(`Shared network layer is not installed for ${__parsecModuleName}.`);",
          "    err.code = 'ERR_PARSEC_NETWORK_LAYER_UNAVAILABLE';",
          '    throw err;',
          '  }',
          "  if (typeof layer.resolveBuiltin === 'function') {",
          '    const resolved = layer.resolveBuiltin(__parsecModuleName);',
          '    if (resolved) return resolved;',
          '  }',
          '  const byBuiltins = layer.builtins?.[__parsecModuleName];',
          '  if (byBuiltins) return byBuiltins;',
          "  const err = new Error(`Shared network layer does not provide ${__parsecModuleName}.`);",
          "  err.code = 'ERR_PARSEC_NETWORK_BUILTIN_UNSUPPORTED';",
          '  throw err;',
          '}',
          'function __parsecResolveExport(name) {',
          '  const mod = __parsecResolveModuleApi();',
          '  if (name === "default") return mod;',
          '  if (name in mod) return mod[name];',
          "  const err = new Error(`Shared network layer export missing: ${__parsecModuleName}.${name}`);",
          "  err.code = 'ERR_PARSEC_NETWORK_EXPORT_UNSUPPORTED';",
          '  throw err;',
          '}',
          'function __parsecNamed(name) {',
          '  return (...args) => {',
          '    const value = __parsecResolveExport(name);',
          '    return typeof value === "function" ? value(...args) : value;',
          '  };',
          '}',
          ...available.map((name) => `export const ${name} = __parsecNamed(${JSON.stringify(name)});`),
          'const __defaultProxy = new Proxy({}, {',
          '  get(_target, prop) {',
          "    if (prop === '__esModule') return true;",
          "    if (prop === 'default') return __parsecResolveExport('default');",
          "    if (typeof prop !== 'string') return undefined;",
          '    const value = __parsecResolveExport(prop);',
          '    return value;',
          '  },',
          '});',
          'export default __defaultProxy;',
          '',
        ];
        return { contents: lines.join('\n'), loader: 'js' };
      });
    },
  };
}

async function writeSharedNetworkAdapter(outputDir, backendTarget, sharedNetworkModules) {
  const adapterFile = path.join(outputDir, 'parsec-shared-network-adapter.js');
  const requiredMethods = ['request', 'connect', 'lookup'];
  const lines = [
    '// Auto-generated by Parsec stage-1.',
    '// Shared networking contract + default builtin facades.',
    '',
    'export const PARSEC_NETWORK_CONTRACT_VERSION = 1;',
    `export const PARSEC_NETWORK_MODULES = ${JSON.stringify(sharedNetworkModules || [], null, 2)};`,
    `export const PARSEC_NETWORK_REQUIRED_METHODS = ${JSON.stringify(requiredMethods)};`,
    '',
    'function createEventEmitter() {',
    '  const listeners = new Map();',
    '  const api = {',
    '    on(event, fn) {',
    '      if (!listeners.has(event)) listeners.set(event, new Set());',
    '      listeners.get(event).add(fn);',
    '      return api;',
    '    },',
    '    once(event, fn) {',
    '      const wrapped = (...args) => { api.off(event, wrapped); fn(...args); };',
    '      wrapped.__listener = fn;',
    '      return api.on(event, wrapped);',
    '    },',
    '    off(event, fn) {',
    '      const set = listeners.get(event);',
    '      if (!set) return api;',
    '      for (const candidate of set) {',
    '        if (candidate === fn || candidate.__listener === fn) {',
    '          set.delete(candidate);',
    '        }',
    '      }',
    '      if (set.size === 0) listeners.delete(event);',
    '      return api;',
    '    },',
    '    emit(event, ...args) {',
    '      const set = listeners.get(event);',
    '      if (!set || set.size === 0) return false;',
    '      for (const fn of [...set]) fn(...args);',
    '      return true;',
    '    },',
    '    listeners(event) { return [...(listeners.get(event) || [])]; },',
    '  };',
    '  return api;',
    '}',
    '',
    'function normalizeError(error, code) {',
    '  if (error && typeof error === "object") {',
    '    if (!error.code && code) error.code = code;',
    '    return error;',
    '  }',
    '  const out = new Error(String(error || code || "Parsec shared network error"));',
    '  if (code) out.code = code;',
    '  return out;',
    '}',
    '',
    'function normalizeHeaders(headers) {',
    '  const out = {};',
    '  if (!headers) return out;',
    '  if (headers instanceof Headers) {',
    '    for (const [k, v] of headers.entries()) out[String(k).toLowerCase()] = v;',
    '    return out;',
    '  }',
    '  for (const [k, v] of Object.entries(headers)) out[String(k).toLowerCase()] = String(v);',
    '  return out;',
    '}',
    '',
    'function toUint8Array(value) {',
    '  if (!value) return new Uint8Array(0);',
    '  if (value instanceof Uint8Array) return value;',
    '  if (typeof value === "string") return new TextEncoder().encode(value);',
    '  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);',
    '  if (value instanceof ArrayBuffer) return new Uint8Array(value);',
    '  return new TextEncoder().encode(String(value));',
    '}',
    '',
    'async function readBodyToBytes(body) {',
    '  if (!body) return new Uint8Array(0);',
    '  if (body instanceof Uint8Array || typeof body === "string" || ArrayBuffer.isView(body) || body instanceof ArrayBuffer) {',
    '    return toUint8Array(body);',
    '  }',
    '  if (typeof body.arrayBuffer === "function") {',
    '    const ab = await body.arrayBuffer();',
    '    return new Uint8Array(ab);',
    '  }',
    '  return toUint8Array(body);',
    '}',
    '',
    'function buildIncomingMessage(responseLike) {',
    '  const emitter = createEventEmitter();',
    '  const response = {',
    '    ...emitter,',
    '    statusCode: Number(responseLike?.statusCode || responseLike?.status || 200),',
    '    statusMessage: responseLike?.statusMessage || "",',
    '    headers: normalizeHeaders(responseLike?.headers),',
    '    url: responseLike?.url || "",',
    '  };',
    '  queueMicrotask(async () => {',
    '    try {',
    '      const bodyBytes = await readBodyToBytes(responseLike?.body || responseLike?.data || null);',
    '      if (bodyBytes.byteLength > 0) response.emit("data", bodyBytes);',
    '      response.emit("end");',
    '    } catch (error) {',
    '      response.emit("error", normalizeError(error, "ERR_PARSEC_NETWORK_RESPONSE_BODY"));',
    '    }',
    '  });',
    '  return response;',
    '}',
    '',
    'function createClientRequest(layer, moduleName, input, options, callback) {',
    '  const emitter = createEventEmitter();',
    '  const state = { headers: {}, chunks: [], ended: false, aborted: false };',
    '  const request = {',
    '    ...emitter,',
    '    setHeader(name, value) { state.headers[String(name).toLowerCase()] = String(value); return request; },',
    '    getHeader(name) { return state.headers[String(name).toLowerCase()]; },',
    '    removeHeader(name) { delete state.headers[String(name).toLowerCase()]; return request; },',
    '    write(chunk) { if (!state.ended) state.chunks.push(toUint8Array(chunk)); return true; },',
    '    end(chunk) {',
    '      if (chunk !== undefined) request.write(chunk);',
    '      if (state.ended) return request;',
    '      state.ended = true;',
    '      queueMicrotask(async () => {',
    '        if (state.aborted) return;',
    '        try {',
    '          const body = state.chunks.length === 0',
    '            ? new Uint8Array(0)',
    '            : (state.chunks.length === 1',
    '              ? state.chunks[0]',
    '              : state.chunks.reduce((acc, cur) => {',
    '                const merged = new Uint8Array(acc.byteLength + cur.byteLength);',
    '                merged.set(acc, 0);',
    '                merged.set(cur, acc.byteLength);',
    '                return merged;',
    '              }, new Uint8Array(0)));',
    '          const responseLike = await layer.request({ moduleName, input, options: { ...(options || {}), headers: { ...(options?.headers || {}), ...state.headers } }, body });',
    '          const response = buildIncomingMessage(responseLike);',
    '          if (typeof callback === "function") callback(response);',
    '          request.emit("response", response);',
    '        } catch (error) {',
    '          request.emit("error", normalizeError(error, "ERR_PARSEC_NETWORK_REQUEST_FAILED"));',
    '        }',
    '      });',
    '      return request;',
    '    },',
    '    abort() { state.aborted = true; request.emit("close"); return request; },',
    '    destroy(error) { state.aborted = true; if (error) request.emit("error", error); request.emit("close"); return request; },',
    '  };',
    '  return request;',
    '}',
    '',
    'function createSocket(layer, moduleName, options, onConnect) {',
    '  const emitter = createEventEmitter();',
    '  const socket = {',
    '    ...emitter,',
    '    writable: true,',
    '    readable: true,',
    '    connect(connectOptions, cb) {',
    '      const finalOptions = connectOptions || options || {};',
    '      queueMicrotask(async () => {',
    '        try {',
    '          await layer.connect({ moduleName, options: finalOptions });',
    '          if (typeof onConnect === "function") onConnect();',
    '          if (typeof cb === "function") cb();',
    '          socket.emit("connect");',
    '        } catch (error) {',
    '          socket.emit("error", normalizeError(error, "ERR_PARSEC_NETWORK_CONNECT_UNSUPPORTED"));',
    '        }',
    '      });',
    '      return socket;',
    '    },',
    '    write(_chunk, cb) { if (typeof cb === "function") cb(); return true; },',
    '    end(_chunk, cb) { if (typeof cb === "function") cb(); socket.emit("end"); return socket; },',
    '    destroy(error) { if (error) socket.emit("error", error); socket.emit("close"); return socket; },',
    '    setTimeout() { return socket; },',
    '    setNoDelay() { return socket; },',
    '    setKeepAlive() { return socket; },',
    '    unref() { return socket; },',
    '    ref() { return socket; },',
    '  };',
    '  return socket;',
    '}',
    '',
    'async function defaultLookup(layer, hostname, options, callback) {',
    '  const normalized = typeof options === "function" ? {} : (options || {});',
    '  const cb = typeof options === "function" ? options : callback;',
    '  try {',
    '    const result = await layer.lookup({ hostname, options: normalized });',
    '    const family = Number(result?.family || normalized.family || 4);',
    '    const address = String(result?.address || "127.0.0.1");',
    '    if (cb) { queueMicrotask(() => cb(null, address, family)); return; }',
    '    return { address, family };',
    '  } catch (error) {',
    '    if (cb) { queueMicrotask(() => cb(normalizeError(error, "ERR_PARSEC_NETWORK_DNS_LOOKUP"))); return; }',
    '    throw normalizeError(error, "ERR_PARSEC_NETWORK_DNS_LOOKUP");',
    '  }',
    '}',
    '',
    'function createDefaultBuiltins(layer) {',
    '  const httpLike = (moduleName) => ({',
    '    request(input, options, callback) { return createClientRequest(layer, moduleName, input, options, callback); },',
    '    get(input, options, callback) { const req = createClientRequest(layer, moduleName, input, options, callback); req.end(); return req; },',
    '    Agent: class Agent {},',
    '    globalAgent: {},',
    '  });',
    '  const netLike = (moduleName) => ({',
    '    connect(options, cb) { return createSocket(layer, moduleName, options, cb).connect(options, cb); },',
    '    createConnection(options, cb) { return createSocket(layer, moduleName, options, cb).connect(options, cb); },',
    '    createServer() {',
    '      const emitter = createEventEmitter();',
    '      return {',
    '        ...emitter,',
    '        listen(_options, cb) { if (typeof cb === "function") queueMicrotask(cb); return this; },',
    '        close(cb) { if (typeof cb === "function") queueMicrotask(cb); this.emit("close"); return this; },',
    '      };',
    '    },',
    '    Socket: class Socket {',
    '      constructor() { Object.assign(this, createSocket(layer, moduleName, {}, null)); }',
    '    },',
    '  });',
    '  const dnsLike = {',
    '    lookup(hostname, options, callback) { return defaultLookup(layer, hostname, options, callback); },',
    '    resolve(hostname, _rrtype, callback) {',
    '      const cb = typeof _rrtype === "function" ? _rrtype : callback;',
    '      return defaultLookup(layer, hostname, {}, (err, address) => {',
    '        if (cb) cb(err, err ? undefined : [address]);',
    '      });',
    '    },',
    '    promises: {',
    '      lookup(hostname, options) { return defaultLookup(layer, hostname, options); },',
    '      async resolve(hostname) { const { address } = await defaultLookup(layer, hostname, {}); return [address]; },',
    '    },',
    '  };',
    '  return {',
    '    http: httpLike("http"),',
    '    https: httpLike("https"),',
    '    http2: httpLike("http2"),',
    '    net: netLike("net"),',
    '    tls: {',
    '      ...netLike("tls"),',
    '      connect(options, cb) { return createSocket(layer, "tls", options, cb).connect(options, cb); },',
    '    },',
    '    dns: dnsLike,',
    '    dgram: {',
    '      createSocket() {',
    '        const emitter = createEventEmitter();',
    '        return {',
    '          ...emitter,',
    '          bind(_opts, cb) { if (typeof cb === "function") queueMicrotask(cb); return this; },',
    '          send(_msg, _port, _host, cb) { if (typeof cb === "function") queueMicrotask(() => cb(null)); return this; },',
    '          close(cb) { if (typeof cb === "function") queueMicrotask(cb); this.emit("close"); return this; },',
    '        };',
    '      },',
    '    },',
    '  };',
    '}',
    '',
    'export function validateParsecSharedNetworkLayer(layer) {',
    "  if (!layer || typeof layer !== 'object') throw new TypeError('layer must be an object');",
    '  for (const method of PARSEC_NETWORK_REQUIRED_METHODS) {',
    '    if (typeof layer[method] !== "function") {',
    '      throw new TypeError(`shared network layer missing required method: ${method}`);',
    '    }',
    '  }',
    '}',
    '',
    'export function installParsecSharedNetworkLayer(layer) {',
    '  validateParsecSharedNetworkLayer(layer);',
    '  const defaults = createDefaultBuiltins(layer);',
    '  layer.contractVersion = PARSEC_NETWORK_CONTRACT_VERSION;',
    '  layer.builtins = { ...(defaults || {}), ...(layer.builtins || {}) };',
    '  if (typeof layer.resolveBuiltin !== "function") {',
    '    layer.resolveBuiltin = (name) => layer.builtins?.[name] || null;',
    '  }',
    '  globalThis.__PARSEC_SHARED_NETWORK__ = layer;',
    '  return layer;',
    '}',
    '',
    'export function getParsecSharedNetworkLayer() {',
    '  return globalThis.__PARSEC_SHARED_NETWORK__ || null;',
    '}',
    '',
    'export function createProxyBackedSharedNetworkLayer({',
    "  proxyUrl = 'https://cors.stare.network',",
    "  persistent = true,",
    '  domainPrefix = {},',
    '} = {}) {',
    '  const defaultDomainPrefix = {',
    "    'api.anthropic.com': '/anthropic',",
    "    'platform.claude.com': '/anthropic-platform',",
    "    'api.openai.com': '/openai',",
    "    'generativelanguage.googleapis.com': '/google',",
    '  };',
    '  const mergedDomainPrefix = { ...defaultDomainPrefix, ...(domainPrefix || {}) };',
    '  const session = {',
    '    id: `parsec-${Math.random().toString(36).slice(2)}`,',
    '    proxyUrl,',
    '    persistent,',
    '    backendTarget: ' + JSON.stringify(backendTarget) + ',',
    '    createdAt: Date.now(),',
    '  };',
    '  const layer = {',
    '    session,',
    '    builtins: {},',
    '    mapUrl(rawUrl) {',
    '      const url = new URL(String(rawUrl));',
    '      const prefix = mergedDomainPrefix[url.hostname];',
      '      if (!prefix) return url.toString();',
      '      return `${proxyUrl}${prefix}${url.pathname}${url.search}`;',
    '    },',
    '    async request({ moduleName, input, options = {}, body } = {}) {',
    '      let targetUrl = "";',
    '      if (typeof input === "string") {',
    '        targetUrl = input;',
    '      } else if (input && typeof input === "object" && input.href) {',
    '        targetUrl = input.href;',
    '      } else if (options && typeof options === "object" && options.href) {',
    '        targetUrl = options.href;',
    '      }',
    '      if (!targetUrl) {',
    '        const protocol = options.protocol || (moduleName === "https" ? "https:" : "http:");',
    '        const hostname = options.hostname || options.host || "localhost";',
    '        const port = options.port ? `:${options.port}` : "";',
    '        const pathName = options.path || "/";',
    '        targetUrl = `${protocol}//${hostname}${port}${pathName}`;',
    '      }',
    '      const mapped = this.mapUrl(targetUrl);',
    '      const method = String(options.method || "GET").toUpperCase();',
    '      const headers = normalizeHeaders(options.headers || {});',
    '      const shouldHaveBody = !["GET", "HEAD"].includes(method);',
    '      const fetchBody = shouldHaveBody ? (body && body.byteLength ? body : undefined) : undefined;',
    '      const response = await fetch(mapped, { method, headers, body: fetchBody });',
    '      const responseBody = await response.arrayBuffer();',
    '      return {',
    '        status: response.status,',
    '        statusCode: response.status,',
    '        statusMessage: response.statusText || "",',
    '        headers: normalizeHeaders(response.headers),',
    '        body: new Uint8Array(responseBody),',
    '        url: mapped,',
    '      };',
    '    },',
    '    async connect() {',
    '      const err = new Error("Raw socket connect is not available in proxy-backed browser mode.");',
    "      err.code = 'ERR_PARSEC_NETWORK_CONNECT_UNSUPPORTED';",
    '      throw err;',
    '    },',
    '    async lookup({ hostname, options = {} } = {}) {',
    '      const normalized = String(hostname || "localhost");',
    '      const family = Number(options.family || 4);',
    '      if (normalized === "localhost") {',
    "        return { address: family === 6 ? '::1' : '127.0.0.1', family };",
    '      }',
    '      return { address: normalized, family };',
    '    },',
    '    openPersistentSession() {',
    '      session.openedAt = Date.now();',
    '      session.open = true;',
    '      return session;',
    '    },',
    '    closePersistentSession() {',
    '      session.closedAt = Date.now();',
    '      session.open = false;',
    '    },',
    '  };',
    '  installParsecSharedNetworkLayer(layer);',
    '  if (persistent) layer.openPersistentSession();',
    '  return layer;',
    '}',
    '',
    'export default {',
    '  PARSEC_NETWORK_CONTRACT_VERSION,',
    '  PARSEC_NETWORK_MODULES,',
    '  PARSEC_NETWORK_REQUIRED_METHODS,',
    '  validateParsecSharedNetworkLayer,',
    '  installParsecSharedNetworkLayer,',
    '  getParsecSharedNetworkLayer,',
    '  createProxyBackedSharedNetworkLayer,',
    '};',
    '',
  ];
  await writeFile(adapterFile, `${lines.join('\n')}\n`, 'utf8');
  return adapterFile;
}

async function writeSharedNetworkBootstrap(outputDir, adapterFile, backendTarget) {
  const bootstrapFile = path.join(outputDir, 'parsec-loader-bootstrap.js');
  const relativeAdapter = `./${toPosix(path.relative(outputDir, adapterFile))}`;
  const lines = [
    '// Auto-generated by Parsec stage-1.',
    `import { createProxyBackedSharedNetworkLayer, getParsecSharedNetworkLayer, installParsecSharedNetworkLayer } from ${JSON.stringify(relativeAdapter)};`,
    '',
    'const SHARED_NETWORK_SINGLETON_KEY = "__PARSEC_SHARED_NETWORK_SINGLETON__";',
    '',
    'export function ensurePersistentParsecSharedNetworkLayer(options = {}) {',
    '  const existing = getParsecSharedNetworkLayer();',
    '  if (existing) return existing;',
    '  if (globalThis[SHARED_NETWORK_SINGLETON_KEY]) {',
    '    return installParsecSharedNetworkLayer(globalThis[SHARED_NETWORK_SINGLETON_KEY]);',
    '  }',
    `  const layer = createProxyBackedSharedNetworkLayer({ backendTarget: ${JSON.stringify(backendTarget)}, ...options });`,
    '  if (typeof layer.openPersistentSession === "function") {',
    '    layer.openPersistentSession();',
    '  }',
    '  globalThis[SHARED_NETWORK_SINGLETON_KEY] = layer;',
    '  installParsecSharedNetworkLayer(layer);',
    '  return layer;',
    '}',
    '',
    'export async function bootstrapParsecLoadPlan(loadPlan, options = {}) {',
    '  ensurePersistentParsecSharedNetworkLayer(options.network || {});',
    '  const entryOverride = options.entryUrl || options.bundleUrl || null;',
    '  if (loadPlan?.load?.type === "esm") {',
    '    const target = entryOverride || loadPlan?.bundle?.file;',
    '    if (!target) throw new Error("No ESM bundle target provided for bootstrapParsecLoadPlan.");',
    '    return import(target);',
    '  }',
    '  if (loadPlan?.load?.type === "wasm") {',
    '    const target = entryOverride || loadPlan?.load?.wasmPath || loadPlan?.bundle?.file;',
    '    if (!target) throw new Error("No wasm target provided for bootstrapParsecLoadPlan.");',
    '    return WebAssembly.instantiateStreaming(fetch(target), options.wasmImports || {});',
    '  }',
    '  throw new Error(`Unsupported load plan type: ${loadPlan?.load?.type}`);',
    '}',
    '',
    'export default {',
    '  ensurePersistentParsecSharedNetworkLayer,',
    '  bootstrapParsecLoadPlan,',
    '};',
    '',
  ];
  await writeFile(bootstrapFile, `${lines.join('\n')}\n`, 'utf8');
  return bootstrapFile;
}

async function buildOptimizedBlob(entryPath, outDir, nodeBuiltinsUsed, options = {}) {
  const packageStrategy = options.packageStrategy || 'single';
  const backendTarget = options.backendTarget || 'edgejs-browser';
  const problematicBuiltinModules = options.problematicBuiltinModules || [];
  const sharedNetworkModules = options.sharedNetworkModules || [];

  await ensureDir(outDir);
  const outFile = path.join(outDir, 'app.optimized.js');
  const splitOutDir = path.join(outDir, 'bundle');
  const problematicPlugin = createProblematicBuiltinPlugin({ backendTarget, problematicBuiltinModules });
  const sharedNetworkPlugin = createSharedNetworkPlugin({ backendTarget, sharedNetworkModules });
  const plugins = [problematicPlugin, sharedNetworkPlugin].filter(Boolean);
  const sharedOptions = {
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    minify: true,
    minifyWhitespace: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    sourcemap: 'external',
    target: ['es2020'],
    platform: 'browser',
    external: nodeBuiltinsUsed.flatMap((name) => [name, `node:${name}`]),
    banner: { js: getBundleBanner() },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env.BROWSER': 'true',
      __PARSEC_RUNTIME__: 'true',
      __PARSEC_BACKEND_TARGET__: JSON.stringify(backendTarget),
    },
    mainFields: ['browser', 'module', 'main'],
    conditions: ['browser', 'module'],
    logLevel: 'silent',
    metafile: true,
    legalComments: 'none',
    treeShaking: true,
    keepNames: false,
    write: true,
    plugins,
  };
  const buildOptions = packageStrategy === 'split'
    ? {
      ...sharedOptions,
      outdir: splitOutDir,
      splitting: true,
      entryNames: 'entry-[name]-[hash]',
      chunkNames: 'chunk-[name]-[hash]',
      assetNames: 'asset-[name]-[hash]',
    }
    : {
      ...sharedOptions,
      outfile: outFile,
      splitting: false,
    };
  const result = await esbuild.build(buildOptions);
  const outputEntries = Object.entries(result.metafile?.outputs || {});
  const outputFiles = outputEntries
    .map(([filePath]) => resolveBuildOutputPath(filePath, outDir))
    .filter(Boolean)
    .sort();
  const outputStats = outputEntries.find(([filePath]) =>
    resolveBuildOutputPath(filePath, outDir) === outFile)?.[1] || null;
  const splitEntry = packageStrategy === 'split'
    ? (outputEntries.find(([, metadata]) => metadata?.entryPoint)?.[0] || null)
    : null;
  const entryOutputPath = packageStrategy === 'split'
    ? (resolveBuildOutputPath(splitEntry, outDir) || outputFiles[0] || null)
    : outFile;
  const entryMapPath = entryOutputPath ? `${entryOutputPath}.map` : null;
  const chunkFiles = outputEntries
    .map(([filePath, metadata]) => ({ filePath, metadata }))
    .filter(({ filePath, metadata }) => filePath.endsWith('.js') && !metadata?.entryPoint)
    .map(({ filePath }) => resolveBuildOutputPath(filePath, outDir))
    .filter(Boolean)
    .sort();

  return {
    outputFile: entryOutputPath,
    outputMapFile: entryMapPath,
    outputDir: packageStrategy === 'split' ? splitOutDir : outDir,
    packageStrategy,
    outputFiles,
    chunkFiles,
    metafile: result.metafile || null,
    bytes: outputStats?.bytes
      || (entryOutputPath
        ? (outputEntries.find(([filePath]) =>
          resolveBuildOutputPath(filePath, outDir) === entryOutputPath)?.[1]?.bytes || null)
        : null),
  };
}

async function buildPackageManifest(bundleResult, outputDir, extraArtifacts = []) {
  const files = [];
  const candidates = new Set(bundleResult.outputFiles || []);
  if (bundleResult.outputFile) candidates.add(bundleResult.outputFile);
  if (bundleResult.outputMapFile) candidates.add(bundleResult.outputMapFile);
  for (const artifact of extraArtifacts) {
    if (artifact) candidates.add(artifact);
  }
  for (const absolutePath of candidates) {
    if (!absolutePath || !existsSync(absolutePath)) continue;
    const raw = await readFile(absolutePath);
    files.push({
      file: toPosix(path.relative(outputDir, absolutePath)),
      bytes: raw.byteLength,
      sha256: createHash('sha256').update(raw).digest('hex'),
      immutable: /-[a-f0-9]{8,}\./.test(path.basename(absolutePath)),
    });
  }
  files.sort((a, b) => a.file.localeCompare(b.file));
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    files,
  };
  const manifestFile = path.join(outputDir, 'parsec-package-manifest.json');
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { manifest, manifestFile };
}

function buildParsecCacheKey(stage1Result, options = {}) {
  const payload = {
    backendTarget: options.backendTarget || 'edgejs-browser',
    packageStrategy: options.packageStrategy || 'single',
    pruneProblematicBuiltins: Boolean(options.pruneProblematicBuiltins),
    virtualizeNetworkLayer: Boolean(options.virtualizeNetworkLayer),
    entry: toPosix(path.relative(stage1Result.preparedDir, stage1Result.preparedEntryPath)),
    inputKind: stage1Result.inputKind || 'javascript',
    nodeBuiltinsUsed: stage1Result.preparedAnalysis?.nodeBuiltinsUsed || [],
    networkBuiltinsUsed: stage1Result.preparedAnalysis?.networkBuiltinsUsed || [],
    problematicNodeBuiltinsUsed: stage1Result.preparedAnalysis?.problematicNodeBuiltinsUsed || [],
    operationHistogram: stage1Result.rewrite?.operationHistogram || {},
    networkBuiltinsRewritten: stage1Result.rewrite?.networkBuiltinsRewritten || [],
    easyHardReadiness: stage1Result.preparedAnalysis?.easyHardReadiness || {},
    wasmValidation: stage1Result.wasmValidation || null,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function createLoadPlan(outputDir, stage1Result) {
  const bundleFile = stage1Result.bundle.outputFile
    ? toPosix(path.relative(outputDir, stage1Result.bundle.outputFile))
    : null;
  const bundleMapFile = stage1Result.bundle.outputMapFile
    ? toPosix(path.relative(outputDir, stage1Result.bundle.outputMapFile))
    : null;
  const backendTarget = stage1Result.backendTarget || 'edgejs-browser';
  const execution = backendTarget === 'wali-edge-remote'
    ? {
      mode: 'remote-node',
      remoteEntrypoint: '/edge/wali/execute',
      notes: 'Run Node execution on remote Wali backend; browser receives streamed IO.',
    }
    : {
      mode: 'browser-edgejs',
      wasmRuntime: 'edgejs',
      notes: 'Run bundle directly inside browser EdgeJS runtime.',
    };
  const problematicNodeBuiltinsUsed = [
    ...new Set([
      ...(stage1Result.analysis?.problematicNodeBuiltinsUsed || []),
      ...(stage1Result.preparedAnalysis?.problematicNodeBuiltinsUsed || []),
      ...(stage1Result.rewrite?.problematicBuiltinsRewritten || []),
    ]),
  ].sort();
  const networkBuiltinsUsed = [
    ...new Set([
      ...(stage1Result.analysis?.networkBuiltinsUsed || []),
      ...(stage1Result.preparedAnalysis?.networkBuiltinsUsed || []),
      ...(stage1Result.rewrite?.networkBuiltinsRewritten || []),
    ]),
  ].sort();

  return {
    schemaVersion: 1,
    runtime: stage1Result.inputKind === 'wasm' ? 'wasm-loader-validation' : 'edgejs-browser',
    profile: stage1Result.rewrite?.profile || null,
    inputKind: stage1Result.inputKind || 'javascript',
    backend: {
      target: backendTarget,
      execution,
    },
    packageStrategy: stage1Result.bundle.packageStrategy || 'single',
    entry: toPosix(path.relative(stage1Result.preparedDir, stage1Result.preparedEntryPath)),
    bundle: {
      file: bundleFile,
      sourceMap: bundleMapFile,
      bytes: stage1Result.bundle.bytes,
      outputFiles: (stage1Result.bundle.outputFiles || [])
        .map((filePath) => toPosix(path.relative(outputDir, filePath))),
    },
    analysis: {
      nodeBuiltinsUsed: stage1Result.preparedAnalysis?.nodeBuiltinsUsed || [],
      externalPackagesUsed: stage1Result.preparedAnalysis?.externalPackagesUsed || [],
      networkBuiltinsUsed,
      problematicNodeBuiltinsUsed,
      easyHardReadiness: stage1Result.preparedAnalysis?.easyHardReadiness || { ready: true, score: 100, blockers: [] },
      hardHardSignals: stage1Result.preparedAnalysis?.hardHardSignals || {},
      backendPlan: stage1Result.preparedAnalysis?.backendPlan || {},
      wasmValidation: stage1Result.wasmValidation || null,
    },
    load: stage1Result.inputKind === 'wasm'
      ? {
        type: 'wasm',
        wasmPath: bundleFile,
        instantiateExample: bundleFile
          ? `await WebAssembly.instantiateStreaming(fetch('./${bundleFile}'), {});`
          : null,
      }
      : {
        type: 'esm',
        importStatement: bundleFile ? `import './${bundleFile}';` : null,
      },
    packageManifest: stage1Result.packageManifestFile
      ? toPosix(path.relative(outputDir, stage1Result.packageManifestFile))
      : null,
    sharedNetwork: {
      enabled: Boolean(stage1Result.virtualizeNetworkLayer),
      rewrittenBuiltins: stage1Result.rewrite?.networkBuiltinsRewritten || [],
      contract: {
        version: 1,
        requiredLayerMethods: ['request', 'connect', 'lookup'],
      },
      adapterFile: stage1Result.sharedNetworkAdapterFile
        ? toPosix(path.relative(outputDir, stage1Result.sharedNetworkAdapterFile))
        : null,
      bootstrapFile: stage1Result.sharedNetworkBootstrapFile
        ? toPosix(path.relative(outputDir, stage1Result.sharedNetworkBootstrapFile))
        : null,
      bootstrapFunction: stage1Result.sharedNetworkBootstrapFile ? 'bootstrapParsecLoadPlan' : null,
      installFunction: stage1Result.sharedNetworkBootstrapFile ? 'ensurePersistentParsecSharedNetworkLayer' : null,
      globalLayerVar: '__PARSEC_SHARED_NETWORK__',
    },
    cacheKey: stage1Result.cacheKey || null,
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

async function collectComponentRoots(sourceDir, markerNames) {
  const files = await listFilesRecursive(sourceDir);
  const roots = new Set();
  for (const file of files) {
    if (markerNames.includes(path.basename(file))) {
      roots.add(path.dirname(file));
    }
  }
  return [...roots].sort();
}

async function detectLanguageComponents(sourceDir, language) {
  let roots = [];
  if (language === 'rust') roots = await collectComponentRoots(sourceDir, ['Cargo.toml']);
  if (language === 'c-cpp') roots = await collectComponentRoots(sourceDir, ['CMakeLists.txt', 'Makefile']);
  if (language === 'zig') roots = await collectComponentRoots(sourceDir, ['build.zig']);
  if (language === 'go') roots = await collectComponentRoots(sourceDir, ['go.mod']);
  if (language === 'assemblyscript') roots = await collectComponentRoots(sourceDir, ['asconfig.json']);

  if (roots.length === 0) {
    roots = [sourceDir];
  }

  const components = [];
  for (const cwd of roots) {
    const componentFiles = await listFilesRecursive(cwd);
    const easy = componentFiles.length <= 500 && !componentFiles.some((file) => file.endsWith('.node'));
    components.push({
      id: toPosix(path.relative(sourceDir, cwd) || '.'),
      cwd,
      fileCount: componentFiles.length,
      easy,
    });
  }
  return components;
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

    const backendTarget = options.backendTarget || 'edgejs-browser';
    if (!BACKEND_TARGETS.has(backendTarget)) {
      throw new Error(`Unsupported backend target: ${backendTarget}`);
    }
    const packageStrategy = options.packageStrategy || 'single';
    if (!PACKAGE_STRATEGIES.has(packageStrategy)) {
      throw new Error(`Unsupported package strategy: ${packageStrategy}`);
    }
    const pruneProblematicBuiltins = Boolean(options.pruneProblematicBuiltins);
    const problematicBuiltins = new Set(options.problematicBuiltins || DEFAULT_PROBLEMATIC_BUILTINS);
    const virtualizeNetworkLayer = Boolean(options.virtualizeNetworkLayer);
    const networkBuiltins = new Set(options.networkBuiltins || DEFAULT_NETWORK_BUILTINS);

    const jobId = inputSpec.jobId || randomUUID();
    const jobRoot = path.join(this.stageRoot, jobId);
    const sourceDir = path.join(jobRoot, 'source');
    const preparedDir = path.join(jobRoot, 'prepared');
    const outputDir = options.outputDir || path.join(jobRoot, 'output');
    const manifestsDir = path.join(jobRoot, 'manifests');
    await ensureDir(sourceDir);
    await ensureDir(preparedDir);
    await ensureDir(outputDir);
    await ensureDir(manifestsDir);

    await this.#ingestInput(inputSpec, sourceDir);

    const analysis = await analyzeSourceTree(sourceDir);
    let stage1Result;
    if (inputSpec.type === 'wasm') {
      if (packageStrategy !== 'single') {
        throw new Error('wasm input currently supports only packageStrategy=single');
      }
      const entryPath = await detectWasmEntry(sourceDir, inputSpec.entry);
      if (!entryPath) {
        throw new Error('No .wasm artifact found during stage 1 preparation.');
      }
      const rewriteResult = await rewriteSourceTree(sourceDir, preparedDir, {
        ...EASY_HARD_REWRITE_PROFILE,
        pruneProblematicBuiltins: false,
        virtualizeNetworkLayer: false,
      });
      const preparedEntryPath = path.join(preparedDir, path.relative(sourceDir, entryPath));
      const preparedAnalysis = await analyzeSourceTree(preparedDir);
      const wasmValidation = await validateWasmArtifact(preparedEntryPath);
      const wasmOutputPath = path.join(outputDir, path.basename(preparedEntryPath));
      await cp(preparedEntryPath, wasmOutputPath);
      const bundleResult = {
        outputFile: wasmOutputPath,
        outputMapFile: null,
        outputDir,
        packageStrategy: 'single',
        outputFiles: [wasmOutputPath],
        chunkFiles: [],
        metafile: null,
        bytes: wasmValidation.bytes,
      };
      const { manifest: packageManifest, manifestFile: packageManifestFile } = await buildPackageManifest(bundleResult, outputDir);
      stage1Result = {
        inputKind: 'wasm',
        sourceDir,
        preparedDir,
        entryPath,
        preparedEntryPath,
        analysis,
        preparedAnalysis,
        rewrite: rewriteResult,
        wasmValidation,
        bundle: bundleResult,
        backendTarget,
        packageStrategy: 'single',
        pruneProblematicBuiltins: false,
        virtualizeNetworkLayer: false,
        packageManifest,
        packageManifestFile,
        sharedNetworkAdapterFile: null,
        sharedNetworkBootstrapFile: null,
      };
    } else {
      const entryPath = await detectEntryPoint(sourceDir, inputSpec.entry);
      if (!entryPath) {
        throw new Error('No JS/TS entry point found during stage 1 preparation.');
      }

      const rewriteResult = await rewriteSourceTree(sourceDir, preparedDir, {
        ...EASY_HARD_REWRITE_PROFILE,
        pruneProblematicBuiltins,
        problematicBuiltins,
        virtualizeNetworkLayer,
        networkBuiltins,
      });
      const preparedEntryPath = path.join(preparedDir, path.relative(sourceDir, entryPath));
      const preparedAnalysis = await analyzeSourceTree(preparedDir);
      const problematicBuiltinModules = rewriteResult.problematicBuiltinsRewritten || [];
      const sharedNetworkModules = rewriteResult.networkBuiltinsRewritten || [];
      const bundleResult = await buildOptimizedBlob(preparedEntryPath, outputDir, preparedAnalysis.nodeBuiltinsUsed || [], {
        packageStrategy,
        backendTarget,
        problematicBuiltinModules,
        sharedNetworkModules,
      });
      const sharedNetworkAdapterFile = (virtualizeNetworkLayer && sharedNetworkModules.length > 0)
        ? await writeSharedNetworkAdapter(outputDir, backendTarget, sharedNetworkModules)
        : null;
      const sharedNetworkBootstrapFile = sharedNetworkAdapterFile
        ? await writeSharedNetworkBootstrap(outputDir, sharedNetworkAdapterFile, backendTarget)
        : null;
      const { manifest: packageManifest, manifestFile: packageManifestFile } = await buildPackageManifest(
        bundleResult,
        outputDir,
        [
          ...(sharedNetworkAdapterFile ? [sharedNetworkAdapterFile] : []),
          ...(sharedNetworkBootstrapFile ? [sharedNetworkBootstrapFile] : []),
        ],
      );
      stage1Result = {
        inputKind: 'javascript',
        sourceDir,
        preparedDir,
        entryPath,
        preparedEntryPath,
        analysis,
        preparedAnalysis,
        rewrite: rewriteResult,
        wasmValidation: null,
        bundle: bundleResult,
        backendTarget,
        packageStrategy,
        pruneProblematicBuiltins,
        virtualizeNetworkLayer,
        packageManifest,
        packageManifestFile,
        sharedNetworkAdapterFile,
        sharedNetworkBootstrapFile,
      };
    }
    const cacheKey = buildParsecCacheKey(stage1Result, {
      backendTarget,
      packageStrategy,
      pruneProblematicBuiltins,
      virtualizeNetworkLayer,
    });
    stage1Result.cacheKey = cacheKey;
    stage1Result.cacheKeyFile = path.join(outputDir, 'parsec-cache-key.txt');
    await writeFile(stage1Result.cacheKeyFile, `${cacheKey}\n`, 'utf8');
    const loadPlan = createLoadPlan(outputDir, stage1Result);
    const loadPlanFile = path.join(outputDir, 'parsec-load-plan.json');
    await writeFile(loadPlanFile, `${JSON.stringify(loadPlan, null, 2)}\n`, 'utf8');
    stage1Result.loadPlan = loadPlan;
    stage1Result.loadPlanFile = loadPlanFile;

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
        sourceDir: preparedDir,
        analysis: stage1Result.preparedAnalysis,
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
    if (type === 'wasm') {
      await ingestWasmInput(input, sourceDir);
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
      const componentsByLanguage = {};
      for (const candidate of candidates) {
        componentsByLanguage[candidate.language] = await detectLanguageComponents(sourceDir, candidate.language);
      }
      const llmAdvice = await this.llmAdvisor({
        sourceDir,
        analysis,
        candidates,
        helperWasm,
        componentsByLanguage,
      });

      const attempts = [];
      for (const candidate of candidates) {
        const components = componentsByLanguage[candidate.language] || [];
        const selectedComponents = components.filter((component) => component.easy);
        if (selectedComponents.length === 0) {
          attempts.push({
            language: candidate.language,
            notes: candidate.notes,
            skipped: true,
            reason: 'No easy components qualified for selective wasm lift.',
            components,
            commands: [],
          });
          continue;
        }

        for (const component of selectedComponents) {
          const compilePlan = [];
          for (const command of candidate.compileCommands || []) {
            const [bin, ...args] = command;
            const env = { ...process.env, ...(candidate.environment || {}) };
            const startedAt = Date.now();
            try {
              const { stdout, stderr } = await execFile(bin, args, {
                cwd: component.cwd,
                env,
                timeout: 120_000,
                maxBuffer: 4 * 1024 * 1024,
              });
              compilePlan.push({
                command: [bin, ...args].join(' '),
                cwd: component.cwd,
                ok: true,
                durationMs: Date.now() - startedAt,
                stdout: String(stdout || '').slice(0, 5000),
                stderr: String(stderr || '').slice(0, 5000),
              });
              break;
            } catch (error) {
              compilePlan.push({
                command: [bin, ...args].join(' '),
                cwd: component.cwd,
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
            component,
            commands: compilePlan,
          });
        }
      }

      task.result = {
        candidates,
        componentsByLanguage,
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

