#!/usr/bin/env node
/**
 * NODEJS_IN_TAB_CONFORMANCE_TARGET aliases CONFORMANCE_TARGET when the latter is unset.
 */
const { getConformanceTargetMode } = await import('./conformance/_targets.mjs');

function fail(m) {
  console.error('FAIL:', m);
  process.exit(1);
}

const savedC = process.env.CONFORMANCE_TARGET;
const savedN = process.env.NODEJS_IN_TAB_CONFORMANCE_TARGET;

try {
  delete process.env.CONFORMANCE_TARGET;
  delete process.env.NODEJS_IN_TAB_CONFORMANCE_TARGET;
  if (getConformanceTargetMode() !== 'bridge') {
    fail(`expected default bridge, got ${getConformanceTargetMode()}`);
  }

  process.env.NODEJS_IN_TAB_CONFORMANCE_TARGET = 'node';
  delete process.env.CONFORMANCE_TARGET;
  if (getConformanceTargetMode() !== 'node') {
    fail(`expected node from NODEJS_IN_TAB_CONFORMANCE_TARGET, got ${getConformanceTargetMode()}`);
  }

  process.env.CONFORMANCE_TARGET = 'bridge';
  process.env.NODEJS_IN_TAB_CONFORMANCE_TARGET = 'node';
  if (getConformanceTargetMode() !== 'bridge') {
    fail(`CONFORMANCE_TARGET should win over NODEJS_IN_TAB_CONFORMANCE_TARGET, got ${getConformanceTargetMode()}`);
  }

  console.log('=== conformance env alias === ok');
} finally {
  if (savedC === undefined) delete process.env.CONFORMANCE_TARGET;
  else process.env.CONFORMANCE_TARGET = savedC;
  if (savedN === undefined) delete process.env.NODEJS_IN_TAB_CONFORMANCE_TARGET;
  else process.env.NODEJS_IN_TAB_CONFORMANCE_TARGET = savedN;
}
