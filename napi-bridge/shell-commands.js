/**
 * Shell command shims — MEMFS-backed implementations of common Unix commands.
 *
 * Each shim: (args, options) → { stdout, stderr, exitCode }
 */

import { defaultMemfs } from './memfs.js';
import * as fs from './fs.js';

const _decoder = new TextDecoder('utf-8');
const _encoder = new TextEncoder();

function normalizePath(p) {
  if (typeof p !== 'string' || p.length === 0) return '/';
  // Handle relative paths using cwd
  if (!p.startsWith('/')) {
    const cwd = typeof process !== 'undefined' ? process.cwd() : '/';
    p = cwd.replace(/\/$/, '') + '/' + p;
  }
  const parts = p.split('/').filter(Boolean);
  const result = [];
  for (const part of parts) {
    if (part === '..') result.pop();
    else if (part !== '.') result.push(part);
  }
  return '/' + result.join('/');
}

function readFileText(path) {
  const data = defaultMemfs.readFile(path);
  return _decoder.decode(data);
}

function fileExists(path) {
  return defaultMemfs.exists(path);
}

function statFile(path) {
  return defaultMemfs.stat(path);
}

function isDir(path) {
  try {
    const s = defaultMemfs.stat(path);
    return s.isDirectory();
  } catch { return false; }
}

function isFile(path) {
  try {
    const s = defaultMemfs.stat(path);
    return s.isFile();
  } catch { return false; }
}

// ─── ls ──────────────────────────────────────────────────────────────

function ls(args) {
  let showAll = false, longFormat = false, recursive = false, onePerLine = false;
  const paths = [];

  for (const arg of args) {
    if (arg.startsWith('-') && !arg.startsWith('--')) {
      if (arg.includes('a')) showAll = true;
      if (arg.includes('l')) longFormat = true;
      if (arg.includes('R')) recursive = true;
      if (arg.includes('1')) onePerLine = true;
    } else {
      paths.push(arg);
    }
  }

  if (paths.length === 0) paths.push('.');

  const output = [];

  for (const p of paths) {
    const resolved = normalizePath(p);
    if (!fileExists(resolved)) {
      return { stdout: '', stderr: `ls: cannot access '${p}': No such file or directory\n`, exitCode: 1 };
    }
    if (isFile(resolved)) {
      output.push(resolved.split('/').pop());
      continue;
    }
    const entries = defaultMemfs.readdir(resolved);
    const filtered = showAll ? entries : entries.filter(e => !e.startsWith('.'));
    if (longFormat) {
      for (const name of filtered) {
        const full = resolved === '/' ? '/' + name : resolved + '/' + name;
        try {
          const s = defaultMemfs.stat(full);
          const type = s.isDirectory() ? 'd' : '-';
          output.push(`${type}rwxr-xr-x 1 user user ${s.size || 0} Jan  1 00:00 ${name}`);
        } catch {
          output.push(name);
        }
      }
    } else {
      output.push(filtered.join('\n'));
    }
  }

  return { stdout: output.join('\n') + '\n', stderr: '', exitCode: 0 };
}

// ─── cat ─────────────────────────────────────────────────────────────

function cat(args) {
  const paths = args.filter(a => !a.startsWith('-'));
  if (paths.length === 0) return { stdout: '', stderr: '', exitCode: 0 };

  const output = [];
  for (const p of paths) {
    const resolved = normalizePath(p);
    try {
      output.push(readFileText(resolved));
    } catch {
      return { stdout: '', stderr: `cat: ${p}: No such file or directory\n`, exitCode: 1 };
    }
  }
  return { stdout: output.join(''), stderr: '', exitCode: 0 };
}

// ─── grep ────────────────────────────────────────────────────────────

function grep(args, options) {
  let recursive = false, lineNumbers = false, ignoreCase = false;
  let listFiles = false, countOnly = false, invertMatch = false;
  let pattern = null;
  const paths = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-') && !pattern) {
      if (arg.includes('r') || arg.includes('R')) recursive = true;
      if (arg.includes('n')) lineNumbers = true;
      if (arg.includes('i')) ignoreCase = true;
      if (arg.includes('l')) listFiles = true;
      if (arg.includes('c')) countOnly = true;
      if (arg.includes('v')) invertMatch = true;
    } else if (pattern === null) {
      pattern = arg;
    } else {
      paths.push(arg);
    }
  }

  if (!pattern) return { stdout: '', stderr: 'grep: missing pattern\n', exitCode: 2 };

  const flags = ignoreCase ? 'i' : '';
  let re;
  try {
    re = new RegExp(pattern, flags);
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  }

  const results = [];
  const stdinData = options && options._stdin;

  function searchFile(filePath, displayPath) {
    let text;
    try {
      text = readFileText(filePath);
    } catch { return; }
    const lines = text.split('\n');
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
      const match = re.test(lines[i]);
      if (match !== invertMatch) {
        count++;
        if (!countOnly && !listFiles) {
          const prefix = paths.length > 1 ? displayPath + ':' : '';
          const ln = lineNumbers ? `${i + 1}:` : '';
          results.push(`${prefix}${ln}${lines[i]}`);
        }
      }
    }
    if (listFiles && count > 0) results.push(displayPath);
    if (countOnly) results.push(paths.length > 1 ? `${displayPath}:${count}` : `${count}`);
  }

  if (stdinData) {
    // grep from piped stdin
    const lines = stdinData.split('\n');
    for (const line of lines) {
      const match = re.test(line);
      if (match !== invertMatch) {
        results.push(line);
      }
    }
  } else if (paths.length === 0) {
    return { stdout: '', stderr: 'grep: no input files\n', exitCode: 2 };
  } else {
    for (const p of paths) {
      const resolved = normalizePath(p);
      if (recursive && isDir(resolved)) {
        walkDir(resolved, (filePath) => {
          searchFile(filePath, filePath);
        });
      } else {
        searchFile(resolved, p);
      }
    }
  }

  if (results.length === 0) return { stdout: '', stderr: '', exitCode: 1 };
  return { stdout: results.join('\n') + '\n', stderr: '', exitCode: 0 };
}

function walkDir(dirPath, callback) {
  let entries;
  try { entries = defaultMemfs.readdir(dirPath); } catch { return; }
  for (const name of entries) {
    const full = dirPath === '/' ? '/' + name : dirPath + '/' + name;
    if (isDir(full)) {
      walkDir(full, callback);
    } else {
      callback(full);
    }
  }
}

// ─── find ────────────────────────────────────────────────────────────

function find(args) {
  let startPath = '.';
  let namePattern = null;
  let typeFilter = null;
  let maxDepth = Infinity;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-name' && i + 1 < args.length) {
      namePattern = args[++i];
    } else if (args[i] === '-type' && i + 1 < args.length) {
      typeFilter = args[++i];
    } else if (args[i] === '-maxdepth' && i + 1 < args.length) {
      maxDepth = parseInt(args[++i], 10);
    } else if (!args[i].startsWith('-')) {
      startPath = args[i];
    }
  }

  const resolved = normalizePath(startPath);
  const results = [];

  function matchName(name) {
    if (!namePattern) return true;
    // Convert glob to regex: *.txt -> ^.*\.txt$
    const re = new RegExp('^' + namePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return re.test(name);
  }

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try { entries = defaultMemfs.readdir(dir); } catch { return; }
    for (const name of entries) {
      const full = dir === '/' ? '/' + name : dir + '/' + name;
      const isDirectory = isDir(full);
      const type = isDirectory ? 'd' : 'f';

      if ((!typeFilter || typeFilter === type) && matchName(name)) {
        results.push(full);
      }
      if (isDirectory) {
        walk(full, depth + 1);
      }
    }
  }

  // Include the start directory itself if no name filter
  if (!namePattern && (!typeFilter || typeFilter === 'd')) {
    results.push(resolved);
  }
  walk(resolved, 1);

  return { stdout: results.join('\n') + '\n', stderr: '', exitCode: 0 };
}

// ─── head ────────────────────────────────────────────────────────────

function head(args, options) {
  let n = 10;
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n' && i + 1 < args.length) {
      n = parseInt(args[++i], 10);
    } else if (!args[i].startsWith('-')) {
      paths.push(args[i]);
    }
  }

  let text;
  if (options && options._stdin) {
    text = options._stdin;
  } else if (paths.length > 0) {
    try { text = readFileText(normalizePath(paths[0])); }
    catch { return { stdout: '', stderr: `head: cannot open '${paths[0]}'\n`, exitCode: 1 }; }
  } else {
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  const lines = text.split('\n');
  return { stdout: lines.slice(0, n).join('\n') + (lines.length > n ? '\n' : ''), stderr: '', exitCode: 0 };
}

// ─── tail ────────────────────────────────────────────────────────────

function tail(args, options) {
  let n = 10;
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n' && i + 1 < args.length) {
      n = parseInt(args[++i], 10);
    } else if (!args[i].startsWith('-')) {
      paths.push(args[i]);
    }
  }

  let text;
  if (options && options._stdin) {
    text = options._stdin;
  } else if (paths.length > 0) {
    try { text = readFileText(normalizePath(paths[0])); }
    catch { return { stdout: '', stderr: `tail: cannot open '${paths[0]}'\n`, exitCode: 1 }; }
  } else {
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  const lines = text.split('\n');
  // Remove trailing empty line from split
  if (lines[lines.length - 1] === '') lines.pop();
  return { stdout: lines.slice(-n).join('\n') + '\n', stderr: '', exitCode: 0 };
}

// ─── echo ────────────────────────────────────────────────────────────

function echo(args) {
  let noNewline = false;
  let startIdx = 0;
  if (args[0] === '-n') { noNewline = true; startIdx = 1; }
  else if (args[0] === '-e') { startIdx = 1; }

  const text = args.slice(startIdx).join(' ');
  return { stdout: text + (noNewline ? '' : '\n'), stderr: '', exitCode: 0 };
}

// ─── pwd ─────────────────────────────────────────────────────────────

function pwd() {
  const cwd = typeof process !== 'undefined' ? process.cwd() : '/';
  return { stdout: cwd + '\n', stderr: '', exitCode: 0 };
}

// ─── mkdir ───────────────────────────────────────────────────────────

function mkdir(args) {
  let recursive = false;
  const paths = [];
  for (const arg of args) {
    if (arg === '-p') recursive = true;
    else paths.push(arg);
  }
  for (const p of paths) {
    try { defaultMemfs.mkdir(normalizePath(p), recursive); }
    catch (e) { return { stdout: '', stderr: `mkdir: ${e.message}\n`, exitCode: 1 }; }
  }
  return { stdout: '', stderr: '', exitCode: 0 };
}

// ─── rm ──────────────────────────────────────────────────────────────

function rm(args) {
  let force = false, recursive = false;
  const paths = [];
  for (const arg of args) {
    if (arg.startsWith('-')) {
      if (arg.includes('f')) force = true;
      if (arg.includes('r') || arg.includes('R')) recursive = true;
    } else {
      paths.push(arg);
    }
  }

  for (const p of paths) {
    const resolved = normalizePath(p);
    try {
      if (isDir(resolved)) {
        if (!recursive) return { stdout: '', stderr: `rm: cannot remove '${p}': Is a directory\n`, exitCode: 1 };
        rmRecursive(resolved);
      } else {
        defaultMemfs.unlink(resolved);
      }
    } catch (e) {
      if (!force) return { stdout: '', stderr: `rm: ${e.message}\n`, exitCode: 1 };
    }
  }
  return { stdout: '', stderr: '', exitCode: 0 };
}

function rmRecursive(dirPath) {
  const entries = defaultMemfs.readdir(dirPath);
  for (const name of entries) {
    const full = dirPath === '/' ? '/' + name : dirPath + '/' + name;
    if (isDir(full)) rmRecursive(full);
    else defaultMemfs.unlink(full);
  }
  // Remove the dir itself - use the parent approach
  const parts = dirPath.split('/').filter(Boolean);
  const name = parts.pop();
  const parent = '/' + parts.join('/');
  const parentInode = defaultMemfs._resolve(parent || '/');
  if (parentInode) parentInode.children.delete(name);
}

// ─── cp ──────────────────────────────────────────────────────────────

function cp(args) {
  let recursive = false;
  const paths = [];
  for (const arg of args) {
    if (arg.startsWith('-') && arg.includes('r')) recursive = true;
    else paths.push(arg);
  }
  if (paths.length < 2) return { stdout: '', stderr: 'cp: missing operand\n', exitCode: 1 };
  const src = normalizePath(paths[0]);
  const dest = normalizePath(paths[1]);
  try {
    cpRecursive(src, dest, recursive);
  } catch (e) {
    return { stdout: '', stderr: `cp: ${e.message}\n`, exitCode: 1 };
  }
  return { stdout: '', stderr: '', exitCode: 0 };
}

function cpRecursive(src, dest, recursive) {
  if (isDir(src)) {
    if (!recursive) throw new Error(`-r not specified; omitting directory '${src}'`);
    defaultMemfs.mkdir(dest, true);
    const entries = defaultMemfs.readdir(src);
    for (const name of entries) {
      cpRecursive(src + '/' + name, dest + '/' + name, true);
    }
  } else {
    const data = defaultMemfs.readFile(src);
    defaultMemfs.writeFile(dest, data);
  }
}

// ─── mv ──────────────────────────────────────────────────────────────

function mv(args) {
  const paths = args.filter(a => !a.startsWith('-'));
  if (paths.length < 2) return { stdout: '', stderr: 'mv: missing operand\n', exitCode: 1 };
  try {
    defaultMemfs.rename(normalizePath(paths[0]), normalizePath(paths[1]));
  } catch (e) {
    return { stdout: '', stderr: `mv: ${e.message}\n`, exitCode: 1 };
  }
  return { stdout: '', stderr: '', exitCode: 0 };
}

// ─── touch ───────────────────────────────────────────────────────────

function touch(args) {
  const paths = args.filter(a => !a.startsWith('-'));
  for (const p of paths) {
    const resolved = normalizePath(p);
    if (!fileExists(resolved)) {
      defaultMemfs.writeFile(resolved, new Uint8Array(0));
    }
    // Update mtime if it exists
  }
  return { stdout: '', stderr: '', exitCode: 0 };
}

// ─── wc ──────────────────────────────────────────────────────────────

function wc(args, options) {
  let countLines = false, countWords = false, countChars = false;
  const paths = [];
  for (const arg of args) {
    if (arg.startsWith('-')) {
      if (arg.includes('l')) countLines = true;
      if (arg.includes('w')) countWords = true;
      if (arg.includes('c')) countChars = true;
    } else {
      paths.push(arg);
    }
  }
  if (!countLines && !countWords && !countChars) {
    countLines = countWords = countChars = true;
  }

  let text;
  if (options && options._stdin) {
    text = options._stdin;
  } else if (paths.length > 0) {
    try { text = readFileText(normalizePath(paths[0])); }
    catch { return { stdout: '', stderr: `wc: cannot open '${paths[0]}'\n`, exitCode: 1 }; }
  } else {
    return { stdout: '0\n', stderr: '', exitCode: 0 };
  }

  const parts = [];
  if (countLines) parts.push(text.split('\n').length - 1);
  if (countWords) parts.push(text.trim().split(/\s+/).filter(Boolean).length);
  if (countChars) parts.push(_encoder.encode(text).length);

  return { stdout: parts.join(' ') + '\n', stderr: '', exitCode: 0 };
}

// ─── sort ────────────────────────────────────────────────────────────

function sort(args, options) {
  let reverse = false, numeric = false;
  const paths = [];
  for (const arg of args) {
    if (arg.startsWith('-')) {
      if (arg.includes('r')) reverse = true;
      if (arg.includes('n')) numeric = true;
    } else {
      paths.push(arg);
    }
  }

  let text;
  if (options && options._stdin) {
    text = options._stdin;
  } else if (paths.length > 0) {
    try { text = readFileText(normalizePath(paths[0])); }
    catch { return { stdout: '', stderr: `sort: cannot open '${paths[0]}'\n`, exitCode: 1 }; }
  } else {
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  let lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();

  if (numeric) lines.sort((a, b) => parseFloat(a) - parseFloat(b));
  else lines.sort();
  if (reverse) lines.reverse();

  return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
}

// ─── uniq ────────────────────────────────────────────────────────────

function uniq(args, options) {
  const paths = args.filter(a => !a.startsWith('-'));

  let text;
  if (options && options._stdin) {
    text = options._stdin;
  } else if (paths.length > 0) {
    try { text = readFileText(normalizePath(paths[0])); }
    catch { return { stdout: '', stderr: `uniq: cannot open '${paths[0]}'\n`, exitCode: 1 }; }
  } else {
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  const lines = text.split('\n');
  const result = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] !== lines[i - 1]) result.push(lines[i]);
  }

  return { stdout: result.join('\n'), stderr: '', exitCode: 0 };
}

// ─── tr ──────────────────────────────────────────────────────────────

function tr(args, options) {
  if (args.length < 2) return { stdout: '', stderr: 'tr: missing operand\n', exitCode: 1 };
  const from = args[0];
  const to = args[1];
  const text = (options && options._stdin) || '';
  let result = text;
  for (let i = 0; i < from.length && i < to.length; i++) {
    result = result.split(from[i]).join(to[i]);
  }
  return { stdout: result, stderr: '', exitCode: 0 };
}

// ─── basename / dirname ──────────────────────────────────────────────

function basename(args) {
  if (args.length === 0) return { stdout: '\n', stderr: '', exitCode: 0 };
  const p = args[0];
  const parts = p.split('/').filter(Boolean);
  return { stdout: (parts[parts.length - 1] || '/') + '\n', stderr: '', exitCode: 0 };
}

function dirname(args) {
  if (args.length === 0) return { stdout: '.\n', stderr: '', exitCode: 0 };
  const p = args[0];
  const idx = p.lastIndexOf('/');
  if (idx <= 0) return { stdout: (idx === 0 ? '/' : '.') + '\n', stderr: '', exitCode: 0 };
  return { stdout: p.substring(0, idx) + '\n', stderr: '', exitCode: 0 };
}

// ─── env ─────────────────────────────────────────────────────────────

function env() {
  const entries = typeof process !== 'undefined' && process.env ? process.env : {};
  const lines = Object.entries(entries).map(([k, v]) => `${k}=${v}`);
  return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
}

// ─── cd ──────────────────────────────────────────────────────────────

function cd(args) {
  const dir = args[0] || '/';
  if (typeof process !== 'undefined' && process.chdir) {
    try { process.chdir(normalizePath(dir)); }
    catch { return { stdout: '', stderr: `cd: ${dir}: No such file or directory\n`, exitCode: 1 }; }
  }
  return { stdout: '', stderr: '', exitCode: 0 };
}

// ─── true / false / exit ─────────────────────────────────────────────

function trueCmd() { return { stdout: '', stderr: '', exitCode: 0 }; }
function falseCmd() { return { stdout: '', stderr: '', exitCode: 1 }; }

function exitCmd(args) {
  const code = args.length > 0 ? parseInt(args[0], 10) : 0;
  return { stdout: '', stderr: '', exitCode: isNaN(code) ? 1 : code };
}

// ─── test / [ ────────────────────────────────────────────────────────

function testCmd(args) {
  // Minimal: -f file, -d dir, -e exists, -z string, -n string
  if (args.length === 0) return { stdout: '', stderr: '', exitCode: 1 };
  // Remove trailing ] for [ command
  const a = args[args.length - 1] === ']' ? args.slice(0, -1) : args;

  if (a.length === 2) {
    if (a[0] === '-f') return { stdout: '', stderr: '', exitCode: isFile(normalizePath(a[1])) ? 0 : 1 };
    if (a[0] === '-d') return { stdout: '', stderr: '', exitCode: isDir(normalizePath(a[1])) ? 0 : 1 };
    if (a[0] === '-e') return { stdout: '', stderr: '', exitCode: fileExists(normalizePath(a[1])) ? 0 : 1 };
    if (a[0] === '-z') return { stdout: '', stderr: '', exitCode: a[1].length === 0 ? 0 : 1 };
    if (a[0] === '-n') return { stdout: '', stderr: '', exitCode: a[1].length > 0 ? 0 : 1 };
  }
  if (a.length === 3 && a[1] === '=') {
    return { stdout: '', stderr: '', exitCode: a[0] === a[2] ? 0 : 1 };
  }

  return { stdout: '', stderr: '', exitCode: 1 };
}

// ─── Registry ────────────────────────────────────────────────────────

export const commands = {
  ls, cat, grep, find, head, tail, echo, pwd, mkdir, rm, cp, mv, touch,
  wc, sort, uniq, tr, basename, dirname, env, cd,
  'true': trueCmd, 'false': falseCmd, exit: exitCmd,
  test: testCmd, '[': testCmd,
};

export function hasCommand(name) {
  return name in commands;
}

export function runCommand(name, args, options) {
  const fn = commands[name];
  if (!fn) return null;
  return fn(args, options);
}
