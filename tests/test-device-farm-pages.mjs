/**
 * E2E test: load live GitHub Pages site via AWS Device Farm browser.
 *
 * Verifies the v9-net probe, env vars, and gvisor stack initialization
 * on the actual deployed site — not localhost.
 *
 * Usage:
 *   node tests/test-device-farm-pages.mjs
 *
 * Requires: AWS credentials with Device Farm access.
 */

import https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Route through egress proxy if set
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxyUrl) {
  const agent = new HttpsProxyAgent(proxyUrl);
  const origReq = https.request;
  https.request = function (u, o, c) {
    if (typeof u === 'object' && !c) u.agent = agent;
    else if (typeof o === 'object') o.agent = agent;
    return origReq.call(this, u, o, c);
  };
}

const { Builder, Browser, logging } = await import('selenium-webdriver');

const GRID_ARN = 'arn:aws:devicefarm:us-west-2:095713295645:testgrid-project:9b4c3bf7-d728-4938-80a0-bb2b89e2fc45';
const PAGE_URL = process.env.V9_PAGES_URL || 'https://maceip.github.io/v9/web/v9-net-test.html';

// Create Device Farm session
async function createSession() {
  const { DeviceFarmClient, CreateTestGridUrlCommand } = await import('@aws-sdk/client-device-farm');
  const client = new DeviceFarmClient({ region: 'us-west-2' });
  const resp = await client.send(new CreateTestGridUrlCommand({
    projectArn: GRID_ARN,
    expiresInSeconds: 900,
  }));
  return resp.url;
}

// Fallback: use AWS CLI
async function createSessionCLI() {
  const { execSync } = await import('child_process');
  const env = { ...process.env, no_proxy: 'localhost,127.0.0.1,169.254.169.254', AWS_DEFAULT_REGION: 'us-west-2' };
  return execSync(
    `aws devicefarm create-test-grid-url --project-arn "${GRID_ARN}" --expires-in-seconds 900 --query 'url' --output text`,
    { encoding: 'utf-8', env },
  ).trim();
}

let sessionUrl;
try {
  sessionUrl = await createSession();
} catch {
  sessionUrl = await createSessionCLI();
}

console.log('Device Farm session created.');

const prefs = new logging.Preferences();
prefs.setLevel(logging.Type.BROWSER, logging.Level.ALL);

const driver = await new Builder()
  .usingServer(sessionUrl)
  .forBrowser(Browser.CHROME)
  .setLoggingPrefs(prefs)
  .build();

let pass = 0, fail = 0;

try {
  console.log(`Loading ${PAGE_URL} ...`);
  await driver.get(PAGE_URL);
  await driver.sleep(15000);

  const browserLogs = await driver.manage().logs().get(logging.Type.BROWSER);
  console.log('\n=== BROWSER CONSOLE LOGS ===');
  for (const e of browserLogs) {
    console.log(`[${e.level.name_}] ${e.message}`);
  }

  const env = await driver.executeScript(`
    return {
      gvisor: globalThis.process?.env?.NODEJS_GVISOR_WS_URL || 'NOT SET',
      relay: globalThis.process?.env?.NODEJS_IN_TAB_HTTP_RELAY || 'NOT SET',
      relayWs: globalThis.process?.env?.NODEJS_IN_TAB_HTTP_RELAY_WS || 'NOT SET',
      envKeys: Object.keys(globalThis.process?.env || {}).filter(k =>
        k.includes('GVISOR') || k.includes('RELAY') || k.includes('ANTHROPIC')
      ).join(', '),
    };
  `);

  console.log('\n=== ENV VARS ===');
  console.log(JSON.stringify(env, null, 2));

  // On Device Farm (no v9-net running), gvisor should be NOT SET
  // and relay should be restored
  if (env.gvisor === 'NOT SET') {
    console.log('✓ NODEJS_GVISOR_WS_URL correctly NOT SET (no v9-net on Device Farm)');
    pass++;
  } else {
    console.log('✗ NODEJS_GVISOR_WS_URL unexpectedly set: ' + env.gvisor);
    fail++;
  }

  // Check that probe ran
  const probeRan = browserLogs.some(e => e.message.includes('v9-net:probe'));
  if (probeRan) {
    console.log('✓ v9-net probe executed');
    pass++;
  } else {
    console.log('✗ v9-net probe did NOT execute');
    fail++;
  }

  // Check no page errors
  const pageErrors = browserLogs.filter(e =>
    e.message.includes('pageerror') ||
    (e.level.name_ === 'SEVERE' && e.message.includes('stream.push'))
  );
  if (pageErrors.length === 0) {
    console.log('✓ No stream errors');
    pass++;
  } else {
    console.log(`✗ ${pageErrors.length} stream error(s)`);
    fail++;
  }

} catch (err) {
  console.error('Test error:', err.message);
  fail++;
} finally {
  await driver.quit();
  console.log(`\n══ Device Farm Test: ${pass} passed, ${fail} failed ══`);
  process.exit(fail > 0 ? 1 : 0);
}
