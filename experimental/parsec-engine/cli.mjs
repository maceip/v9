#!/usr/bin/env node

import path from 'node:path';
import { createParsecEngine } from './index.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i++;
  }
  return args;
}

function usage() {
  console.log([
    'Parsec engine CLI',
    '',
    'Usage:',
    '  node experimental/parsec-engine/cli.mjs --type <npm|raw-js|zip|github> --input <value> [options]',
    '',
    'Options:',
    '  --entry <path>           Preferred entry file path inside source tree',
    '  --output <dir>           Output directory for packaged artifact',
    '  --stage-root <dir>       Root directory for job staging',
    '  --wait-stage2            Wait for github wasm lift task to finish',
    '  --stage2-timeout-ms <n>  Wait timeout when --wait-stage2 is set',
    '  --json                   Print only JSON result',
  ].join('\n'));
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.h || !args.type || !args.input) {
    usage();
    process.exit(args.help || args.h ? 0 : 1);
  }

  const engine = createParsecEngine({
    stageRoot: args['stage-root'] ? path.resolve(String(args['stage-root'])) : undefined,
  });

  const metadata = await engine.run(
    {
      type: String(args.type),
      input: String(args.input),
      entry: args.entry ? String(args.entry) : undefined,
    },
    {
      outputDir: args.output ? path.resolve(String(args.output)) : undefined,
      waitForStage2: Boolean(args['wait-stage2']),
      stage2TimeoutMs: args['stage2-timeout-ms'] ? Number(args['stage2-timeout-ms']) : undefined,
    },
  );

  if (args.json) {
    console.log(JSON.stringify(metadata, null, 2));
    return;
  }

  console.log('Parsec job complete.');
  console.log(`- jobId: ${metadata.jobId}`);
  console.log(`- inputType: ${metadata.inputType}`);
  console.log(`- entry: ${metadata.stage1.entryPath}`);
  console.log(`- bundle: ${metadata.stage1.bundle.outputFile}`);
  if (metadata.stage2) {
    console.log(`- stage2 task: ${metadata.stage2.taskId || metadata.stage2.id} (${metadata.stage2.status})`);
  }
}

main().catch((error) => {
  console.error(`Parsec engine failed: ${error.message}`);
  process.exit(1);
});

