import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const repoRoot = process.cwd();
const profileDir = path.resolve(
  repoRoot,
  process.env.EDGE_BROWSER_PROFILE_DIR || '.tmp/chrome-user-data',
);
const startUrl =
  process.argv[2] ||
  process.env.EDGE_BROWSER_START_URL ||
  'http://localhost:8080/web/index.html?bundle=/dist/claude-code-cli.js';
const remoteDebuggingPort = process.env.EDGE_BROWSER_REMOTE_DEBUG_PORT || '9223';

fs.mkdirSync(profileDir, { recursive: true });

const context = await chromium.launchPersistentContext(profileDir, {
  channel: 'chrome',
  headless: false,
  args: [`--remote-debugging-port=${remoteDebuggingPort}`],
});

const existingPage =
  context.pages().find(page => !page.isClosed()) || (await context.newPage());

await existingPage.goto(startUrl, {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});

console.log(`PROFILE_DIR=${profileDir}`);
console.log(`START_URL=${startUrl}`);
console.log(`REMOTE_DEBUGGING_PORT=${remoteDebuggingPort}`);
console.log('Persistent Chrome is running. Close the window or stop this process to exit.');

const shutdown = async () => {
  try {
    await context.close();
  } catch {}
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await new Promise(() => {});
