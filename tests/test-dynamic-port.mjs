/**
 * E2E test: browser creates a TCP echo server on a random port,
 * host connects via localhost and verifies round-trip.
 *
 * This tests dynamic port forwarding end-to-end:
 *   1. Browser picks a random port via net.createServer()
 *   2. GvisorServer.listen() tells v9-net to open that port
 *   3. Playwright reads the port from the page
 *   4. Host connects via netcat and verifies echo
 */

import { chromium } from 'playwright';
import { execSync } from 'child_process';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  let pass = 0, fail = 0;

  const pageLogs = [];
  page.on('console', msg => pageLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => pageLogs.push(`[pageerror] ${err.message}`));

  try {
    console.log('1. Loading test page...');
    await page.goto('http://localhost:8080/tests/test-dynamic-port.html?ws=ws://localhost:8765', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });

    console.log('2. Waiting for server to start on random port...');
    await page.waitForFunction(
      () => document.getElementById('log')?.textContent?.includes('[listening]'),
      { timeout: 20000 },
    );

    // Extract the random port from the page
    const port = await page.evaluate(() => {
      const m = document.getElementById('log').textContent.match(/\[listening\] port=(\d+)/);
      return m ? parseInt(m[1], 10) : 0;
    });
    console.log(`   Browser listening on port ${port}`);

    if (!port) {
      console.log('   ✗ Could not get port from page');
      fail++;
    } else {
      // Wait for dynamic forward to establish
      await page.waitForTimeout(2000);

      // Connect from host and send data
      console.log(`3. Connecting from host: echo "ping" | nc localhost ${port}`);
      try {
        const result = execSync(
          `echo "ping" | nc -w 3 localhost ${port}`,
          { encoding: 'utf-8', timeout: 8000 },
        );
        console.log('   Response:', result.trim());
        if (result.includes('echo:ping')) {
          console.log('   ✓ Dynamic port echo PASS');
          pass++;
        } else {
          console.log('   ✗ Unexpected response');
          fail++;
        }
      } catch (err) {
        console.log('   ✗ Connection failed:', err.message?.split('\n')[0]);
        fail++;
      }

      // Check browser saw the connection
      await page.waitForTimeout(1000);
      const finalLog = await page.evaluate(() => document.getElementById('log')?.textContent || '');
      if (finalLog.includes('[connection]')) {
        console.log('   ✓ Browser saw incoming connection');
        pass++;
      } else {
        console.log('   ✗ Browser did NOT see connection');
        fail++;
      }
    }
  } catch (err) {
    console.error('Test error:', err.message);
    fail++;
  } finally {
    console.log(`\n══ Dynamic Port Test: ${pass} passed, ${fail} failed ══`);
    if (pageLogs.length) {
      console.log('\nPage console:');
      for (const l of pageLogs) console.log('  ', l);
    }
    await browser.close();
    process.exit(fail > 0 ? 1 : 0);
  }
}

main();
