#!/usr/bin/env node
/**
 * Pull pre-built Wasm outputs into dist/ + build/ so engineers skip `make build`.
 *
 * Supports two backends (checked in order):
 *
 *   1. WASM_ASSETS_CDN_URL  — CloudFront HTTPS (no AWS CLI needed)
 *      Example: https://d111111abcdef8.cloudfront.net
 *      Files fetched: /main/latest/dist/edgejs.wasm, .../edgejs.js, .../build/edge
 *
 *   2. WASM_ASSETS_S3_URI   — AWS CLI s3 sync
 *      Example: s3://v9-edgejs-artifacts-123456789/main/latest/
 *
 * Usage:
 *   export WASM_ASSETS_CDN_URL=https://d111111abcdef8.cloudfront.net
 *   node scripts/fetch-wasm-assets.mjs            # latest from main
 *   node scripts/fetch-wasm-assets.mjs abc123      # specific commit SHA
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const ref = process.argv[2] || 'latest';
const cdnUrl = process.env.WASM_ASSETS_CDN_URL || '';
const s3uri = process.env.WASM_ASSETS_S3_URI || '';

const ASSETS = [
  { remote: `main/${ref}/dist/edgejs.wasm`, local: 'dist/edgejs.wasm' },
  { remote: `main/${ref}/dist/edgejs.js`, local: 'dist/edgejs.js' },
  { remote: `main/${ref}/build/edge`, local: 'build/edge' },
];

async function fetchFromCDN(baseUrl) {
  console.log(`Fetching from CDN: ${baseUrl} (ref: ${ref})`);
  for (const { remote, local } of ASSETS) {
    const url = `${baseUrl.replace(/\/+$/, '')}/${remote}`;
    const dest = join(root, local);
    mkdirSync(join(dest, '..'), { recursive: true });

    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`);

    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    console.log(`  ${local} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
  }
}

function fetchFromS3(uri) {
  console.log(`Syncing from S3: ${uri}`);
  const aws = spawnSync('aws', ['s3', 'sync', uri, root], {
    stdio: 'inherit',
    cwd: root,
    shell: false,
  });
  if (aws.status !== 0) {
    console.error('aws s3 sync failed. Install AWS CLI and configure credentials / IAM role.');
    process.exit(aws.status ?? 1);
  }
}

function verify() {
  const ok =
    existsSync(join(root, 'dist', 'edgejs.wasm')) &&
    existsSync(join(root, 'dist', 'edgejs.js')) &&
    existsSync(join(root, 'build', 'edge'));
  if (!ok) {
    console.error('Expected dist/edgejs.{wasm,js} and build/edge — check remote paths.');
    process.exit(1);
  }
  console.log('Wasm assets ready. Skip `make build` and go straight to testing.');
}

if (cdnUrl) {
  await fetchFromCDN(cdnUrl);
  verify();
} else if (s3uri) {
  fetchFromS3(s3uri);
  verify();
} else {
  console.error(`Set one of:
  WASM_ASSETS_CDN_URL=https://<cloudfront-domain>
  WASM_ASSETS_S3_URI=s3://<bucket>/<prefix>/`);
  process.exit(1);
}
