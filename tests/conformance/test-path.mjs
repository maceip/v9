import { createHarness } from './_harness.mjs';
import { loadPathModule, printConformanceTarget } from './_targets.mjs';

const { test, assertEq, assertDeepEq, finish } = createHarness('Conformance: path');

printConformanceTarget('path');
const { path } = await loadPathModule();

test('join() handles simple and parent-segment joins', () => {
  assertEq(path.join('/a', 'b', 'c'), '/a/b/c');
  assertEq(path.join('/a', '../b'), '/b');
});

test('resolve() resolves relative paths from cwd and absolute anchors', () => {
  const previousCwd = process.cwd();
  process.chdir('/');
  try {
    assertEq(path.resolve('a', 'b'), '/a/b');
    assertEq(path.resolve('/a', 'b'), '/a/b');
  } finally {
    process.chdir(previousCwd);
  }
});

test('dirname() and basename() follow POSIX behavior', () => {
  assertEq(path.dirname('/a/b/c'), '/a/b');
  assertEq(path.basename('/a/b/c.js'), 'c.js');
  assertEq(path.basename('/a/b/c.js', '.js'), 'c');
});

test('extname() handles standard and edge cases', () => {
  assertEq(path.extname('file.txt'), '.txt');
  assertEq(path.extname('file'), '');
  assertEq(path.extname('.hidden'), '');
});

test('isAbsolute() distinguishes absolute and relative paths', () => {
  assertEq(path.isAbsolute('/a'), true);
  assertEq(path.isAbsolute('a'), false);
});

test('relative() computes path delta between two absolute paths', () => {
  assertEq(path.relative('/a/b', '/a/c'), '../c');
});

test('parse() decomposes path components', () => {
  assertDeepEq(path.parse('/a/b/c.js'), {
    root: '/',
    dir: '/a/b',
    base: 'c.js',
    ext: '.js',
    name: 'c',
  });
});

test('format() composes path components', () => {
  assertEq(path.format({ dir: '/a', base: 'b.js' }), '/a/b.js');
});

test('sep and delimiter expose POSIX separators', () => {
  assertEq(path.sep, '/');
  assertEq(path.delimiter, ':');
});

finish();
