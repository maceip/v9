#!/usr/bin/env node
/**
 * v9 CLI — run Node.js apps in the browser.
 *
 * Usage:
 *   v9 run <bundled.js>        Run a pre-bundled JS file in a browser tab
 *   v9 build [--entry <file>]  Bundle a Node.js project and run it in a browser tab
 *
 * Examples:
 *   v9 run ./dist/my-app.js
 *   v9 build
 *   v9 build --entry src/index.js
 */
import { existsSync, readFileSync, mkdirSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, basename, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, fork } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const V9_ROOT = resolve(__dirname, '..');

// ── Helpers ─────────────────────────────────────────────────────────

function die(msg) {
  console.error(`\x1b[31mv9: ${msg}\x1b[0m`);
  process.exit(1);
}

function info(msg) {
  console.log(`\x1b[36mv9:\x1b[0m ${msg}`);
}

function success(msg) {
  console.log(`\x1b[32mv9:\x1b[0m ${msg}`);
}

function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
    } else if (platform === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore', shell: true });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
    }
  } catch {
    info(`Open this URL in your browser:\n  ${url}`);
  }
}

/** Node built-ins that napi-bridge provides in the browser. */
const NODE_BUILTINS_EXTERNAL = [
  'node:*',
  'assert', 'async_hooks', 'buffer', 'child_process', 'console',
  'constants', 'crypto', 'diagnostics_channel', 'dns', 'dns/promises',
  'events', 'fs', 'fs/promises', 'http', 'http2', 'https',
  'inspector', 'module', 'net', 'os', 'path', 'path/posix', 'path/win32',
  'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
  'stream', 'stream/consumers', 'stream/promises', 'stream/web',
  'string_decoder', 'timers', 'timers/promises', 'tls', 'tty',
  'url', 'util', 'v8', 'worker_threads', 'zlib',
];

/** Packages that don't work in-browser and should be stubbed out. */
const BROWSER_EXTERNAL = [
  'undici', 'node-pty', 'read-pkg', 'npm-run-path', 'execa',
  'unicorn-magic', '@vscode/ripgrep', 'aws4fetch', 'open',
  'pino', 'pino-pretty', 'bufferutil', 'utf-8-validate',
  'supports-color', 'typescript', 'encoding', 'domain',
  'require-in-the-middle', 'import-in-the-middle', 'stack-utils',
  'react-devtools-core', '@google/gemini-cli-devtools',
  'bun:bundle',
];

// ── Parse args ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  console.log(`
  \x1b[1mv9\x1b[0m — run Node.js apps in the browser

  \x1b[1mUsage:\x1b[0m
    v9 run <bundled.js>           Run a pre-bundled JS file in a browser tab
    v9 build [--entry <file>]     Bundle your project, open browser, and emit artifact

  \x1b[1mExamples:\x1b[0m

    # You already have a bundled file:
    v9 run ./dist/my-app.js

    # You have a Node.js project with package.json:
    v9 build

    # Specify entry explicitly:
    v9 build --entry src/cli.js

  \x1b[1mWhat happens:\x1b[0m
    \x1b[36mrun\x1b[0m   Starts a local server, opens Chromium with your bundle loaded
          in a terminal tab (xterm.js + napi-bridge Node polyfills).

    \x1b[36mbuild\x1b[0m Bundles your project with esbuild (tree-shaken, minified,
          Node built-ins mapped to browser polyfills), starts the server,
          opens the browser, AND writes the optimized bundle to disk:
            .v9-build/<name>.js
`);
  process.exit(0);
}

// ── Commands ────────────────────────────────────────────────────────

if (command === 'run') {
  await cmdRun();
} else if (command === 'build') {
  await cmdBuild();
} else {
  die(`Unknown command: "${command}". Use "v9 run" or "v9 build".`);
}

// ── v9 run <bundled.js> ─────────────────────────────────────────────

async function cmdRun() {
  const file = args[1];
  if (!file) {
    die('Missing argument. Usage: v9 run <bundled.js>');
  }

  const absPath = resolve(file);
  if (!existsSync(absPath)) {
    die(`File not found: ${absPath}`);
  }

  // Copy the bundle into v9's dist/ so the dev server can serve it
  const distDir = join(V9_ROOT, 'dist');
  mkdirSync(distDir, { recursive: true });
  const bundleName = `user-app-${basename(file)}`;
  const destPath = join(distDir, bundleName);
  copyFileSync(absPath, destPath);

  info(`Copied ${basename(file)} → dist/${bundleName}`);
  await startServerAndOpen(`/dist/${bundleName}`);
}

// ── v9 build [--entry <file>] ───────────────────────────────────────

async function cmdBuild() {
  const cwd = process.cwd();

  // Find entry point
  let entryFile = null;

  // Check for --entry flag
  const entryIdx = args.indexOf('--entry');
  if (entryIdx !== -1 && args[entryIdx + 1]) {
    entryFile = resolve(args[entryIdx + 1]);
  }

  // Auto-detect from package.json
  if (!entryFile) {
    const pkgPath = join(cwd, 'package.json');
    if (!existsSync(pkgPath)) {
      die(
        'No package.json found in current directory.\n' +
        '  Either run this from your project root, or use: v9 build --entry <file>'
      );
    }

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const candidates = [pkg.main, pkg.module, pkg.bin, 'index.js', 'src/index.js', 'src/index.ts'];

    // Handle bin as string or object
    if (pkg.bin && typeof pkg.bin === 'object') {
      candidates.unshift(...Object.values(pkg.bin));
    }

    for (const c of candidates) {
      if (typeof c !== 'string') continue;
      const abs = resolve(cwd, c);
      if (existsSync(abs)) {
        entryFile = abs;
        break;
      }
    }

    if (!entryFile) {
      die(
        'Could not find an entry point.\n' +
        '  Set "main" in package.json, or use: v9 build --entry <file>'
      );
    }
  }

  if (!existsSync(entryFile)) {
    die(`Entry file not found: ${entryFile}`);
  }

  info(`Entry: ${entryFile}`);

  // Dynamically import esbuild (it's a dependency of v9)
  let esbuild;
  try {
    esbuild = await import('esbuild');
  } catch {
    die('esbuild not found. Run "npm install" in the v9 directory first.');
  }

  // Determine output name from package.json or filename
  const pkgPath = join(cwd, 'package.json');
  let appName = basename(entryFile, extname(entryFile));
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.name) {
        appName = pkg.name.replace(/^@[^/]+\//, '').replace(/[^a-zA-Z0-9_-]/g, '-');
      }
    } catch { /* use filename */ }
  }

  const bundleFilename = `${appName}-bundle.js`;

  // Build output paths
  const localArtifactDir = join(cwd, '.v9-build');
  const distDir = join(V9_ROOT, 'dist');
  mkdirSync(localArtifactDir, { recursive: true });
  mkdirSync(distDir, { recursive: true });

  const localOut = join(localArtifactDir, bundleFilename);
  const distOut = join(distDir, bundleFilename);

  info('Bundling with esbuild...');

  try {
    const result = await esbuild.build({
      entryPoints: [entryFile],
      bundle: true,
      platform: 'neutral',
      format: 'esm',
      target: 'es2022',
      mainFields: ['module', 'browser', 'main'],
      conditions: ['import', 'browser', 'default'],
      treeShaking: true,
      minify: true,
      sourcemap: false,
      outfile: distOut,
      logLevel: 'warning',
      banner: {
        js: `/* v9 build — ${appName} — browser bundle */\n`,
      },
      external: [
        ...NODE_BUILTINS_EXTERNAL,
        ...BROWSER_EXTERNAL,
      ],
    });

    if (result.errors.length > 0) {
      die('Build failed. See esbuild errors above.');
    }
  } catch (err) {
    die(`Build failed: ${err.message}`);
  }

  // Copy to local artifact dir
  copyFileSync(distOut, localOut);

  const sizeKB = (statSync(distOut).size / 1024).toFixed(1);
  success(`Bundle: ${sizeKB} KB → .v9-build/${bundleFilename}`);

  // Strip shebang if present
  let text = readFileSync(distOut, 'utf8');
  if (text.startsWith('#!')) {
    text = text.replace(/^#![^\n]*/, '');
    writeFileSync(distOut, text, 'utf8');
    writeFileSync(localOut, text, 'utf8');
  }

  await startServerAndOpen(`/dist/${bundleFilename}`);
}

// ── Dev server + browser launcher ───────────────────────────────────

async function startServerAndOpen(bundlePath) {
  // Wasm runtime is required — fail early with clear guidance
  const edgeJsPath = join(V9_ROOT, 'dist', 'edgejs.js');
  const edgeWasmPath = join(V9_ROOT, 'dist', 'edgejs.wasm');
  if (!existsSync(edgeJsPath) || !existsSync(edgeWasmPath)) {
    die(
      'EdgeJS wasm runtime not found (dist/edgejs.js + dist/edgejs.wasm).\n\n' +
      '  To get the pre-built wasm (requires gh CLI):\n' +
      '    npm run vendor:wasm\n\n' +
      '  To build from source (requires Emscripten):\n' +
      '    npm run build'
    );
  }

  const url = `http://localhost:8080/web/index.html?bundle=${bundlePath}&autorun=1`;

  info('Starting dev server (file server :8080 + CORS proxy :8081)...');

  // Fork the dev server as a child process
  const devServer = fork(join(V9_ROOT, 'scripts', 'dev-server.mjs'), [], {
    cwd: V9_ROOT,
    stdio: 'pipe',
  });

  // Wait for the server to be ready, then open browser
  let opened = false;
  const onData = (data) => {
    const text = data.toString();
    // Suppress dev-server's default chatter; only show v9 CLI output
    if (!opened && text.includes('File server')) {
      opened = true;
      setTimeout(() => {
        success(`Serving at http://localhost:8080`);
        console.log(`  ${url}\n`);
        openBrowser(url);
      }, 300);
    }
  };

  devServer.stdout?.on('data', onData);
  devServer.stderr?.on('data', () => { /* suppress dev-server noise */ });

  // Handle clean shutdown
  const cleanup = () => {
    devServer.kill();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Keep the CLI alive while the server runs
  await new Promise(() => {});
}
