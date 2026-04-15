/**
 * npm — in-tab npm client for MEMFS.
 *
 * Fetches packages from registry.npmjs.org (CORS-enabled), extracts tarballs
 * into MEMFS node_modules/, and recursively resolves dependencies.
 *
 * Usage (from shell):
 *   npm install express
 *   npm i lodash chalk
 *
 * Architecture:
 *   1. Fetch package metadata from registry (JSON)
 *   2. Resolve version (latest, or semver range from parent)
 *   3. Download tarball (.tgz)
 *   4. Decompress gzip → parse tar → write files to MEMFS
 *   5. Read package.json dependencies → recurse
 *
 * Limitations:
 *   - No lockfile (installs latest compatible each time)
 *   - No lifecycle scripts (postinstall etc.)
 *   - No peer dependency resolution
 *   - Flat node_modules only (no hoisting optimization)
 */

import { gunzipSync } from './zlib.js';
import { cacheGetPackage, cachePutPackage, cacheDeletePackage } from './runtime-cache.js';
import { browserHttpFetch } from './transport-policy.mjs';

const REGISTRY = 'https://registry.npmjs.org';
const _decoder = new TextDecoder();
const _encoder = new TextEncoder();

// Route all registry traffic through the transport policy so the auto-fallback
// chain (native → tier-3 proxy → tier-2 wisp) engages on CORS / network
// failures. Using browserHttpFetch directly means the shell's npm install path
// does not depend on globalThis.fetch being patched by node-polyfills.js —
// minimal test harnesses that import shell.js without loading the full
// polyfill bundle still get the chain.
const _fetch = (url, init) => browserHttpFetch(String(url), init || {});

// ─── Tar extraction ─────────────────────────────────────────────────
// npm tarballs are .tgz (gzip-compressed tar). Tar is a simple format:
// each file = 512-byte header + ceil(size/512)*512 bytes of content.

/**
 * Parse a tar archive from a Uint8Array.
 * @param {Uint8Array} data - raw tar bytes (already decompressed)
 * @returns {Array<{name: string, data: Uint8Array}>} files
 */
function parseTar(data) {
  const files = [];
  let offset = 0;

  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);

    // Empty block = end of archive
    if (header.every(b => b === 0)) break;

    // Name: bytes 0-99 (null-terminated)
    let name = '';
    for (let i = 0; i < 100 && header[i] !== 0; i++) name += String.fromCharCode(header[i]);

    // USTAR prefix: bytes 345-499
    let prefix = '';
    if (header[257] === 0x75 && header[258] === 0x73 && header[259] === 0x74 &&
        header[260] === 0x61 && header[261] === 0x72) {
      for (let i = 345; i < 500 && header[i] !== 0; i++) prefix += String.fromCharCode(header[i]);
    }
    if (prefix) name = prefix + '/' + name;

    // Size: bytes 124-135 (octal, null/space terminated)
    let sizeStr = '';
    for (let i = 124; i < 136 && header[i] !== 0 && header[i] !== 0x20; i++) {
      sizeStr += String.fromCharCode(header[i]);
    }
    const size = parseInt(sizeStr, 8) || 0;

    // Type: byte 156 ('0' or '\0' = file, '5' = directory, '2' = symlink)
    const type = header[156];

    offset += 512; // skip header

    if ((type === 0x30 || type === 0) && size > 0) {
      // Regular file
      const content = data.slice(offset, offset + size);
      files.push({ name, data: content });
    }

    // Advance past content (padded to 512-byte boundary)
    offset += Math.ceil(size / 512) * 512;
  }

  return files;
}

/**
 * Extract a .tgz buffer into a target directory in MEMFS.
 * npm tarballs have a `package/` prefix on all paths which we strip.
 * @param {Uint8Array} tgzData
 * @param {string} destDir - e.g. "/node_modules/express"
 * @param {object} memfs - MEMFS instance
 */
function extractTgzToMemfs(tgzData, destDir, memfs) {
  const tarData = gunzipSync(tgzData);
  const files = parseTar(tarData instanceof Uint8Array ? tarData : new Uint8Array(tarData));

  for (const file of files) {
    // Strip the package/ prefix that npm tarballs use
    let name = file.name;
    const slashIdx = name.indexOf('/');
    if (slashIdx >= 0) {
      name = name.substring(slashIdx + 1);
    }
    if (!name || name.endsWith('/')) continue;

    const fullPath = destDir + '/' + name;

    // Ensure parent directories exist
    const lastSlash = fullPath.lastIndexOf('/');
    if (lastSlash > 0) {
      const parentDir = fullPath.substring(0, lastSlash);
      try { memfs.mkdir(parentDir, true); } catch {}
    }

    memfs.writeFile(fullPath, file.data);
  }
}

// ─── Registry client ────────────────────────────────────────────────

/**
 * Fetch package metadata from npm registry.
 * @param {string} packageName - e.g. "express" or "@types/node"
 * @returns {Promise<object>} - full packument
 */
async function fetchPackageMetadata(packageName) {
  const url = `${REGISTRY}/${encodeURIComponent(packageName).replace('%40', '@')}`;
  const res = await _fetch(url, {
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`npm registry: ${packageName} — ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch abbreviated metadata (smaller payload, faster).
 * @param {string} packageName
 * @returns {Promise<object>}
 */
async function fetchPackageMetadataAbbreviated(packageName) {
  const url = `${REGISTRY}/${encodeURIComponent(packageName).replace('%40', '@')}`;
  const res = await _fetch(url, {
    headers: { 'Accept': 'application/vnd.npm.install-v1+json' },
  });
  if (!res.ok) {
    throw new Error(`npm registry: ${packageName} — ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Download a tarball as Uint8Array.
 * @param {string} tarballUrl
 * @returns {Promise<Uint8Array>}
 */
async function fetchTarball(tarballUrl) {
  const res = await _fetch(tarballUrl);
  if (!res.ok) {
    throw new Error(`npm tarball fetch failed: ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

// ─── Semver (minimal) ───────────────────────────────────────────────
// We only need to resolve "latest" and basic ^/~ ranges.

function parseVersion(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
}

function versionSatisfies(version, range) {
  if (!range || range === '*' || range === 'latest') return true;

  const v = parseVersion(version);
  if (!v) return false;

  // Exact
  const exact = parseVersion(range);
  if (exact && range.match(/^\d/)) {
    return v[0] === exact[0] && v[1] === exact[1] && v[2] === exact[2];
  }

  // ^major.minor.patch — compatible with version
  const caretMatch = range.match(/^\^(\d+)\.(\d+)\.(\d+)/);
  if (caretMatch) {
    const r = [parseInt(caretMatch[1]), parseInt(caretMatch[2]), parseInt(caretMatch[3])];
    if (r[0] !== 0) {
      return v[0] === r[0] && (v[1] > r[1] || (v[1] === r[1] && v[2] >= r[2]));
    }
    // ^0.x.y
    if (r[1] !== 0) {
      return v[0] === 0 && v[1] === r[1] && v[2] >= r[2];
    }
    return v[0] === 0 && v[1] === 0 && v[2] === r[2];
  }

  // ~major.minor.patch — approximately equivalent
  const tildeMatch = range.match(/^~(\d+)\.(\d+)\.(\d+)/);
  if (tildeMatch) {
    const r = [parseInt(tildeMatch[1]), parseInt(tildeMatch[2]), parseInt(tildeMatch[3])];
    return v[0] === r[0] && v[1] === r[1] && v[2] >= r[2];
  }

  // >=major.minor.patch
  const gteMatch = range.match(/^>=(\d+)\.(\d+)\.(\d+)/);
  if (gteMatch) {
    const r = [parseInt(gteMatch[1]), parseInt(gteMatch[2]), parseInt(gteMatch[3])];
    if (v[0] !== r[0]) return v[0] > r[0];
    if (v[1] !== r[1]) return v[1] > r[1];
    return v[2] >= r[2];
  }

  // Fallback: accept anything if we can't parse the range
  return true;
}

/**
 * Pick the best version from a packument given a semver range.
 * @param {object} packument - registry metadata
 * @param {string} range - semver range (e.g. "^4.18.0") or "latest"
 * @returns {{ version: string, tarball: string, dependencies: object }}
 */
function resolveVersion(packument, range) {
  // Try dist-tags first
  if (!range || range === 'latest' || range === '*') {
    const latest = packument['dist-tags']?.latest;
    if (latest && packument.versions?.[latest]) {
      const v = packument.versions[latest];
      return {
        version: latest,
        tarball: v.dist?.tarball,
        dependencies: v.dependencies || {},
      };
    }
  }

  // Find best matching version
  const versions = Object.keys(packument.versions || {});
  let best = null;
  let bestParsed = null;

  for (const ver of versions) {
    if (!versionSatisfies(ver, range)) continue;
    const parsed = parseVersion(ver);
    if (!parsed) continue;

    if (!best || parsed[0] > bestParsed[0] ||
        (parsed[0] === bestParsed[0] && parsed[1] > bestParsed[1]) ||
        (parsed[0] === bestParsed[0] && parsed[1] === bestParsed[1] && parsed[2] > bestParsed[2])) {
      best = ver;
      bestParsed = parsed;
    }
  }

  if (!best) {
    throw new Error(`No version of ${packument.name || '?'} matches range "${range}"`);
  }

  const v = packument.versions[best];
  return {
    version: best,
    tarball: v.dist?.tarball,
    dependencies: v.dependencies || {},
  };
}

// ─── Installer ──────────────────────────────────────────────────────

/**
 * Install a package and its dependencies into MEMFS.
 *
 * @param {string} packageName
 * @param {string} range - semver range or "latest"
 * @param {string} baseDir - where to install (e.g. "/workspace")
 * @param {object} memfs - MEMFS instance
 * @param {object} [opts]
 * @param {function} [opts.onStatus] - callback(message) for progress
 * @param {Set} [opts._installed] - internal: tracks installed packages to avoid loops
 * @param {number} [opts._depth] - internal: recursion depth
 * @returns {Promise<{name: string, version: string, count: number}>}
 */
async function installPackage(packageName, range, baseDir, memfs, opts = {}) {
  const onStatus = opts.onStatus || (() => {});
  const installed = opts._installed || new Set();
  const depth = opts._depth || 0;
  const MAX_DEPTH = 10;

  const nodeModulesDir = baseDir + '/node_modules';
  const destDir = nodeModulesDir + '/' + packageName;

  // Skip if already installed at this location
  const installKey = destDir;
  if (installed.has(installKey)) {
    return { name: packageName, version: 'cached', count: 0 };
  }
  installed.add(installKey);

  // Skip if already installed and the existing version satisfies the range
  try {
    const existing = memfs.readFile(destDir + '/package.json');
    const pkg = JSON.parse(_decoder.decode(existing));
    if (pkg.version && versionSatisfies(pkg.version, range)) {
      return { name: packageName, version: pkg.version, count: 0 };
    }
  } catch { /* not installed yet */ }

  // Fetch metadata
  onStatus(`  fetching ${packageName}${range && range !== 'latest' ? '@' + range : ''}`);
  let packument;
  try {
    packument = await fetchPackageMetadataAbbreviated(packageName);
  } catch {
    // Fallback to full metadata
    packument = await fetchPackageMetadata(packageName);
  }

  // Resolve version
  const resolved = resolveVersion(packument, range);
  onStatus(`  resolved ${packageName}@${resolved.version}`);

  if (!resolved.tarball) {
    throw new Error(`No tarball URL for ${packageName}@${resolved.version}`);
  }

  // Cross-tab IndexedDB tarball cache, keyed by `${name}@${version}`. On
  // hit we skip the network entirely and extract the stored bytes straight
  // into MEMFS. On a corrupt cache entry (extract throws) we evict it and
  // fall through to the normal fetch path.
  let tgzData = null;
  let fromCache = false;
  try {
    const cached = await cacheGetPackage(packageName, resolved.version);
    if (cached && cached.byteLength > 0) {
      tgzData = cached;
      fromCache = true;
    }
  } catch { /* best-effort cache */ }

  if (!tgzData) {
    onStatus(`  downloading ${packageName}@${resolved.version}`);
    tgzData = await fetchTarball(resolved.tarball);
    // Fire-and-forget cache write; a failed put never blocks install.
    cachePutPackage(packageName, resolved.version, tgzData).catch(() => {});
  } else {
    onStatus(`  cached ${packageName}@${resolved.version} (${(tgzData.length / 1024).toFixed(0)}KB)`);
  }

  onStatus(`  extracting ${packageName}@${resolved.version} (${(tgzData.length / 1024).toFixed(0)}KB)`);

  try { memfs.mkdir(nodeModulesDir, true); } catch {}
  try {
    extractTgzToMemfs(tgzData, destDir, memfs);
  } catch (extractErr) {
    // If extract failed on cached bytes, the cache entry is probably
    // truncated/corrupt. Evict it and retry from the network — the
    // caller will see at most one extra round trip as the failure cost.
    if (fromCache) {
      try { await cacheDeletePackage(packageName, resolved.version); } catch {}
      onStatus(`  cache corrupt for ${packageName}@${resolved.version}, re-fetching`);
      tgzData = await fetchTarball(resolved.tarball);
      cachePutPackage(packageName, resolved.version, tgzData).catch(() => {});
      extractTgzToMemfs(tgzData, destDir, memfs);
    } else {
      throw extractErr;
    }
  }

  // Recurse into dependencies.
  // All installs are flat at baseDir/node_modules/ (no hoisting / no conflict
  // resolution). Depth is only used as a recursion limit.
  let count = 1;
  const deps = resolved.dependencies;
  if (deps && depth < MAX_DEPTH) {
    for (const [depName, depRange] of Object.entries(deps)) {
      try {
        const result = await installPackage(depName, depRange, baseDir, memfs, {
          onStatus,
          _installed: installed,
          _depth: depth + 1,
        });
        count += result.count;
      } catch (err) {
        onStatus(`  warn: failed to install ${depName}: ${err.message}`);
      }
    }
  }

  return { name: packageName, version: resolved.version, count };
}

// ─── Shell command interface ────────────────────────────────────────

/**
 * npm shell command handler.
 * @param {string[]} args - e.g. ["install", "express"]
 * @param {object} options - { cwd, env, memfs }
 * @returns {{ stdout: string, stderr: string, exitCode: number, _async: Promise }}
 */
export function npm(args, options = {}) {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    return {
      stdout: [
        'Usage: npm <command>',
        '',
        'Commands:',
        '  npm install [<pkg> ...]        Install packages (or deps from package.json)',
        '  npm uninstall <pkg> [...]      Remove packages (aliases: remove, rm)',
        '  npm list                       List installed packages (alias: ls)',
        '  npm run [<script>]             Run a script from package.json',
        '  npm start                      Alias for: npm run start',
        '  npm test                       Alias for: npm run test',
        '  npm init [-y]                  Create a package.json',
        '  npm root [-g]                  Print node_modules path',
        '  npm prefix                     Print project root',
        '  npm version                    Print version info',
        '  npm view <pkg> [field]         Print registry info about a package',
        '  npm exec <cmd> [args...]       Run a local/installed binary (alias: npx)',
        '',
      ].join('\n'),
      stderr: '',
      exitCode: 0,
    };
  }

  if (subcommand === 'install' || subcommand === 'i' || subcommand === 'add') {
    return npmInstall(args.slice(1), options);
  }

  if (subcommand === 'uninstall' || subcommand === 'remove' || subcommand === 'rm' || subcommand === 'un') {
    return npmUninstall(args.slice(1), options);
  }

  if (subcommand === 'list' || subcommand === 'ls') {
    return npmList(options);
  }

  if (subcommand === 'run' || subcommand === 'run-script') {
    return npmRun(args.slice(1), options);
  }

  if (subcommand === 'start') {
    return npmRun(['start', ...args.slice(1)], options);
  }

  if (subcommand === 'test' || subcommand === 't' || subcommand === 'tst') {
    return npmRun(['test', ...args.slice(1)], options);
  }

  if (subcommand === 'init' || subcommand === 'create') {
    return npmInit(args.slice(1), options);
  }

  if (subcommand === 'root') {
    return npmRoot(args.slice(1), options);
  }

  if (subcommand === 'prefix') {
    const cwd = options.cwd || '/workspace';
    return { stdout: cwd + '\n', stderr: '', exitCode: 0 };
  }

  if (subcommand === 'version' || subcommand === '--version' || subcommand === '-v') {
    return {
      stdout: JSON.stringify({ 'in-tab-npm': '0.1.0', node: 'edgejs-wasm' }, null, 2) + '\n',
      stderr: '',
      exitCode: 0,
    };
  }

  if (subcommand === 'view' || subcommand === 'info' || subcommand === 'show') {
    return npmView(args.slice(1));
  }

  if (subcommand === 'exec' || subcommand === 'x') {
    return npmExec(args.slice(1), options);
  }

  if (subcommand === 'whoami') {
    return { stdout: 'anonymous\n', stderr: '', exitCode: 0 };
  }

  if (subcommand === 'ping') {
    return { stdout: 'registry: ' + REGISTRY + '\n', stderr: '', exitCode: 0 };
  }

  if (subcommand === 'config' || subcommand === 'c') {
    return { stdout: 'registry=' + REGISTRY + '\n', stderr: '', exitCode: 0 };
  }

  if (subcommand === 'cache') {
    // npm cache clean / ls / verify — no-ops against our IndexedDB cache
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  if (subcommand === 'audit' || subcommand === 'outdated' || subcommand === 'fund' || subcommand === 'doctor') {
    return { stdout: '(no-op in in-tab npm)\n', stderr: '', exitCode: 0 };
  }

  return {
    stdout: '',
    stderr: `npm: unknown command "${subcommand}"\n`,
    exitCode: 1,
  };
}

// ─── npm run / start / test ─────────────────────────────────────────

/**
 * npm run [<script>] [-- <extra args>]
 *
 * With no script name, lists all available scripts from package.json.
 * Otherwise looks up the script, then dispatches the script command
 * string through the shell parser so all other shell commands (node,
 * echo, &&, pipes) Just Work.
 */
function npmRun(args, options) {
  const cwd = options.cwd || '/workspace';
  const memfs = options.memfs;
  if (!memfs) return { stdout: '', stderr: 'npm: no filesystem available\n', exitCode: 1 };

  let pkg;
  try {
    pkg = JSON.parse(_decoder.decode(memfs.readFile(cwd + '/package.json')));
  } catch {
    return {
      stdout: '',
      stderr: `npm ERR! Could not read ${cwd}/package.json\n`,
      exitCode: 1,
    };
  }

  const scripts = pkg.scripts || {};

  // npm run (no args) → list scripts, real npm style
  if (args.length === 0) {
    const names = Object.keys(scripts);
    if (names.length === 0) {
      return {
        stdout: `Lifecycle scripts included in ${pkg.name || 'workspace'}@${pkg.version || '0.0.0'}:\n  (none)\n`,
        stderr: '',
        exitCode: 0,
      };
    }
    const lines = [`Lifecycle scripts included in ${pkg.name || 'workspace'}@${pkg.version || '0.0.0'}:`];
    for (const name of names) {
      lines.push(`  ${name}`);
      lines.push(`    ${scripts[name]}`);
    }
    return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
  }

  const scriptName = args[0];
  const extra = args.slice(1);
  // Strip leading `--` that real npm uses to separate script args.
  if (extra[0] === '--') extra.shift();

  const scriptCmd = scripts[scriptName];
  if (!scriptCmd) {
    // Mirror real npm's "test" and "start" defaults when absent.
    if (scriptName === 'test') {
      return {
        stdout: '',
        stderr: 'npm ERR! Missing script: "test"\nnpm ERR! Did you mean one of these?\n    npm test\n',
        exitCode: 1,
      };
    }
    if (scriptName === 'start') {
      return _runThroughShell('node server.js' + (extra.length ? ' ' + extra.join(' ') : ''), cwd, options);
    }
    return { stdout: '', stderr: `npm ERR! Missing script: "${scriptName}"\n`, exitCode: 1 };
  }

  const fullCmd = extra.length ? `${scriptCmd} ${extra.join(' ')}` : scriptCmd;
  const header = `\n> ${pkg.name || 'workspace'}@${pkg.version || '0.0.0'} ${scriptName}\n> ${fullCmd}\n\n`;

  const asyncWork = (async () => {
    const result = await _runThroughShellAsync(fullCmd, cwd, options);
    return {
      stdout: header + (result.stdout || ''),
      stderr: result.stderr || '',
      exitCode: result.exitCode ?? 0,
    };
  })();
  return { stdout: '', stderr: '', exitCode: 0, _async: asyncWork };
}

// Dispatch a command string through the shell-parser. We import lazily to
// avoid a circular require at module load time (shell-commands.js already
// imports npm.js).
async function _runThroughShellAsync(cmdStr, cwd, options) {
  const { executeCommandString } = await import('./shell-parser.js');
  const result = executeCommandString(cmdStr, { cwd, env: options?.env || {} });
  if (result._async) {
    const r = await result._async;
    return { stdout: r.stdout || '', stderr: r.stderr || '', exitCode: r.exitCode ?? 0 };
  }
  return { stdout: result.stdout || '', stderr: result.stderr || '', exitCode: result.exitCode ?? 0 };
}

function _runThroughShell(cmdStr, cwd, options) {
  const work = _runThroughShellAsync(cmdStr, cwd, options);
  return { stdout: '', stderr: '', exitCode: 0, _async: work };
}

// ─── npm uninstall ──────────────────────────────────────────────────

function npmUninstall(packageNames, options) {
  const cwd = options.cwd || '/workspace';
  const memfs = options.memfs;
  if (!memfs) return { stdout: '', stderr: 'npm: no filesystem available\n', exitCode: 1 };

  const names = packageNames.filter(n => !n.startsWith('-'));
  if (names.length === 0) {
    return { stdout: '', stderr: 'npm: uninstall requires at least one package name\n', exitCode: 1 };
  }

  let removed = 0;
  for (const name of names) {
    const dir = cwd + '/node_modules/' + name;
    try {
      _rmrfMemfs(memfs, dir);
      removed++;
    } catch { /* not installed */ }
  }

  // Drop from package.json dependencies / devDependencies.
  try {
    const pkg = JSON.parse(_decoder.decode(memfs.readFile(cwd + '/package.json')));
    let dirty = false;
    for (const name of names) {
      if (pkg.dependencies && pkg.dependencies[name]) { delete pkg.dependencies[name]; dirty = true; }
      if (pkg.devDependencies && pkg.devDependencies[name]) { delete pkg.devDependencies[name]; dirty = true; }
    }
    if (dirty) {
      memfs.writeFile(cwd + '/package.json', _encoder.encode(JSON.stringify(pkg, null, 2) + '\n'));
    }
  } catch { /* no package.json */ }

  return {
    stdout: `removed ${removed} package${removed !== 1 ? 's' : ''}\n`,
    stderr: '',
    exitCode: 0,
  };
}

function _rmrfMemfs(memfs, path) {
  let stat;
  try { stat = memfs.stat(path); } catch { return; }
  if (stat.isDirectory()) {
    for (const entry of memfs.readdir(path)) {
      _rmrfMemfs(memfs, path + '/' + entry);
    }
    try { memfs.rmdir(path); } catch {}
  } else {
    try { memfs.unlink(path); } catch {}
  }
}

// ─── npm init ───────────────────────────────────────────────────────

function npmInit(args, options) {
  const cwd = options.cwd || '/workspace';
  const memfs = options.memfs;
  if (!memfs) return { stdout: '', stderr: 'npm: no filesystem available\n', exitCode: 1 };

  const pkgPath = cwd + '/package.json';
  let existing = null;
  try { existing = JSON.parse(_decoder.decode(memfs.readFile(pkgPath))); } catch {}
  if (existing) {
    return {
      stdout: '',
      stderr: 'npm: package.json already exists\n',
      exitCode: 1,
    };
  }

  const name = (cwd.split('/').filter(Boolean).pop() || 'workspace').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const pkg = {
    name,
    version: '1.0.0',
    description: '',
    main: 'index.js',
    scripts: { test: 'echo "Error: no test specified" && exit 1' },
    keywords: [],
    author: '',
    license: 'ISC',
  };
  memfs.writeFile(pkgPath, _encoder.encode(JSON.stringify(pkg, null, 2) + '\n'));
  return {
    stdout: `Wrote to ${pkgPath}:\n\n${JSON.stringify(pkg, null, 2)}\n\n`,
    stderr: '',
    exitCode: 0,
  };
}

// ─── npm root ───────────────────────────────────────────────────────

function npmRoot(args, options) {
  const cwd = options.cwd || '/workspace';
  if (args.includes('-g') || args.includes('--global')) {
    return { stdout: '/usr/local/lib/node_modules\n', stderr: '', exitCode: 0 };
  }
  return { stdout: cwd + '/node_modules\n', stderr: '', exitCode: 0 };
}

// ─── npm view / info ────────────────────────────────────────────────

function npmView(args) {
  const name = args[0];
  if (!name) return { stdout: '', stderr: 'npm: view requires a package name\n', exitCode: 1 };

  const field = args[1]; // optional: view express version

  const work = (async () => {
    try {
      const packument = await fetchPackageMetadata(name);
      if (field) {
        // Resolve simple dotted paths on the latest version or the packument.
        const latest = packument['dist-tags']?.latest;
        const root = latest ? packument.versions?.[latest] || packument : packument;
        const value = field.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), root);
        return {
          stdout: (value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)) + '\n',
          stderr: '',
          exitCode: 0,
        };
      }
      const latest = packument['dist-tags']?.latest;
      const vInfo = latest ? packument.versions?.[latest] : null;
      const lines = [
        `${packument.name}@${latest || '?'} | ${vInfo?.license || 'UNLICENSED'}`,
        `deps: ${Object.keys(vInfo?.dependencies || {}).length}`,
        `dist-tags:`,
        ...Object.entries(packument['dist-tags'] || {}).map(([k, v]) => `  ${k}: ${v}`),
        ``,
        packument.description || '',
      ];
      return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
    } catch (err) {
      return { stdout: '', stderr: `npm: view failed: ${err.message}\n`, exitCode: 1 };
    }
  })();
  return { stdout: '', stderr: '', exitCode: 0, _async: work };
}

// ─── npm exec / npx ─────────────────────────────────────────────────
//
// Resolve a local bin:
//   1. node_modules/.bin/<name>
//   2. node_modules/<name>/package.json bin field
// If found, dispatch it as `node <bin-path> [args...]` through the shell.

function npmExec(args, options) {
  const cwd = options.cwd || '/workspace';
  const memfs = options.memfs;
  if (!memfs) return { stdout: '', stderr: 'npm: no filesystem available\n', exitCode: 1 };
  if (args.length === 0) return { stdout: '', stderr: 'npm: exec requires a command\n', exitCode: 1 };

  const name = args[0];
  const rest = args.slice(1);

  // Check node_modules/<name>/package.json bin field
  let binPath = null;
  try {
    const pkg = JSON.parse(_decoder.decode(memfs.readFile(`${cwd}/node_modules/${name}/package.json`)));
    if (typeof pkg.bin === 'string') {
      binPath = `${cwd}/node_modules/${name}/${pkg.bin}`;
    } else if (pkg.bin && typeof pkg.bin === 'object') {
      const first = pkg.bin[name] || Object.values(pkg.bin)[0];
      if (first) binPath = `${cwd}/node_modules/${name}/${first}`;
    } else {
      const main = pkg.main || 'index.js';
      binPath = `${cwd}/node_modules/${name}/${main}`;
    }
  } catch { /* not installed locally */ }

  if (!binPath) {
    return {
      stdout: '',
      stderr: `npm exec: ${name} is not installed. Try: npm i ${name}\n`,
      exitCode: 1,
    };
  }

  const cmdStr = `node ${binPath}${rest.length ? ' ' + rest.join(' ') : ''}`;
  return _runThroughShell(cmdStr, cwd, options);
}

function npmInstall(packageNames, options) {
  const cwd = options.cwd || '/workspace';
  const memfs = options.memfs;

  if (!memfs) {
    return {
      stdout: '',
      stderr: 'npm: no filesystem available\n',
      exitCode: 1,
    };
  }

  // Filter out flags (we ignore them for now)
  const names = packageNames.filter(n => !n.startsWith('-'));

  if (names.length === 0) {
    // npm install (no args) — install from package.json
    try {
      const pkgSrc = _decoder.decode(memfs.readFile(cwd + '/package.json'));
      const pkg = JSON.parse(pkgSrc);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const depNames = Object.keys(deps);
      if (depNames.length === 0) {
        return { stdout: 'up to date, no dependencies\n', stderr: '', exitCode: 0 };
      }
      // Fall through with the dep list
      names.push(...depNames.map(n => deps[n] === 'latest' || deps[n] === '*' ? n : `${n}@${deps[n]}`));
    } catch {
      return { stdout: 'up to date, no dependencies\n', stderr: '', exitCode: 0 };
    }
  }

  // Parse package@version specs
  const specs = names.map(n => {
    const atIdx = n.lastIndexOf('@');
    if (atIdx > 0) {
      return { name: n.substring(0, atIdx), range: n.substring(atIdx + 1) };
    }
    return { name: n, range: 'latest' };
  });

  // Return a synchronous shell result with an _async promise that does the real work.
  // The shell runner will await _async and use its result.
  const lines = [];
  const onStatus = (msg) => lines.push(msg);

  const asyncWork = (async () => {
    let totalCount = 0;
    const installed = new Set();

    for (const spec of specs) {
      try {
        const result = await installPackage(spec.name, spec.range, cwd, memfs, {
          onStatus,
          _installed: installed,
        });
        lines.push(`+ ${result.name}@${result.version}`);
        totalCount += result.count;
      } catch (err) {
        lines.push(`ERR! ${spec.name}: ${err.message}`);
        return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 1 };
      }
    }

    // Update package.json if it exists
    try {
      let pkg;
      try {
        pkg = JSON.parse(_decoder.decode(memfs.readFile(cwd + '/package.json')));
      } catch {
        pkg = { name: 'workspace', version: '1.0.0', dependencies: {} };
      }
      if (!pkg.dependencies) pkg.dependencies = {};
      for (const spec of specs) {
        // Record what was actually installed
        try {
          const installedPkg = JSON.parse(
            _decoder.decode(memfs.readFile(cwd + '/node_modules/' + spec.name + '/package.json'))
          );
          pkg.dependencies[spec.name] = '^' + installedPkg.version;
        } catch {}
      }
      memfs.writeFile(cwd + '/package.json', _encoder.encode(JSON.stringify(pkg, null, 2) + '\n'));
    } catch {}

    lines.push(`\nadded ${totalCount} package${totalCount !== 1 ? 's' : ''}`);
    return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
  })();

  // Return placeholder with async promise
  return {
    stdout: '',
    stderr: '',
    exitCode: 0,
    _async: asyncWork,
  };
}

function npmList(options) {
  const cwd = options.cwd || '/workspace';
  const memfs = options.memfs;

  if (!memfs) {
    return { stdout: '', stderr: 'npm: no filesystem available\n', exitCode: 1 };
  }

  const nmDir = cwd + '/node_modules';
  const lines = [];

  try {
    let pkgName = 'workspace';
    try {
      const pkg = JSON.parse(_decoder.decode(memfs.readFile(cwd + '/package.json')));
      pkgName = `${pkg.name || 'workspace'}@${pkg.version || '1.0.0'}`;
    } catch {}

    lines.push(pkgName);

    const entries = memfs.readdir(nmDir);
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      try {
        const depPkg = JSON.parse(
          _decoder.decode(memfs.readFile(nmDir + '/' + entry + '/package.json'))
        );
        lines.push(`├── ${depPkg.name}@${depPkg.version}`);
      } catch {
        lines.push(`├── ${entry}`);
      }
    }
  } catch {
    lines.push('(empty)');
  }

  return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
}

// ─── Exports ────────────────────────────────────────────────────────

export { installPackage, extractTgzToMemfs, parseTar, fetchPackageMetadata, resolveVersion };
export default npm;
