#!/usr/bin/env node

import { spawn } from 'node:child_process';

const raw = process.argv.slice(2);

function usage() {
  console.error(
    'Usage: node scripts/run-with-env.mjs KEY=VALUE [KEY2=VALUE2 ...] path/to/script.mjs [args...]',
  );
}

if (raw.length < 2) {
  usage();
  process.exit(1);
}

const extraEnv = {};
let i = 0;
for (; i < raw.length; i++) {
  const a = raw[i];
  const eq = a.indexOf('=');
  if (eq > 0 && eq < a.length) {
    const key = a.slice(0, eq);
    if (key && !key.startsWith('-')) {
      extraEnv[key] = a.slice(eq + 1);
      continue;
    }
  }
  break;
}

const scriptPath = raw[i];
const scriptArgs = raw.slice(i + 1);

if (!scriptPath || Object.keys(extraEnv).length === 0) {
  usage();
  process.exit(1);
}

const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ...extraEnv,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
