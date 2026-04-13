#!/usr/bin/env node
/**
 * Unit tests for cmd/wisp-server-node/guard.js.
 *
 * Verifies the anti-abuse policy rules without any network or WebSocket:
 *   - Private/metadata IPs blocked
 *   - Port blocklist (SMTP etc.)
 *   - Hostname resolution catches DNS rebinding
 *   - Origin allowlist
 *   - Per-IP session limit
 *
 * Run: node tests/test-wisp-server-guard.mjs
 */

import assert from 'node:assert/strict';
import { isIP } from 'node:net';

// Set env vars BEFORE importing guard.js so the limits pick them up
process.env.WISP_ORIGIN_ALLOWLIST = 'https://maceip.github.io,https://example.test';
process.env.WISP_MAX_SESSIONS_PER_IP = '3';
process.env.WISP_EXTRA_BLOCKED_PORTS = '31337';

const {
  isBlockedIp,
  isBlockedPort,
  checkPort,
  resolveAndCheck,
  isAllowedOrigin,
  tryAddSession,
  removeSession,
  getLimits,
  GuardError,
} = await import('../cmd/wisp-server-node/guard.js');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name} — ${err.message}`);
    if (process.env.DEBUG) console.log(err.stack);
    failed++;
  }
}

console.log('\n=== wisp-server guard unit tests ===\n');

// ─── IP blocklist ────────────────────────────────────────────────────

console.log('── IP blocklist ──');

await test('loopback 127.0.0.1 is blocked', () => {
  assert.equal(isBlockedIp('127.0.0.1'), true);
});

await test('loopback 127.255.255.254 is blocked (covers /8)', () => {
  assert.equal(isBlockedIp('127.255.255.254'), true);
});

await test('RFC1918 10.0.0.1 is blocked', () => {
  assert.equal(isBlockedIp('10.0.0.1'), true);
});

await test('RFC1918 10.255.255.255 is blocked', () => {
  assert.equal(isBlockedIp('10.255.255.255'), true);
});

await test('RFC1918 172.16.0.1 is blocked', () => {
  assert.equal(isBlockedIp('172.16.0.1'), true);
});

await test('RFC1918 172.31.255.255 is blocked (end of /12)', () => {
  assert.equal(isBlockedIp('172.31.255.255'), true);
});

await test('172.32.0.1 is NOT blocked (outside RFC1918 /12)', () => {
  assert.equal(isBlockedIp('172.32.0.1'), false);
});

await test('RFC1918 192.168.1.1 is blocked', () => {
  assert.equal(isBlockedIp('192.168.1.1'), true);
});

await test('AWS metadata 169.254.169.254 is blocked (link-local /16)', () => {
  assert.equal(isBlockedIp('169.254.169.254'), true);
});

await test('link-local 169.254.0.1 is blocked', () => {
  assert.equal(isBlockedIp('169.254.0.1'), true);
});

await test('169.253.1.1 is NOT blocked (outside link-local /16)', () => {
  assert.equal(isBlockedIp('169.253.1.1'), false);
});

await test('multicast 224.0.0.1 is blocked', () => {
  assert.equal(isBlockedIp('224.0.0.1'), true);
});

await test('broadcast 255.255.255.255 is blocked', () => {
  assert.equal(isBlockedIp('255.255.255.255'), true);
});

await test('public IP 8.8.8.8 is NOT blocked', () => {
  assert.equal(isBlockedIp('8.8.8.8'), false);
});

await test('public IP 1.1.1.1 is NOT blocked', () => {
  assert.equal(isBlockedIp('1.1.1.1'), false);
});

await test('public IP 93.184.216.34 (example.com) is NOT blocked', () => {
  assert.equal(isBlockedIp('93.184.216.34'), false);
});

await test('unparseable IP is blocked (fail-closed)', () => {
  assert.equal(isBlockedIp('not an ip'), true);
  assert.equal(isBlockedIp('999.999.999.999'), true);
});

await test('IPv6 loopback ::1 is blocked', () => {
  assert.equal(isBlockedIp('::1'), true);
});

await test('IPv6 unspecified :: is blocked', () => {
  assert.equal(isBlockedIp('::'), true);
});

await test('IPv6 link-local fe80:: is blocked', () => {
  assert.equal(isBlockedIp('fe80::1'), true);
});

await test('IPv6 ULA fd00::1 is blocked', () => {
  assert.equal(isBlockedIp('fd00::1'), true);
});

await test('IPv6 multicast ff02::1 is blocked', () => {
  assert.equal(isBlockedIp('ff02::1'), true);
});

await test('IPv6 v4-mapped ::ffff:127.0.0.1 is blocked (catches mapping trick)', () => {
  assert.equal(isBlockedIp('::ffff:127.0.0.1'), true);
});

await test('IPv6 v4-mapped ::ffff:169.254.169.254 is blocked (metadata)', () => {
  assert.equal(isBlockedIp('::ffff:169.254.169.254'), true);
});

await test('IPv6 public 2606:4700:4700::1111 is NOT blocked (1.1.1.1)', () => {
  assert.equal(isBlockedIp('2606:4700:4700::1111'), false);
});

// ─── Port blocklist ──────────────────────────────────────────────────

console.log('\n── Port blocklist ──');

await test('SMTP 25 is blocked', () => {
  assert.equal(isBlockedPort(25), true);
});

await test('SMTP-SSL 465 is blocked', () => {
  assert.equal(isBlockedPort(465), true);
});

await test('SMTP submission 587 is blocked', () => {
  assert.equal(isBlockedPort(587), true);
});

await test('Telnet 23 is blocked', () => {
  assert.equal(isBlockedPort(23), true);
});

await test('IRC 6667 is blocked', () => {
  assert.equal(isBlockedPort(6667), true);
});

await test('extra port 31337 blocked via WISP_EXTRA_BLOCKED_PORTS', () => {
  assert.equal(isBlockedPort(31337), true);
});

await test('HTTP 80 is NOT blocked', () => {
  assert.equal(isBlockedPort(80), false);
});

await test('HTTPS 443 is NOT blocked', () => {
  assert.equal(isBlockedPort(443), false);
});

await test('ports outside range are blocked (fail-closed)', () => {
  assert.equal(isBlockedPort(0), true);
  assert.equal(isBlockedPort(65536), true);
  assert.equal(isBlockedPort(-1), true);
  assert.equal(isBlockedPort('abc'), true);
});

await test('checkPort throws GuardError with code "blocked_port" for 25', () => {
  try {
    checkPort(25);
    throw new Error('expected throw');
  } catch (err) {
    assert.ok(err instanceof GuardError);
    assert.equal(err.code, 'blocked_port');
  }
});

// ─── Hostname resolution ─────────────────────────────────────────────

console.log('\n── Hostname resolution ──');

await test('resolveAndCheck returns an IP for a valid public host', async () => {
  // Use cloudflare's 1.1.1.1 literal (skips DNS)
  const ip = await resolveAndCheck('1.1.1.1');
  assert.equal(ip, '1.1.1.1');
});

await test('resolveAndCheck blocks IPv4 literal in private range', async () => {
  try {
    await resolveAndCheck('10.0.0.1');
    throw new Error('expected throw');
  } catch (err) {
    assert.ok(err instanceof GuardError);
    assert.equal(err.code, 'blocked_ip');
  }
});

await test('resolveAndCheck blocks metadata 169.254.169.254', async () => {
  try {
    await resolveAndCheck('169.254.169.254');
    throw new Error('expected throw');
  } catch (err) {
    assert.equal(err.code, 'blocked_ip');
  }
});

await test('resolveAndCheck blocks IPv6 loopback', async () => {
  try {
    await resolveAndCheck('::1');
    throw new Error('expected throw');
  } catch (err) {
    assert.equal(err.code, 'blocked_ip');
  }
});

await test('resolveAndCheck rejects empty hostname', async () => {
  try {
    await resolveAndCheck('');
    throw new Error('expected throw');
  } catch (err) {
    assert.equal(err.code, 'invalid_host');
  }
});

await test('resolveAndCheck rejects oversized hostname', async () => {
  const huge = 'a'.repeat(300);
  try {
    await resolveAndCheck(huge);
    throw new Error('expected throw');
  } catch (err) {
    assert.equal(err.code, 'host_too_long');
  }
});

// ─── Origin check ────────────────────────────────────────────────────

console.log('\n── Origin check ──');

await test('allowlisted origin is allowed', () => {
  assert.equal(isAllowedOrigin('https://maceip.github.io'), true);
});

await test('second allowlisted origin is allowed', () => {
  assert.equal(isAllowedOrigin('https://example.test'), true);
});

await test('unknown origin is rejected', () => {
  assert.equal(isAllowedOrigin('https://evil.example'), false);
});

await test('localhost origin is always allowed (dev)', () => {
  assert.equal(isAllowedOrigin('http://localhost:3000'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5173'), true);
});

await test('missing origin is allowed (some clients omit it)', () => {
  assert.equal(isAllowedOrigin(''), true);
  assert.equal(isAllowedOrigin(null), true);
  assert.equal(isAllowedOrigin(undefined), true);
});

await test('malformed origin is rejected', () => {
  assert.equal(isAllowedOrigin('not-a-url'), false);
});

// ─── Per-IP session limit ────────────────────────────────────────────

console.log('\n── Per-IP session limit ──');

await test('tryAddSession allows up to the limit', () => {
  removeSession('1.2.3.4', 'dummy'); // reset
  assert.equal(tryAddSession('1.2.3.4', 's1'), true);
  assert.equal(tryAddSession('1.2.3.4', 's2'), true);
  assert.equal(tryAddSession('1.2.3.4', 's3'), true);
});

await test('tryAddSession rejects beyond the limit', () => {
  assert.equal(tryAddSession('1.2.3.4', 's4'), false);
});

await test('removeSession frees a slot', () => {
  removeSession('1.2.3.4', 's1');
  assert.equal(tryAddSession('1.2.3.4', 's4'), true);
});

await test('limits are independent per IP', () => {
  assert.equal(tryAddSession('5.6.7.8', 'x1'), true);
  assert.equal(tryAddSession('5.6.7.8', 'x2'), true);
  assert.equal(tryAddSession('5.6.7.8', 'x3'), true);
});

// ─── Limits config ───────────────────────────────────────────────────

console.log('\n── Limits config ──');

await test('getLimits reads env overrides', () => {
  const l = getLimits();
  assert.equal(l.maxSessionsPerIp, 3); // set via env at top of file
  assert.equal(typeof l.bandwidthBps, 'number');
  assert.ok(l.maxStreamsPerSession > 0);
});

// ─── Summary ────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
