#!/usr/bin/env node
/**
 * Unit tests for shell tab completion.
 */

import { createShell } from '../napi-bridge/shell.js';
import { setMemfs, getMemfs } from '../napi-bridge/shell-commands.js';
import { createFilesystem } from '../napi-bridge/memfs.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error(`  FAIL: ${msg}`);
    failed++;
  } else {
    console.log(`  PASS: ${msg}`);
    passed++;
  }
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

// Set up a fresh memfs with some test files/dirs
const memfs = createFilesystem();
memfs.mkdir('/workspace', true);
memfs.mkdir('/workspace/src', true);
memfs.mkdir('/workspace/scripts', true);
memfs.writeFile('/workspace/readme.md', 'hello');
memfs.writeFile('/workspace/package.json', '{}');
memfs.writeFile('/workspace/src/index.js', '');
memfs.writeFile('/workspace/src/utils.js', '');
setMemfs(memfs);

// ─── Test 1: Command completion with unique match ───

console.log('\nTest 1: Single command completion (ec → echo)');
{
  let output = '';
  const shell = createShell({ write: (s) => { output += s; }, cwd: '/workspace' });
  // Type "ec" then tab
  shell.feed('ec\t');
  // After tab, line should be "echo " (completed + trailing space)
  // The output should contain "echo " written
  assert(output.includes('echo '), `output should contain "echo ", got: "${stripAnsi(output)}"`);
}

// ─── Test 2: Command completion with multiple matches ───

console.log('\nTest 2: Multiple command completions (c → cat, cp, cd, ...)');
{
  let output = '';
  const shell = createShell({ write: (s) => { output += s; }, cwd: '/workspace' });
  shell.feed('c\t');
  const clean = stripAnsi(output);
  // Should display multiple matches
  assert(clean.includes('cat'), `output should list "cat", got: "${clean}"`);
  assert(clean.includes('cp'), `output should list "cp", got: "${clean}"`);
  assert(clean.includes('cd'), `output should list "cd", got: "${clean}"`);
}

// ─── Test 3: File completion with unique match ───

console.log('\nTest 3: Single file completion (cat read → cat readme.md)');
{
  let output = '';
  const shell = createShell({ write: (s) => { output += s; }, cwd: '/workspace' });
  shell.feed('cat read\t');
  const clean = stripAnsi(output);
  assert(clean.includes('readme.md'), `output should contain "readme.md", got: "${clean}"`);
}

// ─── Test 4: Directory gets / suffix ───

console.log('\nTest 4: Directory completion appends /');
{
  let output = '';
  const shell = createShell({ write: (s) => { output += s; }, cwd: '/workspace' });
  // "ls sr" should complete to "ls src/"
  shell.feed('ls sr\t');
  const clean = stripAnsi(output);
  assert(clean.includes('src/'), `output should contain "src/", got: "${clean}"`);
}

// ─── Test 5: File completion with multiple matches ───

console.log('\nTest 5: Multiple file completions (ls s → src/, scripts/)');
{
  let output = '';
  const shell = createShell({ write: (s) => { output += s; }, cwd: '/workspace' });
  shell.feed('ls s\t');
  const clean = stripAnsi(output);
  assert(clean.includes('src/'), `output should list "src/", got: "${clean}"`);
  assert(clean.includes('scripts/'), `output should list "scripts/", got: "${clean}"`);
}

// ─── Test 6: No match does nothing ───

console.log('\nTest 6: No matches — no output beyond typed text');
{
  let output = '';
  const shell = createShell({ write: (s) => { output += s; }, cwd: '/workspace' });
  shell.feed('cat zzz\t');
  const clean = stripAnsi(output);
  // Should just have what was typed, no extra output
  assert(!clean.includes('\r\n'), `no newline output expected for no matches, got: "${clean}"`);
}

// ─── Test 7: Empty prefix command completion ───

console.log('\nTest 7: Tab with empty line shows all commands');
{
  let output = '';
  const shell = createShell({ write: (s) => { output += s; }, cwd: '/workspace' });
  shell.feed('\t');
  const clean = stripAnsi(output);
  // Should list many commands
  assert(clean.includes('ls'), `output should contain "ls", got: "${clean}"`);
  assert(clean.includes('echo'), `output should contain "echo", got: "${clean}"`);
}

// ─── Test 8: File completion with path prefix ───

console.log('\nTest 8: File completion with path (ls src/in → ls src/index.js)');
{
  let output = '';
  const shell = createShell({ write: (s) => { output += s; }, cwd: '/workspace' });
  shell.feed('ls src/in\t');
  const clean = stripAnsi(output);
  assert(clean.includes('src/index.js'), `output should contain "src/index.js", got: "${clean}"`);
}

// ─── Summary ───

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
