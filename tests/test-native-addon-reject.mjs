#!/usr/bin/env node
import { posix } from 'node:path';
import { initRuntimeForTests } from './helpers/runtime-init.mjs';

function fail(m) {
  console.error('FAIL:', m);
  process.exit(1);
}

const root = '/workspace';

const { runtime } = await initRuntimeForTests({ preferJsScriptBridge: true, captureOutput: true });
const fs = runtime.fs;
fs.mkdirSync(root, { recursive: true });

const fake = posix.join(root, 'noop.node');
fs.writeFileSync(fake, Buffer.from('pretend'));

let threw = false;
try {
  runtime.require(fake, root);
} catch (e) {
  threw = true;
  if (e.code !== 'ERR_DLOPEN_FAILED') {
    fail(`expected ERR_DLOPEN_FAILED, got ${e.code}: ${e.message}`);
  }
}
if (!threw) fail('expected require(.node) to throw');

console.log('=== native addon reject === ok');
