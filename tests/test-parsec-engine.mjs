import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { createParsecEngine } from '../parsec-engine/index.mjs';

console.log('=== Parsec Engine Tests ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  PASS: ${name}`);
      passed++;
    })
    .catch((error) => {
      console.log(`  FAIL: ${name} — ${error.message}`);
      failed++;
    });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

async function main() {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), 'parsec-engine-test-'));
  const stageRoot = path.join(sandbox, 'stages');
  const outputRoot = path.join(sandbox, 'outputs');
  const engine = createParsecEngine({ stageRoot });

  await test('raw-js input creates optimized blob', async () => {
    const appDir = path.join(sandbox, 'raw-app');
    await mkdir(path.join(appDir, 'src'), { recursive: true });
    await writeFile(path.join(appDir, 'package.json'), JSON.stringify({ main: 'src/index.js' }), 'utf8');
    await writeFile(
      path.join(appDir, 'src/index.js'),
      [
        "import { join } from 'node:path';",
        "console.log(join('/tmp', 'x'));",
      ].join('\n'),
      'utf8',
    );

    const metadata = await engine.run(
      { type: 'raw-js', input: appDir },
      { outputDir: path.join(outputRoot, 'raw') },
    );
    assert(existsSync(metadata.stage1.bundle.outputFile), 'optimized blob should exist');
    assert(metadata.stage1.analysis.nodeBuiltinsUsed.includes('path'), 'analysis should detect node:path usage');
  });

  await test('zip input is unpacked and bundled', async () => {
    const zipPath = path.join(sandbox, 'app.zip');
    const zipData = zipSync({
      'package.json': strToU8(JSON.stringify({ main: 'index.js' })),
      'index.js': strToU8("console.log('zip-app');"),
    });
    await writeFile(zipPath, Buffer.from(zipData));

    const metadata = await engine.run(
      { type: 'zip', input: zipPath },
      { outputDir: path.join(outputRoot, 'zip') },
    );
    assert(existsSync(metadata.stage1.bundle.outputFile), 'zip bundle output should exist');
  });

  await test('npm input supports local package path via npm pack', async () => {
    const pkgDir = path.join(sandbox, 'npm-local-pkg');
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'local-parsec-pkg', version: '1.0.0', main: 'index.js' }),
      'utf8',
    );
    await writeFile(path.join(pkgDir, 'index.js'), "console.log('npm-local');", 'utf8');

    const metadata = await engine.run(
      { type: 'npm', input: pkgDir },
      { outputDir: path.join(outputRoot, 'npm') },
    );
    const bundle = await readFile(metadata.stage1.bundle.outputFile, 'utf8');
    assert(bundle.includes('npm-local'), 'npm package bundle should contain source code');
  });

  await test('github input starts and completes wasm lift planning', async () => {
    const repoDir = path.join(sandbox, 'repo-mixed');
    await mkdir(path.join(repoDir, 'src'), { recursive: true });
    await writeFile(path.join(repoDir, 'Cargo.toml'), '[package]\nname="demo"\nversion="0.1.0"\n', 'utf8');
    await writeFile(path.join(repoDir, 'src/main.rs'), 'fn main() { println!("hi"); }', 'utf8');
    await writeFile(path.join(repoDir, 'package.json'), JSON.stringify({ main: 'index.js' }), 'utf8');
    await writeFile(path.join(repoDir, 'index.js'), "require('node:child_process'); console.log('repo');", 'utf8');

    const metadata = await engine.run(
      { type: 'github', input: repoDir },
      { outputDir: path.join(outputRoot, 'github'), waitForStage2: true, stage2TimeoutMs: 30_000 },
    );

    assert(metadata.stage2 && metadata.stage2.status === 'completed', 'stage2 task should complete');
    const candidates = metadata.stage2.result?.candidates || [];
    assert(candidates.some((candidate) => candidate.language === 'rust'), 'rust should be detected as wasm candidate');
    const helpers = metadata.stage2.result?.helperWasm || [];
    assert(helpers.some((helper) => helper.id === 'proc-control'), 'helper wasm should include proc-control');
  });

  await rm(sandbox, { recursive: true, force: true });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

