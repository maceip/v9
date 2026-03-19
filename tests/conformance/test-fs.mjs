import { createHarness } from './_harness.mjs';
import { loadFsModule, printConformanceTarget } from './_targets.mjs';

const { test, testAsync, assert, assertEq, assertDeepEq, assertThrows, finish } =
  createHarness('Conformance: fs');

printConformanceTarget('fs');
const { fs } = await loadFsModule();

// ─── writeFile / readFile ────────────────────────────────────────────

test('writeFileSync + readFileSync roundtrip (utf8 string)', () => {
  fs.writeFileSync('/tmp/hello.txt', 'hello world');
  const data = fs.readFileSync('/tmp/hello.txt', 'utf8');
  assertEq(data, 'hello world');
});

test('readFileSync without encoding returns Buffer', () => {
  fs.writeFileSync('/tmp/buf.txt', 'abc');
  const data = fs.readFileSync('/tmp/buf.txt');
  assert(data instanceof Uint8Array, 'should return Buffer/Uint8Array');
  assertEq(data.length, 3);
});

test('writeFileSync overwrites existing file', () => {
  fs.writeFileSync('/tmp/over.txt', 'first');
  fs.writeFileSync('/tmp/over.txt', 'second');
  assertEq(fs.readFileSync('/tmp/over.txt', 'utf8'), 'second');
});

// ─── readdir ─────────────────────────────────────────────────────────

test('readdirSync returns array of names (not full paths)', () => {
  fs.mkdirSync('/tmp/rd', { recursive: true });
  fs.writeFileSync('/tmp/rd/a.txt', 'a');
  fs.writeFileSync('/tmp/rd/b.txt', 'b');
  const names = fs.readdirSync('/tmp/rd').sort();
  assertDeepEq(names, ['a.txt', 'b.txt']);
});

test('readdirSync does not include . or ..', () => {
  const names = fs.readdirSync('/tmp/rd');
  assert(!names.includes('.'), 'should not include .');
  assert(!names.includes('..'), 'should not include ..');
});

test('readdirSync with withFileTypes returns Dirent objects', () => {
  const entries = fs.readdirSync('/tmp/rd', { withFileTypes: true });
  assert(entries.length >= 2, 'should have at least 2 entries');
  const first = entries[0];
  assert(typeof first.name === 'string', 'Dirent should have name');
  assert(typeof first.isFile === 'function', 'Dirent should have isFile()');
  assert(typeof first.isDirectory === 'function', 'Dirent should have isDirectory()');
  assert(first.isFile(), 'a.txt should be a file');
  assert(!first.isDirectory(), 'a.txt should not be a directory');
});

test('readdirSync on file throws ENOTDIR', () => {
  const err = assertThrows(() => fs.readdirSync('/tmp/hello.txt'));
  assertEq(err.code, 'ENOTDIR');
});

// ─── stat ────────────────────────────────────────────────────────────

test('statSync returns Stats with correct shape', () => {
  fs.writeFileSync('/tmp/st.txt', 'hello');
  const stats = fs.statSync('/tmp/st.txt');
  assert(typeof stats.isFile === 'function', 'should have isFile()');
  assert(typeof stats.isDirectory === 'function', 'should have isDirectory()');
  assert(stats.isFile(), 'should be a file');
  assert(!stats.isDirectory(), 'should not be a directory');
  assertEq(stats.size, 5);
  assert(stats.mtime instanceof Date, 'mtime should be a Date');
  assert(typeof stats.mode === 'number', 'mode should be a number');
});

test('statSync on directory returns isDirectory() true', () => {
  fs.mkdirSync('/tmp/stdir', { recursive: true });
  const stats = fs.statSync('/tmp/stdir');
  assert(stats.isDirectory(), 'should be a directory');
  assert(!stats.isFile(), 'should not be a file');
});

test('statSync on missing path throws ENOENT', () => {
  const err = assertThrows(() => fs.statSync('/tmp/nonexistent'));
  assertEq(err.code, 'ENOENT');
});

// ─── mkdir ───────────────────────────────────────────────────────────

test('mkdirSync creates directory', () => {
  const dir = `/tmp/newdir_${Date.now()}`;
  fs.mkdirSync(dir);
  assert(fs.statSync(dir).isDirectory());
});

test('mkdirSync recursive creates intermediate dirs', () => {
  fs.mkdirSync('/tmp/a/b/c', { recursive: true });
  assert(fs.statSync('/tmp/a/b/c').isDirectory());
});

test('mkdirSync recursive on existing dir succeeds silently', () => {
  fs.mkdirSync('/tmp/a/b/c', { recursive: true }); // should not throw
  assert(fs.statSync('/tmp/a/b/c').isDirectory());
});

test('mkdirSync without recursive on missing parent throws ENOENT', () => {
  const err = assertThrows(() => fs.mkdirSync('/tmp/x/y/z'));
  assert(err.code === 'ENOENT' || err.code === 'ENOTDIR',
    `expected ENOENT or ENOTDIR, got ${err.code}`);
});

// ─── unlink ──────────────────────────────────────────────────────────

test('unlinkSync deletes a file', () => {
  fs.writeFileSync('/tmp/del.txt', 'bye');
  fs.unlinkSync('/tmp/del.txt');
  const err = assertThrows(() => fs.statSync('/tmp/del.txt'));
  assertEq(err.code, 'ENOENT');
});

test('unlinkSync on missing file throws ENOENT', () => {
  const err = assertThrows(() => fs.unlinkSync('/tmp/no_such_file'));
  assertEq(err.code, 'ENOENT');
});

test('unlinkSync on directory throws EISDIR or EPERM', () => {
  const dir = `/tmp/cantdel_${Date.now()}`;
  fs.mkdirSync(dir, { recursive: true });
  const err = assertThrows(() => fs.unlinkSync(dir));
  assert(err.code === 'EISDIR' || err.code === 'EPERM',
    `expected EISDIR or EPERM, got ${err.code}`);
});

// ─── rename ──────────────────────────────────────────────────────────

test('renameSync moves a file', () => {
  fs.writeFileSync('/tmp/ren_old.txt', 'data');
  fs.renameSync('/tmp/ren_old.txt', '/tmp/ren_new.txt');
  assertEq(fs.readFileSync('/tmp/ren_new.txt', 'utf8'), 'data');
  const err = assertThrows(() => fs.statSync('/tmp/ren_old.txt'));
  assertEq(err.code, 'ENOENT');
});

test('renameSync overwrites existing target', () => {
  fs.writeFileSync('/tmp/ren_a.txt', 'aaa');
  fs.writeFileSync('/tmp/ren_b.txt', 'bbb');
  fs.renameSync('/tmp/ren_a.txt', '/tmp/ren_b.txt');
  assertEq(fs.readFileSync('/tmp/ren_b.txt', 'utf8'), 'aaa');
});

// ─── existsSync ──────────────────────────────────────────────────────

test('existsSync returns true for existing file', () => {
  fs.writeFileSync('/tmp/ex.txt', 'x');
  assertEq(fs.existsSync('/tmp/ex.txt'), true);
});

test('existsSync returns false for missing path (never throws)', () => {
  assertEq(fs.existsSync('/tmp/totally_missing_path'), false);
});

// ─── error shape ─────────────────────────────────────────────────────

test('fs errors have code, errno, syscall, path properties', () => {
  let err;
  try {
    fs.readFileSync('/no/such/file');
  } catch (e) {
    err = e;
  }
  assert(err, 'should have thrown');
  assertEq(err.code, 'ENOENT');
  assert(typeof err.errno === 'number', `errno should be number, got ${typeof err.errno}`);
  assert(typeof err.syscall === 'string', `syscall should be string, got ${typeof err.syscall}`);
  assert(typeof err.path === 'string', `path should be string, got ${typeof err.path}`);
  assert(err.message.includes('ENOENT'), `message should include ENOENT, got: ${err.message}`);
});

// ─── fs.promises ─────────────────────────────────────────────────────

await testAsync('fs.promises.writeFile + readFile roundtrip', async () => {
  assert(fs.promises, 'fs.promises should exist');
  await fs.promises.writeFile('/tmp/prom.txt', 'async data');
  const data = await fs.promises.readFile('/tmp/prom.txt', 'utf8');
  assertEq(data, 'async data');
});

await testAsync('fs.promises.stat returns Stats', async () => {
  const stats = await fs.promises.stat('/tmp/prom.txt');
  assert(stats.isFile(), 'should be a file');
  assertEq(stats.size, 10);
});

await testAsync('fs.promises.readdir returns names', async () => {
  const names = await fs.promises.readdir('/tmp/rd');
  assert(Array.isArray(names), 'should return array');
  assert(names.length >= 2, 'should have at least 2 entries');
});

await testAsync('fs.promises.unlink removes file', async () => {
  await fs.promises.writeFile('/tmp/prom_del.txt', 'x');
  await fs.promises.unlink('/tmp/prom_del.txt');
  assertEq(fs.existsSync('/tmp/prom_del.txt'), false);
});

// ─── stress ──────────────────────────────────────────────────────────

test('stress: create 1000 files, read, stat, delete', () => {
  const dir = '/tmp/stress';
  fs.mkdirSync(dir, { recursive: true });
  const start = Date.now();

  // Create
  for (let i = 0; i < 1000; i++) {
    fs.writeFileSync(`${dir}/f${i}.txt`, `content-${i}`);
  }

  // Read all
  for (let i = 0; i < 1000; i++) {
    const data = fs.readFileSync(`${dir}/f${i}.txt`, 'utf8');
    if (i === 0) assertEq(data, 'content-0');
    if (i === 999) assertEq(data, 'content-999');
  }

  // Stat all
  for (let i = 0; i < 1000; i++) {
    const s = fs.statSync(`${dir}/f${i}.txt`);
    assert(s.isFile());
  }

  // Delete all
  for (let i = 0; i < 1000; i++) {
    fs.unlinkSync(`${dir}/f${i}.txt`);
  }

  const elapsed = Date.now() - start;
  console.log(`    (1000 files: create/read/stat/delete in ${elapsed}ms)`);
  assertEq(fs.readdirSync(dir).length, 0);
});

finish();
