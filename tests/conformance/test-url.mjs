import { createHarness } from './_harness.mjs';
import { loadUrlModule, printConformanceTarget } from './_targets.mjs';

const { test, assertEq, assert, finish } = createHarness('Conformance: url');

printConformanceTarget('url');
const { url } = await loadUrlModule();

test('URL constructor creates expected URL object', () => {
  const value = new url.URL('http://host/path?q=1#hash');
  assertEq(value.protocol, 'http:');
  assertEq(value.hostname, 'host');
  assertEq(value.pathname, '/path');
  assertEq(value.search, '?q=1');
  assertEq(value.hash, '#hash');
});

test('url.parse() returns parsed URL fields', () => {
  const parsed = url.parse('http://host:8080/path?q=1#hash');
  assert(parsed && typeof parsed === 'object', 'parse() should return an object');
  assertEq(parsed.protocol, 'http:');
  assertEq(parsed.hostname, 'host');
  assertEq(parsed.port, '8080');
  assertEq(parsed.pathname, '/path');

  if ('query' in parsed) {
    assertEq(parsed.query, 'q=1');
    assertEq(parsed.hash, '#hash');
  } else {
    assertEq(parsed.search, '?q=1');
    assertEq(parsed.hash, '#hash');
  }
});

test('fileURLToPath() converts file URL into local path', () => {
  const converted = url.fileURLToPath('file:///tmp/a%20b.txt');
  assertEq(converted, '/tmp/a b.txt');
});

test('pathToFileURL() converts path into encoded file URL', () => {
  const converted = String(url.pathToFileURL('/tmp/a b.txt'));
  assertEq(converted, 'file:///tmp/a%20b.txt');
});

finish();
