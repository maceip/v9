/**
 * End-to-end test for v9-net gvisor integration.
 *
 * Prerequisites (run in separate terminals):
 *   1. cmd/v9-net/v9-net -listen-ws -p 3000:3000 -p 3001:3001 -debug :8765
 *   2. node scripts/dev-server.mjs
 *
 * This test:
 *   - Opens a browser page with the v9 import map + polyfills
 *   - Sets NODEJS_GVISOR_WS_URL and creates an http.createServer on port 3000
 *   - Attempts to curl localhost:3000 from the host side
 *   - Also creates a raw net.createServer TCP echo on port 3001
 *   - Attempts a raw TCP test via netcat
 */

import { chromium } from 'playwright';
import { execSync } from 'child_process';

const TIMEOUT = 30_000;

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  let pass = 0, fail = 0;

  const pageLogs = [];
  page.on('console', msg => pageLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageLogs.push(`[pageerror] ${err.message}`));

  try {
    // ── Load test page ────────────────────────────────────────────
    console.log('1. Loading test page in browser...');
    await page.goto('http://localhost:8080/tests/test-v9-net-e2e.html?ws=ws://localhost:8765&port=3000&tcpPort=3001', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    // Wait for "[ready]" in the page log
    console.log('2. Waiting for server to start in browser...');
    await page.waitForFunction(
      () => document.getElementById('log')?.textContent?.includes('[ready]'),
      { timeout: TIMEOUT },
    );

    // Give gvisor TCP listener a moment to register
    await page.waitForTimeout(2000);

    // Dump browser logs so far
    const logText = await page.evaluate(() => document.getElementById('log')?.textContent || '');
    console.log('\n── Browser logs ──');
    console.log(logText);
    console.log('──────────────────\n');

    // ── Test 1: HTTP createServer via curl ─────────────────────────
    console.log('3. Testing HTTP server: curl localhost:3000 ...');
    let httpResult = '';
    try {
      httpResult = execSync('curl -s --max-time 5 http://localhost:3000/hello', {
        encoding: 'utf-8',
      });
      console.log('   Response:', httpResult.trim());
      if (httpResult.includes('"ok":true') && httpResult.includes('v9-in-browser')) {
        console.log('   ✓ HTTP createServer PASS');
        pass++;
      } else {
        console.log('   ✗ HTTP createServer FAIL — unexpected response');
        fail++;
      }
    } catch (err) {
      console.log('   ✗ HTTP createServer FAIL —', err.message?.split('\n')[0]);
      fail++;
    }

    // ── Test 2: Raw TCP net.createServer via netcat ────────────────
    console.log('4. Testing TCP echo server: netcat localhost:3001 ...');
    try {
      const tcpResult = execSync(
        'echo "hello from host" | nc -w 3 localhost 3001',
        { encoding: 'utf-8', timeout: 8000 },
      );
      console.log('   Response:', tcpResult.trim());
      if (tcpResult.includes('echo: hello from host')) {
        console.log('   ✓ TCP net.createServer PASS');
        pass++;
      } else {
        console.log('   ✗ TCP net.createServer FAIL — unexpected response');
        fail++;
      }
    } catch (err) {
      console.log('   ✗ TCP net.createServer FAIL —', err.message?.split('\n')[0]);
      fail++;
    }

    // ── Test 3: Outbound http.request with forbidden headers ──────
    console.log('5. Waiting for outbound http.request header test...');
    try {
      await page.waitForFunction(
        () => document.getElementById('log')?.textContent?.includes('[outbound-done]'),
        { timeout: 15000 },
      );
      const outLog = await page.evaluate(() => document.getElementById('log')?.textContent || '');
      const hostMatch = outLog.match(/\[outbound\] host=(.+)/);
      const uaMatch = outLog.match(/\[outbound\] user-agent=(.+)/);
      const cookieMatch = outLog.match(/\[outbound\] cookie=(.+)/);
      const customMatch = outLog.match(/\[outbound\] x-custom=(.+)/);

      const hostOk = hostMatch && hostMatch[1].trim() === 'custom-host.example.com';
      const uaOk = uaMatch && uaMatch[1].trim() === 'v9-net-test/1.0';
      const cookieOk = cookieMatch && cookieMatch[1].trim() === 'session=abc123';
      const customOk = customMatch && customMatch[1].trim() === 'preserved';

      console.log('   Host:', hostMatch?.[1]?.trim(), hostOk ? '✓' : '✗');
      console.log('   User-Agent:', uaMatch?.[1]?.trim(), uaOk ? '✓' : '✗');
      console.log('   Cookie:', cookieMatch?.[1]?.trim(), cookieOk ? '✓' : '✗');
      console.log('   X-Custom:', customMatch?.[1]?.trim(), customOk ? '✓' : '✗');

      if (hostOk && uaOk && cookieOk && customOk) {
        console.log('   ✓ Forbidden headers PASS — all survived gvisor TCP path');
        pass++;
      } else {
        console.log('   ✗ Forbidden headers FAIL — some headers stripped');
        fail++;
      }
    } catch (err) {
      console.log('   ✗ Forbidden headers FAIL —', err.message?.split('\n')[0]);
      fail++;
    }

    // ── Check browser received the requests ───────────────────────
    await page.waitForTimeout(1000);
    const finalLog = await page.evaluate(() => document.getElementById('log')?.textContent || '');
    console.log('\n── Final browser logs ──');
    console.log(finalLog);
    console.log('────────────────────────\n');

    if (finalLog.includes('[server] GET /hello')) {
      console.log('   ✓ Browser saw HTTP request');
      pass++;
    } else {
      console.log('   ✗ Browser did NOT see HTTP request');
      fail++;
    }

  } catch (err) {
    console.error('Test error:', err.message);
    fail++;
  } finally {
    console.log(`\n══ Results: ${pass} passed, ${fail} failed ══`);
    if (pageLogs.length) {
      console.log('\nAll page console output:');
      for (const l of pageLogs) console.log('  ', l);
    }
    await browser.close();
    process.exit(fail > 0 ? 1 : 0);
  }
}

main();
