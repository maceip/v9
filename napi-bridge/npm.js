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

const REGISTRY = 'https://registry.npmjs.org';
const _decoder = new TextDecoder();
const _encoder = new TextEncoder();

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
  const res = await fetch(url, {
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
  const res = await fetch(url, {
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
  const res = await fetch(tarballUrl);
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
        '  npm install <pkg> [<pkg> ...]   Install packages',
        '  npm i <pkg>                     Alias for install',
        '  npm list                        List installed packages',
        '  npm ls                          Alias for list',
        '',
      ].join('\n'),
      stderr: '',
      exitCode: 0,
    };
  }

  if (subcommand === 'install' || subcommand === 'i' || subcommand === 'add') {
    return npmInstall(args.slice(1), options);
  }

  if (subcommand === 'list' || subcommand === 'ls') {
    return npmList(options);
  }

  return {
    stdout: '',
    stderr: `npm: unknown command "${subcommand}"\n`,
    exitCode: 1,
  };
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
