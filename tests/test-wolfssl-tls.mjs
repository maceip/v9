/**
 * E2E test: wolfSSL TLS handshake through gvisor virtual network.
 *
 * Prerequisites (started by this script or manually):
 *   1. Node.js TLS echo server on :4434 (self-signed cert)
 *   2. v9-net on :8765 (no port forwarding needed — outbound NAT)
 *   3. Dev server on :8080
 *
 * Test flow:
 *   Browser → tls.connect(192.168.127.254:4434)
 *     → wolfSSL Wasm does TLS handshake
 *     → gvisor TCP → NAT → host localhost:4434
 *     → Node TLS server sends "HELLO_FROM_TLS_SERVER"
 *     → browser receives decrypted data
 */

import { chromium } from 'playwright';

const TIMEOUT = 30_000;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  let pass = 0, fail = 0;

  const pageLogs = [];
  page.on('console', msg => pageLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageLogs.push(`[pageerror] ${err.message}`));

  try {
    console.log('1. Loading TLS test page...');
    await page.goto(
      'http://localhost:8080/tests/test-wolfssl-tls.html?ws=ws://localhost:8765&host=192.168.127.254&port=4434',
      { waitUntil: 'domcontentloaded', timeout: 15000 },
    );

    console.log('2. Waiting for TLS test to complete...');
    await page.waitForFunction(
      () => document.getElementById('log')?.textContent?.includes('[done]'),
      { timeout: TIMEOUT },
    );

    const logText = await page.evaluate(() => document.getElementById('log')?.textContent || '');
    console.log('\n── Browser logs ──');
    console.log(logText);
    console.log('──────────────────\n');

    // Check results
    if (logText.includes('TLS handshake complete')) {
      console.log('✓ TLS handshake completed');
      pass++;
    } else {
      console.log('✗ TLS handshake did NOT complete');
      fail++;
    }

    if (logText.includes('HELLO_FROM_TLS_SERVER')) {
      console.log('✓ Received decrypted data from TLS server');
      pass++;
    } else {
      console.log('✗ Did NOT receive decrypted data');
      fail++;
    }

    if (logText.includes('echo:hello from browser TLS')) {
      console.log('✓ TLS server echoed browser data back');
      pass++;
    } else {
      console.log('✗ TLS echo NOT received');
      fail++;
    }

  } catch (err) {
    console.error('Test error:', err.message);
    fail++;
  } finally {
    console.log(`\n══ TLS Test Results: ${pass} passed, ${fail} failed ══`);
    if (pageLogs.length) {
      console.log('\nAll page console output:');
      for (const l of pageLogs) console.log('  ', l);
    }
    await browser.close();
    process.exit(fail > 0 ? 1 : 0);
  }
}

main();
