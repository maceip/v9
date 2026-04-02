#!/usr/bin/env node
/**
 * Produce docs/dist/claude-code-cli.js for GitHub Pages (ESM).
 * Bare Node builtins (e.g. "fs") and node: prefixed imports stay external → import map.
 *
 * Requires: npm install @anthropic-ai/claude-code (CI: --no-save).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const outDir = join(repoRoot, 'docs', 'dist');
const outfile = join(outDir, 'claude-code-cli.js');
const require = createRequire(import.meta.url);

mkdirSync(outDir, { recursive: true });

let entry;
try {
  entry = require.resolve('@anthropic-ai/claude-code/cli.js');
} catch {
  console.error('Missing package: npm install @anthropic-ai/claude-code');
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
];

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  mainFields: ['module', 'main'],
  conditions: ['import', 'browser', 'default'],
  outfile,
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

let text = readFileSync(outfile, 'utf8');
if (text.startsWith('#!')) {
  text = text.replace(/^#![^\n]*/, '');
  writeFileSync(outfile, text, 'utf8');
}

console.log(`Bundled Claude Code CLI → ${outfile}`);
