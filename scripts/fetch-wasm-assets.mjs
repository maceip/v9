#!/usr/bin/env node
/**
 * Optional: pull pre-built Wasm outputs from S3 (or any HTTPS URL) into dist/ + build/
 * so engineers can skip `make build` inside Docker or on thin laptops.
 *
 * Env:
 *   WASM_ASSETS_S3_URI   s3://bucket/prefix/   (uses AWS CLI: aws s3 sync)
 *   WASM_ASSETS_URL      https://.../          (single zip URL — future)
 *
 * Expected layout after sync (same as make build + write-build-edge-shim):
 *   dist/edgejs.wasm dist/edgejs.js
 *   build/edge build/edge.js (or only dist/ + build/edge if you zip CI artifact)
 *
 * Example:
 *   export WASM_ASSETS_S3_URI=s3://my-org-v9-artifacts/edgejs-wasm-main/latest/
 *   node scripts/fetch-wasm-assets.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const s3uri = process.env.WASM_ASSETS_S3_URI || '';

if (!s3uri) {
  console.error('Set WASM_ASSETS_S3_URI (e.g. s3://bucket/prefix/) or extend this script for HTTPS.');
  process.exit(1);
}

// Mirror bucket layout: prefix should contain dist/ and build/ (as CI artifact tree).
const aws = spawnSync('aws', ['s3', 'sync', s3uri, root], {
  stdio: 'inherit',
  cwd: root,
  shell: false,
});
if (aws.status !== 0) {
  console.error('aws s3 sync failed. Install AWS CLI and configure credentials / IAM role.');
  process.exit(aws.status ?? 1);
}

const ok =
  existsSync(join(root, 'dist', 'edgejs.wasm')) &&
  existsSync(join(root, 'dist', 'edgejs.js')) &&
  existsSync(join(root, 'build', 'edge'));
if (!ok) {
  console.error('After sync, expected dist/edgejs.{wasm,js} and build/edge — adjust S3 keys or --include list.');
  process.exit(1);
}
console.log('WASM assets in place under repo root.');
