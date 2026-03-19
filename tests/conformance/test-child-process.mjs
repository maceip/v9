import { createHarness } from './_harness.mjs';
import { getConformanceTargetMode, printConformanceTarget } from './_targets.mjs';

const mode = getConformanceTargetMode();
const { test, testAsync, assert, assertEq, assertDeepEq, assertThrows, finish } =
  createHarness('Conformance: child_process');

printConformanceTarget('child_process');

let cp, fs;
if (mode === 'node') {
  cp = await import('node:child_process');
  fs = (await import('node:fs')).default || await import('node:fs');
} else {
  cp = await import('../../napi-bridge/child-process.js');
  const fsMod = await import('../../napi-bridge/fs.js');
  fs = fsMod.default || fsMod.fs || fsMod;
}

// ─── Module shape ────────────────────────────────────────────────────

test('child_process exports spawn, exec, execSync', () => {
  assert(typeof cp.spawn === 'function', 'spawn should be a function');
  assert(typeof cp.exec === 'function', 'exec should be a function');
  assert(typeof cp.execSync === 'function', 'execSync should be a function');
});

// ─── execSync ────────────────────────────────────────────────────────

test('execSync("echo hello") returns stdout', () => {
  const result = cp.execSync('echo hello', { encoding: 'utf8' });
  assert(result.trim() === 'hello', `expected 'hello', got '${result.trim()}'`);
});

test('execSync("pwd") returns current directory', () => {
  const result = cp.execSync('pwd', { encoding: 'utf8' });
  assert(typeof result === 'string' && result.trim().length > 0,
    'pwd should return non-empty string');
});

if (mode !== 'node') {
  // These tests only make sense against our MEMFS-backed shims

  test('execSync("ls /tmp") lists MEMFS directory', () => {
    fs.mkdirSync('/tmp/ls_test', { recursive: true });
    fs.writeFileSync('/tmp/ls_test/a.txt', 'a');
    fs.writeFileSync('/tmp/ls_test/b.txt', 'b');
    const result = cp.execSync('ls /tmp/ls_test', { encoding: 'utf8' });
    assert(result.includes('a.txt'), `should list a.txt, got: ${result}`);
    assert(result.includes('b.txt'), `should list b.txt, got: ${result}`);
  });

  test('execSync("cat /tmp/file") reads MEMFS file', () => {
    fs.writeFileSync('/tmp/cat_test.txt', 'file contents here');
    const result = cp.execSync('cat /tmp/cat_test.txt', { encoding: 'utf8' });
    assertEq(result.trim(), 'file contents here');
  });

  test('execSync("grep pattern /path") searches files', () => {
    fs.mkdirSync('/tmp/grep_test', { recursive: true });
    fs.writeFileSync('/tmp/grep_test/a.txt', 'hello world\nfoo bar\nhello again');
    const result = cp.execSync('grep hello /tmp/grep_test/a.txt', { encoding: 'utf8' });
    const lines = result.trim().split('\n');
    assertEq(lines.length, 2);
    assert(lines[0].includes('hello world'), 'should find first match');
    assert(lines[1].includes('hello again'), 'should find second match');
  });

  test('execSync("head -n 2 /path") returns first N lines', () => {
    fs.writeFileSync('/tmp/head_test.txt', 'line1\nline2\nline3\nline4');
    const result = cp.execSync('head -n 2 /tmp/head_test.txt', { encoding: 'utf8' });
    const lines = result.trim().split('\n');
    assertEq(lines.length, 2);
    assertEq(lines[0], 'line1');
    assertEq(lines[1], 'line2');
  });

  test('execSync("find /path -name *.txt") finds files', () => {
    fs.mkdirSync('/tmp/find_test/sub', { recursive: true });
    fs.writeFileSync('/tmp/find_test/a.txt', '');
    fs.writeFileSync('/tmp/find_test/b.js', '');
    fs.writeFileSync('/tmp/find_test/sub/c.txt', '');
    const result = cp.execSync('find /tmp/find_test -name *.txt', { encoding: 'utf8' });
    assert(result.includes('a.txt'), 'should find a.txt');
    assert(result.includes('c.txt'), 'should find c.txt');
    assert(!result.includes('b.js'), 'should not find b.js');
  });

  test('execSync pipe: echo hello | grep hello', () => {
    const result = cp.execSync('echo hello | grep hello', { encoding: 'utf8' });
    assert(result.trim() === 'hello', `pipe should work, got: ${result.trim()}`);
  });

  test('execSync redirect: echo data > /tmp/redir.txt', () => {
    cp.execSync('echo data > /tmp/redir.txt');
    const content = fs.readFileSync('/tmp/redir.txt', 'utf8');
    assertEq(content.trim(), 'data');
  });
}

// ─── spawn ───────────────────────────────────────────────────────────

await testAsync('spawn returns ChildProcess with stdout/stderr/exit', async () => {
  const child = cp.spawn('echo', ['hello']);

  const stdout = [];
  child.stdout.on('data', (chunk) => stdout.push(String(chunk)));

  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code));
    // Some implementations may need close instead of exit
    child.on('close', (code) => resolve(code));
  });

  assertEq(exitCode, 0);
  assert(stdout.join('').trim() === 'hello', `stdout should be hello, got: ${stdout.join('').trim()}`);
});

await testAsync('spawn emits error for nonexistent command', async () => {
  const child = cp.spawn('nonexistent_command_12345', []);

  await new Promise((resolve) => {
    child.on('error', (err) => {
      assert(err, 'should receive error');
      resolve();
    });
    // Some implementations exit with non-zero instead of error
    child.on('exit', (code) => {
      if (code !== 0) resolve();
    });
  });
});

// ─── exec ────────────────────────────────────────────────────────────

await testAsync('exec calls callback with stdout', async () => {
  const { stdout } = await new Promise((resolve, reject) => {
    cp.exec('echo hello', (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });

  assert(stdout.trim() === 'hello', `stdout should be hello, got: ${stdout.trim()}`);
});

// ─── execSync error handling ─────────────────────────────────────────

test('execSync throws on non-zero exit code', () => {
  let threw = false;
  try {
    cp.execSync('exit 1', { encoding: 'utf8' });
  } catch (err) {
    threw = true;
    assert(err.status === 1 || err.code === 1,
      `exit code should be 1, got status=${err.status} code=${err.code}`);
  }
  assert(threw, 'execSync should throw on non-zero exit');
});

finish();
