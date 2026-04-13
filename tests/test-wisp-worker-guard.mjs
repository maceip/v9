#!/usr/bin/env node
/**
 * Unit tests for cmd/wisp-worker/guard.js (Cloudflare Worker version).
 *
 * The Worker guard is a separate implementation from the Node server guard
 * because CF Workers don't have node:net or node:dns. This test covers the
 * pure-JS policy functions: isBlockedIp, isBlockedPort, isAllowedOrigin.
 *
 * resolveAndCheck is NOT tested here because it uses fetch() against
 * 1.1.1.1/dns-query which would need a live network. The Node server guard
 * tests cover the resolution logic path, and the policy rules are shared.
 *
 * Run: node tests/test-wisp-worker-guard.mjs
 */

import assert from 'node:assert/strict';

const {
  isBlockedIp,
  isBlockedPort,
  isAllowedOrigin,
  GuardError,
} = await import('../cmd/wisp-worker/guard.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name} — ${err.message}`);
    failed++;
  }
}

console.log('\n=== wisp-worker (CF) guard unit tests ===\n');

// ─── IP blocklist ────────────────────────────────────────────────────

console.log('── IP blocklist ──');
test('loopback 127.0.0.1 blocked', () => assert.equal(isBlockedIp('127.0.0.1'), true));
test('RFC1918 10.0.0.1 blocked', () => assert.equal(isBlockedIp('10.0.0.1'), true));
test('RFC1918 172.16.5.5 blocked', () => assert.equal(isBlockedIp('172.16.5.5'), true));
test('RFC1918 172.31.255.255 blocked (end of /12)', () => assert.equal(isBlockedIp('172.31.255.255'), true));
test('172.32.0.1 NOT blocked (outside /12)', () => assert.equal(isBlockedIp('172.32.0.1'), false));
test('RFC1918 192.168.1.1 blocked', () => assert.equal(isBlockedIp('192.168.1.1'), true));
test('AWS metadata 169.254.169.254 blocked', () => assert.equal(isBlockedIp('169.254.169.254'), true));
test('multicast 224.0.0.1 blocked', () => assert.equal(isBlockedIp('224.0.0.1'), true));
test('public 8.8.8.8 NOT blocked', () => assert.equal(isBlockedIp('8.8.8.8'), false));
test('public 1.1.1.1 NOT blocked', () => assert.equal(isBlockedIp('1.1.1.1'), false));
test('IPv6 ::1 loopback blocked', () => assert.equal(isBlockedIp('::1'), true));
test('IPv6 fe80::1 link-local blocked', () => assert.equal(isBlockedIp('fe80::1'), true));
test('IPv6 fd00::1 ULA blocked', () => assert.equal(isBlockedIp('fd00::1'), true));
test('IPv6 ::ffff:127.0.0.1 v4-mapped blocked', () => assert.equal(isBlockedIp('::ffff:127.0.0.1'), true));
test('IPv6 public 2606:4700:4700::1111 NOT blocked', () => assert.equal(isBlockedIp('2606:4700:4700::1111'), false));
test('garbage blocked (fail-closed)', () => {
  assert.equal(isBlockedIp('not-an-ip'), true);
  assert.equal(isBlockedIp(''), true);
  assert.equal(isBlockedIp(null), true);
});

// ─── Port blocklist ──────────────────────────────────────────────────

console.log('\n── Port blocklist ──');
test('SMTP 25 blocked', () => assert.equal(isBlockedPort(25), true));
test('SMTP 465 blocked', () => assert.equal(isBlockedPort(465), true));
test('SMTP 587 blocked', () => assert.equal(isBlockedPort(587), true));
test('Telnet 23 blocked', () => assert.equal(isBlockedPort(23), true));
test('IRC 6667 blocked', () => assert.equal(isBlockedPort(6667), true));
test('HTTP 80 NOT blocked', () => assert.equal(isBlockedPort(80), false));
test('HTTPS 443 NOT blocked', () => assert.equal(isBlockedPort(443), false));
test('out-of-range blocked', () => {
  assert.equal(isBlockedPort(0), true);
  assert.equal(isBlockedPort(65536), true);
});
test('extra blocked via env', () => {
  assert.equal(isBlockedPort(9000, { EXTRA_BLOCKED_PORTS: '9000,9001' }), true);
  assert.equal(isBlockedPort(9001, { EXTRA_BLOCKED_PORTS: '9000,9001' }), true);
  assert.equal(isBlockedPort(9002, { EXTRA_BLOCKED_PORTS: '9000,9001' }), false);
});

// ─── Origin check ────────────────────────────────────────────────────

console.log('\n── Origin check ──');
const env = { ORIGIN_ALLOWLIST: 'https://maceip.github.io,https://example.test' };
test('allowlisted origin allowed', () => assert.equal(isAllowedOrigin('https://maceip.github.io', env), true));
test('second allowlisted origin allowed', () => assert.equal(isAllowedOrigin('https://example.test', env), true));
test('unknown origin rejected', () => assert.equal(isAllowedOrigin('https://evil.example', env), false));
test('localhost always allowed', () => {
  assert.equal(isAllowedOrigin('http://localhost:3000', env), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5173', env), true);
});
test('missing origin allowed', () => assert.equal(isAllowedOrigin('', env), true));
test('wildcard disables origin check', () => {
  assert.equal(isAllowedOrigin('https://anything.example', { ORIGIN_ALLOWLIST: '*' }), true);
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
