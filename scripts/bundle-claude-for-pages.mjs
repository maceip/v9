#!/usr/bin/env node
/**
 * GitHub Pages / demo deploy: pre-bundle the vendor CLI into one ESM file.
 *
 * This is the Pages-specific bundling recipe for the Anthropic CLI reference app.
 * For general app bundling, use `v9 build` instead.
 *
 * Run **after** `scripts/prepare-github-pages.mjs` in CI so `docs/dist/` already contains
 * `edgejs.{js,wasm}` and the CLI file lands alongside them.
 *
 * Requires: `@anthropic-ai/claude-code` installed (`npm ci` picks devDependencies).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const outDirDocs = join(repoRoot, 'docs', 'dist');
const outDirDist = join(repoRoot, 'dist');
const outfileDocs = join(outDirDocs, 'claude-code-cli.js');
const outfileDist = join(outDirDist, 'claude-code-cli.js');
const require = createRequire(import.meta.url);

mkdirSync(outDirDocs, { recursive: true });
mkdirSync(outDirDist, { recursive: true });

let entry;
try {
  entry = require.resolve('@anthropic-ai/claude-code/cli.js');
} catch {
  console.error('Missing package: add @anthropic-ai/claude-code to devDependencies and run npm ci');
  process.exit(1);
}

/** Bare + node: specifiers used by the minified CLI */
const nodeBuiltins = [
  'node:*',
  'crypto',
  'fs',
  'fs/promises',
  'process',
  'os',
  'path',
  'path/posix',
  'path/win32',
  'net',
  'url',
  'stream',
  'stream/promises',
  'stream/consumers',
  'stream/web',
  'http',
  'https',
  'http2',
  'zlib',
  'events',
  'async_hooks',
  'child_process',
  'buffer',
  'module',
  'tty',
  'v8',
  'dns',
  'readline',
  'worker_threads',
  'assert',
  'util',
  'constants',
  'string_decoder',
  'inspector',
  'diagnostics_channel',
  'querystring',
  'perf_hooks',
  'punycode',
  'tls',
  'timers',
  'timers/promises',
  'console',
  'vm',
];

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  mainFields: ['module', 'main'],
  conditions: ['import', 'browser', 'default'],
  outfile: outfileDocs,
  logLevel: 'warning',
  banner: {
    js: '/* Claude Code — browser bundle for GitHub Pages */\n',
  },
  external: [
    ...nodeBuiltins,
    'undici',
    'node-pty',
    'read-pkg',
    'npm-run-path',
    'execa',
    'unicorn-magic',
    'react-devtools-core',
    '@google/gemini-cli-devtools',
    '@vscode/ripgrep',
    'aws4fetch',
    'open',
    'pino',
    'pino-pretty',
    'bufferutil',
    'utf-8-validate',
    'supports-color',
    'typescript',
    'encoding',
    'domain',
    'require-in-the-middle',
    'import-in-the-middle',
    'stack-utils',
    'bun:bundle',
  ],
});

let text = readFileSync(outfileDocs, 'utf8');
if (text.startsWith('#!')) {
  text = text.replace(/^#![^\n]*/, '');
  writeFileSync(outfileDocs, text, 'utf8');
}
writeFileSync(outfileDist, text, 'utf8');

console.log(`Bundled Claude Code CLI → ${outfileDocs}`);
console.log(`Also copied for local dev → ${outfileDist}`);
