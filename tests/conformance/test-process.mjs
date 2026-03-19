import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createHarness } from './_harness.mjs';
import {
  getConformanceTargetMode,
  loadProcessModule,
  printConformanceTarget,
} from './_targets.mjs';

const mode = getConformanceTargetMode();
const { test, testAsync, assert, assertEq, assertThrows, assertDeepEq, finish } =
  createHarness('Conformance: process');

printConformanceTarget('process');
const { processObject: processLike } = await loadProcessModule();

await testAsync('process.env is mutable and coerces values to strings', async () => {
  assert(processLike.env && typeof processLike.env === 'object', 'process.env should be an object');
  const key = '__CONFORMANCE_PROCESS_ENV__';
  const prior = processLike.env[key];
  processLike.env[key] = 3000;
  assertEq(processLike.env[key], '3000');

  if (prior === undefined) {
    delete processLike.env[key];
  } else {
    processLike.env[key] = prior;
  }
});

test('process.argv, pid, platform, arch, version, and versions are populated', () => {
  assert(Array.isArray(processLike.argv), 'process.argv should be an array');
  assert(processLike.argv.length >= 2, 'process.argv should include node + script entries');
  assertEq(typeof processLike.pid, 'number');
  assertEq(typeof processLike.platform, 'string');
  assertEq(typeof processLike.arch, 'string');
  assertEq(typeof processLike.version, 'string');
  assert(processLike.version.startsWith('v'), 'process.version should start with "v"');
  assert(processLike.versions && typeof processLike.versions === 'object', 'process.versions should be object');
  assertEq(typeof processLike.versions.node, 'string');
});

test('process.cwd() and process.chdir() update working directory', () => {
  assertEq(typeof processLike.cwd, 'function');
  assertEq(typeof processLike.chdir, 'function');

  const initial = processLike.cwd();
  const tempDir = mkdtempSync(path.join(tmpdir(), 'process-conformance-'));
  try {
    processLike.chdir(tempDir);
    assertEq(processLike.cwd(), tempDir);
  } finally {
    processLike.chdir(initial);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('process.hrtime.bigint() returns a bigint value', () => {
  assert(processLike.hrtime && typeof processLike.hrtime.bigint === 'function');
  const first = processLike.hrtime.bigint();
  const second = processLike.hrtime.bigint();
  assertEq(typeof first, 'bigint');
  assertEq(typeof second, 'bigint');
  assert(second >= first);
});

test('process stdin/stdout/stderr expose stream-like interfaces', () => {
  assert(processLike.stdin && typeof processLike.stdin.on === 'function');
  assert(processLike.stdout && typeof processLike.stdout.write === 'function');
  assert(processLike.stderr && typeof processLike.stderr.write === 'function');
  if (mode === 'node') {
    const ttyType = typeof processLike.stdout.isTTY;
    assert(
      ttyType === 'boolean' || ttyType === 'undefined',
      `node stdout.isTTY should be boolean or undefined, got ${ttyType}`,
    );
  } else {
    assertEq(typeof processLike.stdout.isTTY, 'boolean');
  }
});

test('stdout.write() and stderr.write() return booleans', () => {
  const stdoutResult = processLike.stdout.write('');
  const stderrResult = processLike.stderr.write('');
  assertEq(typeof stdoutResult, 'boolean');
  assertEq(typeof stderrResult, 'boolean');
});

await testAsync('process.nextTick runs before Promise.then and setTimeout(0)', async () => {
  assertEq(typeof processLike.nextTick, 'function');
  if (mode === 'node') {
    const script = `
      const order = [];
      process.nextTick(() => order.push('nextTick'));
      Promise.resolve().then(() => order.push('promise'));
      setTimeout(() => {
        order.push('timeout');
        process.stdout.write(JSON.stringify(order));
      }, 0);
    `;
    const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    assertEq(result.status, 0);
    const order = JSON.parse(result.stdout || '[]');
    assertDeepEq(order, ['nextTick', 'promise', 'timeout']);
    return;
  }

  const order = [];
  await new Promise((resolve) => {
    processLike.nextTick(() => order.push('nextTick'));
    Promise.resolve().then(() => order.push('promise'));
    setTimeout(() => {
      order.push('timeout');
      resolve();
    }, 0);
  });
  assertDeepEq(order, ['nextTick', 'promise', 'timeout']);
});

test('process can handle uncaughtException lifecycle listener', () => {
  assertEq(typeof processLike.on, 'function');
  assertEq(typeof processLike.emit, 'function');

  let message = '';
  const listener = (error) => {
    message = error.message;
  };

  processLike.once?.('uncaughtException', listener);
  processLike.emit('uncaughtException', new Error('boom'));
  assertEq(message, 'boom');
});

test('process.on("exit") receives exit code on process.exit()', () => {
  if (mode === 'node') {
    const script = `
      process.on('exit', (code) => {
        if (code !== 23) process.exitCode = 91;
      });
      process.exit(23);
    `;
    const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    assertEq(result.status, 23);
    return;
  }

  assertEq(typeof processLike.exit, 'function');
  let seenCode = null;
  const listener = (code) => {
    seenCode = code;
  };
  processLike.on('exit', listener);
  processLike.exit(17);
  assertEq(seenCode, 17);
  processLike.off?.('exit', listener);
});

test('uncaughtException with no listener throws in node process semantics', () => {
  if (mode !== 'node') return;
  const script = `
    setImmediate(() => {
      throw new Error('uncaught boom');
    });
  `;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert(result.status !== 0, 'uncaught exception should terminate process with non-zero status');
  assert(result.stderr.includes('uncaught boom'));
});

finish();
