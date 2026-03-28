#!/usr/bin/env node

import { spawn } from 'node:child_process';

const [, , envArg, scriptPath, ...scriptArgs] = process.argv;

if (!envArg || !scriptPath || !envArg.includes('=')) {
  console.error('Usage: node scripts/run-with-env.mjs KEY=VALUE path/to/script.mjs [args...]');
  process.exit(1);
}

const splitIndex = envArg.indexOf('=');
const key = envArg.slice(0, splitIndex);
const value = envArg.slice(splitIndex + 1);

const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
  stdio: 'inherit',
  env: {
    ...process.env,
    [key]: value,
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
