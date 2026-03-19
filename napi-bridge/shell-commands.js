/**
 * Shell command shims — MEMFS-backed implementations of common Unix commands.
 *
 * Each shim: (args, options) → { stdout, stderr, exitCode }
 */

import { defaultMemfs } from './memfs.js';
import fsModule from './fs.js';

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
    if (part === '..') { if (result.length > 0) result.pop(); }
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

  function lsDir(resolved, label) {
    if (!fileExists(resolved)) {
      output.push(`ls: cannot access '${label}': No such file or directory`);
      return false;
    }
    if (isFile(resolved)) {
      output.push(resolved.split('/').pop());
      return true;
    }
    const entries = defaultMemfs.readdir(resolved);
    const filtered = showAll ? entries : entries.filter(e => !e.startsWith('.'));

    if (recursive && output.length > 0) output.push('');
    if (recursive) output.push(resolved + ':');

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

    // Bug #5: Implement recursive walk for ls -R
    if (recursive) {
      for (const name of filtered) {
        const full = resolved === '/' ? '/' + name : resolved + '/' + name;
        if (isDir(full)) {
          lsDir(full, full);
        }
      }
    }
    return true;
  }

  for (const p of paths) {
    const resolved = normalizePath(p);
    if (!lsDir(resolved, p)) {
      return { stdout: '', stderr: `ls: cannot access '${p}': No such file or directory\n`, exitCode: 1 };
    }
  }

  return { stdout: output.join('\n') + '\n', stderr: '', exitCode: 0 };
}

// ─── cat ─────────────────────────────────────────────────────────────

function cat(args, options) {
  const paths = args.filter(a => !a.startsWith('-'));
  // Bug #15: cat with no args reads from stdin
  if (paths.length === 0) {
    const stdinData = (options && options._stdin) || '';
    return { stdout: stdinData, stderr: '', exitCode: 0 };
  }

  // H6: Continue on missing files (like real cat), report all errors
  const output = [];
  const errors = [];
  let exitCode = 0;
  for (const p of paths) {
    const resolved = normalizePath(p);
    try {
      output.push(readFileText(resolved));
    } catch {
      errors.push(`cat: ${p}: No such file or directory`);
      exitCode = 1;
    }
  }
  return { stdout: output.join(''), stderr: errors.length ? errors.join('\n') + '\n' : '', exitCode };
}

// ─── grep ────────────────────────────────────────────────────────────

function grep(args, options) {
  let recursive = false, lineNumbers = false, ignoreCase = false;
  let listFiles = false, countOnly = false, invertMatch = false;
  let pattern = null;
  const paths = [];
  let dashdash = false;

  // Bug #19: Parse flags regardless of position (before --)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') { dashdash = true; continue; }
    if (!dashdash && arg.startsWith('-') && arg.length > 1 && !/^-\d/.test(arg)) {
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
          // M11: Show filename prefix for multiple files OR recursive mode
          const prefix = (paths.length > 1 || recursive) ? displayPath + ':' : '';
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

// Bug #20: Use public MEMFS API instead of private _resolve()
function rmRecursive(dirPath) {
  const entries = defaultMemfs.readdir(dirPath);
  for (const name of entries) {
    const full = dirPath === '/' ? '/' + name : dirPath + '/' + name;
    if (isDir(full)) rmRecursive(full);
    else defaultMemfs.unlink(full);
  }
  // Remove the now-empty directory via public rmdir-like unlink
  // MEMFS doesn't have rmdir, so use the fs module's rmdirSync
  try { fsModule.rmdirSync(dirPath); } catch { /* ignore */ }
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
  let dest = normalizePath(paths[1]);
  // M13: If dest is an existing directory, copy src inside it
  if (isDir(dest)) {
    const srcName = src.split('/').filter(Boolean).pop();
    dest = dest === '/' ? '/' + srcName : dest + '/' + srcName;
  }
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

// M6: Use public API only — read+write to update mtime instead of private _resolve
function touch(args) {
  const paths = args.filter(a => !a.startsWith('-'));
  for (const p of paths) {
    const resolved = normalizePath(p);
    if (!fileExists(resolved)) {
      defaultMemfs.writeFile(resolved, new Uint8Array(0));
    } else {
      // Re-write existing content to update mtime via public writeFile
      try {
        const existing = defaultMemfs.readFile(resolved);
        defaultMemfs.writeFile(resolved, existing);
      } catch { /* ignore: e.g. directories */ }
    }
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
  // H1: wc -l counts newline characters, not lines
  if (countLines) {
    let count = 0;
    for (let i = 0; i < text.length; i++) { if (text[i] === '\n') count++; }
    parts.push(count);
  }
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

  // M3: sort -n treats non-numeric lines as 0 (POSIX behavior)
  if (numeric) lines.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
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

// M2: tr supports escape sequences (\n, \t, \\) and character ranges (a-z)
function _expandTrSet(s) {
  let result = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      const next = s[i + 1];
      if (next === 'n') { result += '\n'; i++; }
      else if (next === 't') { result += '\t'; i++; }
      else if (next === 'r') { result += '\r'; i++; }
      else if (next === '\\') { result += '\\'; i++; }
      else { result += s[i]; }
    } else if (i + 2 < s.length && s[i + 1] === '-') {
      // Character range: a-z
      const start = s.charCodeAt(i);
      const end = s.charCodeAt(i + 2);
      for (let c = start; c <= end; c++) result += String.fromCharCode(c);
      i += 2;
    } else {
      result += s[i];
    }
  }
  return result;
}

function tr(args, options) {
  if (args.length < 2) return { stdout: '', stderr: 'tr: missing operand\n', exitCode: 1 };
  const from = _expandTrSet(args[0]);
  const to = _expandTrSet(args[1]);
  const text = (options && options._stdin) || '';
  // Build translation map for O(n) performance
  const map = new Map();
  for (let i = 0; i < from.length; i++) {
    map.set(from[i], i < to.length ? to[i] : to[to.length - 1] || '');
  }
  let result = '';
  for (const ch of text) {
    result += map.has(ch) ? map.get(ch) : ch;
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

// ─── rg (ripgrep) ───────────────────────────────────────────────────
// Subtask 15: Translate ripgrep flags to our grep shim.

const _RG_TYPE_MAP = {
  js: ['.js', '.mjs', '.cjs', '.jsx'],
  ts: ['.ts', '.mts', '.cts', '.tsx'],
  py: ['.py', '.pyi'],
  rust: ['.rs'],
  go: ['.go'],
  java: ['.java'],
  c: ['.c', '.h'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.hxx', '.h'],
  css: ['.css', '.scss', '.less'],
  html: ['.html', '.htm'],
  json: ['.json'],
  md: ['.md', '.markdown'],
  yaml: ['.yaml', '.yml'],
  xml: ['.xml'],
  sh: ['.sh', '.bash', '.zsh'],
  ruby: ['.rb'],
  php: ['.php'],
  swift: ['.swift'],
  kotlin: ['.kt', '.kts'],
  lua: ['.lua'],
  toml: ['.toml'],
};

function rg(args, options) {
  // Parse rg-specific flags and translate to grep
  let pattern = null;
  let fixedStrings = false;
  let ignoreCase = false;
  let lineNumbers = true; // rg default
  let listFiles = false;
  let countOnly = false;
  let wordBound = false;
  let jsonOutput = false;
  let hidden = false;
  let noIgnore = false;
  let typeList = false;
  let typeFilters = []; // extension filters from -t
  let globFilters = []; // glob filters from -g
  const paths = [];
  let invertMatch = false;
  let maxCount = Infinity;
  let contextBefore = 0;
  let contextAfter = 0;
  let noFilename = false;
  let withFilename = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--type-list') { typeList = true; continue; }
    if (arg === '--json') { jsonOutput = true; continue; }
    if (arg === '--hidden') { hidden = true; continue; }
    if (arg === '--no-ignore') { noIgnore = true; continue; }
    if (arg === '--no-heading') { continue; } // default
    if (arg === '--no-line-number' || arg === '-N') { lineNumbers = false; continue; }
    if (arg === '--line-number' || arg === '-n') { lineNumbers = true; continue; }
    if (arg === '--files-with-matches' || arg === '-l') { listFiles = true; continue; }
    if (arg === '--count' || arg === '-c') { countOnly = true; continue; }
    if (arg === '--fixed-strings' || arg === '-F') { fixedStrings = true; continue; }
    if (arg === '--ignore-case' || arg === '-i') { ignoreCase = true; continue; }
    if (arg === '--word-regexp' || arg === '-w') { wordBound = true; continue; }
    if (arg === '--invert-match' || arg === '-v') { invertMatch = true; continue; }
    if (arg === '--no-filename' || arg === '-I') { noFilename = true; continue; }
    if (arg === '--with-filename' || arg === '-H') { withFilename = true; continue; }
    if ((arg === '-t' || arg === '--type') && i + 1 < args.length) {
      const t = args[++i];
      if (_RG_TYPE_MAP[t]) typeFilters.push(..._RG_TYPE_MAP[t]);
      continue;
    }
    if ((arg === '-g' || arg === '--glob') && i + 1 < args.length) {
      globFilters.push(args[++i]);
      continue;
    }
    if ((arg === '-e' || arg === '--regexp') && i + 1 < args.length) {
      pattern = args[++i];
      continue;
    }
    if ((arg === '-m' || arg === '--max-count') && i + 1 < args.length) {
      maxCount = parseInt(args[++i], 10);
      continue;
    }
    if ((arg === '-B' || arg === '--before-context') && i + 1 < args.length) {
      contextBefore = parseInt(args[++i], 10);
      continue;
    }
    if ((arg === '-A' || arg === '--after-context') && i + 1 < args.length) {
      contextAfter = parseInt(args[++i], 10);
      continue;
    }
    if ((arg === '-C' || arg === '--context') && i + 1 < args.length) {
      contextBefore = contextAfter = parseInt(args[++i], 10);
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      // Compound short flags like -rn, -il
      for (const ch of arg.slice(1)) {
        if (ch === 'i') ignoreCase = true;
        else if (ch === 'l') listFiles = true;
        else if (ch === 'c') countOnly = true;
        else if (ch === 'n') lineNumbers = true;
        else if (ch === 'w') wordBound = true;
        else if (ch === 'v') invertMatch = true;
        else if (ch === 'F') fixedStrings = true;
      }
      continue;
    }
    // Positional: first is pattern, rest are paths
    if (pattern === null) pattern = arg;
    else paths.push(arg);
  }

  if (typeList) {
    const lines = Object.entries(_RG_TYPE_MAP).map(([name, exts]) => `${name}: ${exts.join(', ')}`);
    return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
  }

  if (!pattern) return { stdout: '', stderr: 'rg: no pattern given\n', exitCode: 2 };
  if (paths.length === 0) paths.push('.');

  // Build regex
  let reStr = fixedStrings ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern;
  if (wordBound) reStr = `\\b${reStr}\\b`;
  const flags = ignoreCase ? 'i' : '';
  let re;
  try { re = new RegExp(reStr, flags); } catch { re = new RegExp(reStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags); }

  const results = [];
  let matchCount = 0;

  // Parse .gitignore patterns from a given directory
  const _gitignoreCache = new Map();
  function _loadGitignore(dir) {
    if (_gitignoreCache.has(dir)) return _gitignoreCache.get(dir);
    let patterns = [];
    try {
      const content = readFileText(dir + '/.gitignore');
      patterns = content.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
    } catch { /* no .gitignore */ }
    _gitignoreCache.set(dir, patterns);
    return patterns;
  }

  function _isGitignored(filePath, searchRoot) {
    if (noIgnore) return false;
    // Check .gitignore in each ancestor directory up to searchRoot
    const parts = filePath.split('/');
    for (let depth = 1; depth < parts.length; depth++) {
      const dir = parts.slice(0, depth).join('/') || '/';
      if (dir.length < searchRoot.length) continue;
      const patterns = _loadGitignore(dir);
      const relPath = filePath.slice(dir.length + 1);
      const fileName = parts[parts.length - 1];
      for (const pat of patterns) {
        // Convert gitignore pattern to regex
        const negated = pat.startsWith('!');
        const raw = negated ? pat.slice(1) : pat;
        const reStr = raw
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*/g, '<<GLOBSTAR>>')
          .replace(/\*/g, '[^/]*')
          .replace(/\?/g, '[^/]')
          .replace(/<<GLOBSTAR>>/g, '.*');
        const reObj = new RegExp(
          raw.includes('/') ? ('^' + reStr + '(/|$)') : ('(^|/)' + reStr + '(/|$)')
        );
        if (reObj.test(relPath) || reObj.test(fileName)) {
          if (negated) return false; // un-ignore
          return true;
        }
      }
    }
    return false;
  }

  function _globToRegex(g) {
    // Convert glob pattern, supporting ** for directory crossing
    const reStr = g
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '<<GLOBSTAR>>')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/<<GLOBSTAR>>/g, '.*');
    return new RegExp('^' + reStr + '$');
  }

  function shouldIncludeFile(filePath, searchRoot) {
    if (typeFilters.length > 0) {
      const ext = filePath.substring(filePath.lastIndexOf('.'));
      if (!typeFilters.includes(ext)) return false;
    }
    if (globFilters.length > 0) {
      const name = filePath.split('/').pop();
      // Match against both filename and relative path
      const relPath = searchRoot ? filePath.slice(searchRoot.length + 1) : name;
      for (const g of globFilters) {
        if (g.startsWith('!')) {
          const negRe = _globToRegex(g.slice(1));
          if (negRe.test(name) || negRe.test(relPath)) return false;
        } else {
          const posRe = _globToRegex(g);
          if (!posRe.test(name) && !posRe.test(relPath)) return false;
        }
      }
    }
    // Check .gitignore
    if (searchRoot && _isGitignored(filePath, searchRoot)) return false;
    return true;
  }

  function searchFile(filePath, displayPath, searchRoot) {
    if (matchCount >= maxCount) return;
    if (!shouldIncludeFile(filePath, searchRoot)) return;
    let text;
    try { text = readFileText(filePath); } catch { return; }
    const lines = text.split('\n');
    let fileCount = 0;
    const fileMatches = [];
    // Track which lines to output (for context line support)
    const matchedLines = new Set();    // lines that matched the pattern
    const contextLines = new Set();    // context lines to display

    // First pass: find all matching lines
    for (let i = 0; i < lines.length; i++) {
      if (matchCount + fileCount >= maxCount) break;
      const match = re.test(lines[i]);
      if (match !== invertMatch) {
        fileCount++;
        matchedLines.add(i);
        // Mark context lines
        for (let b = Math.max(0, i - contextBefore); b < i; b++) contextLines.add(b);
        for (let a = i + 1; a <= Math.min(lines.length - 1, i + contextAfter); a++) contextLines.add(a);
      }
    }

    matchCount += fileCount;

    // Second pass: build output with context
    if (!countOnly && !listFiles && fileCount > 0) {
      const outputLines = new Set([...matchedLines, ...contextLines]);
      const sortedLines = [...outputLines].sort((a, b) => a - b);
      let prevLine = -2; // track for separator insertion
      let absOffset = 0; // track byte offsets for JSON
      // Precompute byte offsets per line for JSON output
      const lineOffsets = [];
      if (jsonOutput) {
        let off = 0;
        for (let i = 0; i < lines.length; i++) {
          lineOffsets.push(off);
          off += lines[i].length + 1; // +1 for newline
        }
      }

      for (const i of sortedLines) {
        // Insert separator between non-contiguous context groups
        if (prevLine >= 0 && i > prevLine + 1) {
          if (jsonOutput) {
            // no separator in JSON mode per ripgrep spec
          } else {
            fileMatches.push('--');
          }
        }
        prevLine = i;

        const isMatch = matchedLines.has(i);
        if (jsonOutput && isMatch) {
          // Compute correct submatch offsets
          const submatches = [];
          const reG = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
          let m;
          while ((m = reG.exec(lines[i])) !== null) {
            submatches.push({ match: { text: m[0] }, start: m.index, end: m.index + m[0].length });
            if (!reG.global) break;
          }
          if (submatches.length === 0) {
            // Fallback if regex didn't match (shouldn't happen)
            submatches.push({ match: { text: '' }, start: 0, end: 0 });
          }
          fileMatches.push(JSON.stringify({
            type: 'match',
            data: {
              path: { text: displayPath },
              lines: { text: lines[i] + '\n' },
              line_number: i + 1,
              absolute_offset: lineOffsets[i],
              submatches,
            },
          }));
        } else if (jsonOutput && !isMatch) {
          fileMatches.push(JSON.stringify({
            type: 'context',
            data: {
              path: { text: displayPath },
              lines: { text: lines[i] + '\n' },
              line_number: i + 1,
              absolute_offset: lineOffsets[i],
              submatches: [],
            },
          }));
        } else {
          const prefix = (paths.length > 1 || withFilename) && !noFilename ? displayPath + ':' : '';
          const sep = isMatch ? ':' : '-';
          const ln = lineNumbers ? `${i + 1}${sep}` : '';
          fileMatches.push(`${prefix}${ln}${lines[i]}`);
        }
      }
    }

    if (listFiles && fileCount > 0) results.push(displayPath);
    else if (countOnly) results.push(paths.length > 1 ? `${displayPath}:${fileCount}` : `${fileCount}`);
    else results.push(...fileMatches);
  }

  for (const p of paths) {
    const resolved = normalizePath(p);
    if (isDir(resolved)) {
      walkDir(resolved, (filePath) => {
        if (!hidden && filePath.split('/').some(s => s.startsWith('.') && s !== '.' && s !== '..')) return;
        searchFile(filePath, filePath, resolved);
      });
    } else {
      searchFile(resolved, p, normalizePath('.'));
    }
  }

  if (results.length === 0) return { stdout: '', stderr: '', exitCode: 1 };
  return { stdout: results.join('\n') + '\n', stderr: '', exitCode: 0 };
}

// ─── xargs ──────────────────────────────────────────────────────────

function xargs(args, options) {
  const stdinData = (options && options._stdin) || '';
  // Simplistic: pass stdin lines as args to the given command
  const items = stdinData.trim().split(/\s+/).filter(Boolean);
  if (args.length === 0) {
    // Default: echo
    return { stdout: items.join(' ') + '\n', stderr: '', exitCode: 0 };
  }
  // Run command with items as extra args
  const cmd = args[0];
  const cmdArgs = [...args.slice(1), ...items];
  if (commands[cmd]) {
    return commands[cmd](cmdArgs, options);
  }
  return { stdout: '', stderr: `xargs: ${cmd}: command not found\n`, exitCode: 127 };
}

// ─── tee ────────────────────────────────────────────────────────────

function tee(args, options) {
  const append = args.includes('-a');
  const paths = args.filter(a => !a.startsWith('-'));
  const stdinData = (options && options._stdin) || '';

  for (const p of paths) {
    const resolved = normalizePath(p);
    const encoded = new TextEncoder().encode(stdinData);
    if (append) {
      try {
        const existing = defaultMemfs.readFile(resolved);
        const combined = new Uint8Array(existing.length + encoded.length);
        combined.set(existing);
        combined.set(encoded, existing.length);
        defaultMemfs.writeFile(resolved, combined);
      } catch {
        defaultMemfs.writeFile(resolved, encoded);
      }
    } else {
      defaultMemfs.writeFile(resolved, encoded);
    }
  }

  return { stdout: stdinData, stderr: '', exitCode: 0 };
}

// ─── sed (basic s/pattern/replacement/) ─────────────────────────────

function sed(args, options) {
  let inPlace = false;
  let expression = null;
  const paths = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-i') { inPlace = true; continue; }
    if (args[i] === '-e' && i + 1 < args.length) { expression = args[++i]; continue; }
    if (!expression && !args[i].startsWith('-')) { expression = args[i]; continue; }
    paths.push(args[i]);
  }

  if (!expression) return { stdout: '', stderr: 'sed: no expression\n', exitCode: 1 };

  // Parse s/pattern/replacement/flags
  const sMatch = expression.match(/^s(.)(.+?)\1(.*?)\1([gimp]*)$/);
  if (!sMatch) return { stdout: '', stderr: `sed: unsupported expression: ${expression}\n`, exitCode: 1 };
  const [, , pat, repl, flags] = sMatch;
  const globalFlag = flags.includes('g');
  const re = new RegExp(pat, (flags.includes('i') ? 'i' : '') + (globalFlag ? 'g' : ''));

  function transform(text) { return text.replace(re, repl); }

  let text;
  if (options && options._stdin && paths.length === 0) {
    text = options._stdin;
    return { stdout: transform(text), stderr: '', exitCode: 0 };
  }

  if (paths.length === 0) return { stdout: '', stderr: 'sed: no input files\n', exitCode: 1 };

  const output = [];
  for (const p of paths) {
    const resolved = normalizePath(p);
    try {
      text = readFileText(resolved);
      const result = transform(text);
      if (inPlace) {
        defaultMemfs.writeFile(resolved, new TextEncoder().encode(result));
      } else {
        output.push(result);
      }
    } catch {
      return { stdout: '', stderr: `sed: ${p}: No such file or directory\n`, exitCode: 1 };
    }
  }

  return { stdout: inPlace ? '' : output.join(''), stderr: '', exitCode: 0 };
}

// ─── awk (basic print support) ──────────────────────────────────────

function awk(args, options) {
  let program = null;
  const paths = [];

  for (let i = 0; i < args.length; i++) {
    if (!program && !args[i].startsWith('-')) { program = args[i]; continue; }
    if (args[i] === '-F' && i + 1 < args.length) { i++; continue; } // field separator (ignored for now)
    if (!args[i].startsWith('-')) paths.push(args[i]);
  }

  if (!program) return { stdout: '', stderr: 'awk: no program given\n', exitCode: 1 };

  // Minimal: support {print}, {print $N}, and /pattern/{print}
  let text;
  if (options && options._stdin) text = options._stdin;
  else if (paths.length > 0) {
    try { text = readFileText(normalizePath(paths[0])); }
    catch { return { stdout: '', stderr: `awk: ${paths[0]}: No such file or directory\n`, exitCode: 1 }; }
  } else {
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  const lines = text.split('\n');
  const output = [];

  // Parse simple patterns: {print}, {print $1}, /re/{print $2}
  const printMatch = program.match(/^\{print(?:\s+(.*?))?\}$/);
  const filteredPrint = program.match(/^\/(.+?)\/\s*\{print(?:\s+(.*?))?\}$/);

  for (const line of lines) {
    if (!line && line !== '0') continue;
    const fields = line.split(/\s+/);

    if (filteredPrint) {
      const [, pat, expr] = filteredPrint;
      if (!new RegExp(pat).test(line)) continue;
      if (expr) {
        output.push(_awkEval(expr, fields, line));
      } else {
        output.push(line);
      }
    } else if (printMatch) {
      const expr = printMatch[1];
      if (expr) {
        output.push(_awkEval(expr, fields, line));
      } else {
        output.push(line);
      }
    }
  }

  return { stdout: output.join('\n') + (output.length ? '\n' : ''), stderr: '', exitCode: 0 };
}

function _awkEval(expr, fields, line) {
  // Replace $0 with full line, $N with field N
  return expr.replace(/\$(\d+)/g, (_, n) => {
    const idx = parseInt(n, 10);
    if (idx === 0) return line;
    return fields[idx - 1] || '';
  });
}

// ─── which ──────────────────────────────────────────────────────────

function which(args) {
  for (const name of args) {
    if (commands[name] || name === 'rg' || name === 'git' || name === 'node') {
      return { stdout: `/usr/bin/${name}\n`, stderr: '', exitCode: 0 };
    }
  }
  return { stdout: '', stderr: `which: no ${args[0]} in PATH\n`, exitCode: 1 };
}

// ─── whoami ─────────────────────────────────────────────────────────

function whoami() {
  return { stdout: 'user\n', stderr: '', exitCode: 0 };
}

// ─── date ───────────────────────────────────────────────────────────

function date(args) {
  if (args.includes('-u') || args.includes('--utc')) {
    return { stdout: new Date().toUTCString() + '\n', stderr: '', exitCode: 0 };
  }
  return { stdout: new Date().toString() + '\n', stderr: '', exitCode: 0 };
}

// ─── uname ──────────────────────────────────────────────────────────

function uname(args) {
  if (args.includes('-a')) {
    return { stdout: 'Linux browser 6.0.0-edgejs wasm32 GNU/Linux\n', stderr: '', exitCode: 0 };
  }
  if (args.includes('-m')) return { stdout: 'wasm32\n', stderr: '', exitCode: 0 };
  if (args.includes('-r')) return { stdout: '6.0.0-edgejs\n', stderr: '', exitCode: 0 };
  if (args.includes('-s') || args.length === 0) return { stdout: 'Linux\n', stderr: '', exitCode: 0 };
  return { stdout: 'Linux\n', stderr: '', exitCode: 0 };
}

// ─── seq ────────────────────────────────────────────────────────────

function seq(args) {
  let start = 1, step = 1, end = 1;
  if (args.length === 1) { end = parseInt(args[0], 10); }
  else if (args.length === 2) { start = parseInt(args[0], 10); end = parseInt(args[1], 10); }
  else if (args.length >= 3) { start = parseInt(args[0], 10); step = parseInt(args[1], 10); end = parseInt(args[2], 10); }
  const lines = [];
  if (step > 0) { for (let i = start; i <= end; i += step) lines.push(String(i)); }
  else if (step < 0) { for (let i = start; i >= end; i += step) lines.push(String(i)); }
  return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
}

// ─── yes ────────────────────────────────────────────────────────────

function yes(args) {
  const str = args.length > 0 ? args.join(' ') : 'y';
  // Output 100 lines (can't be infinite in sync context)
  const lines = Array(100).fill(str);
  return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
}

// ─── printf ─────────────────────────────────────────────────────────

function printfCmd(args) {
  if (args.length === 0) return { stdout: '', stderr: '', exitCode: 0 };
  let fmt = args[0];
  // Basic: replace %s with args, \n with newline, \t with tab
  let argIdx = 1;
  const result = fmt
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/%%/g, '\0PERCENT\0')
    .replace(/%s/g, () => args[argIdx++] || '')
    .replace(/%d/g, () => parseInt(args[argIdx++] || '0', 10))
    .replace(/\0PERCENT\0/g, '%');
  return { stdout: result, stderr: '', exitCode: 0 };
}

// ─── readlink ───────────────────────────────────────────────────────

function readlink(args) {
  let canonicalize = false;
  const paths = [];
  for (const arg of args) {
    if (arg === '-f' || arg === '--canonicalize') canonicalize = true;
    else if (!arg.startsWith('-')) paths.push(arg);
  }
  if (paths.length === 0) return { stdout: '', stderr: 'readlink: missing operand\n', exitCode: 1 };
  const resolved = normalizePath(paths[0]);
  if (!fileExists(resolved)) return { stdout: '', stderr: `readlink: ${paths[0]}: No such file or directory\n`, exitCode: 1 };
  return { stdout: resolved + '\n', stderr: '', exitCode: 0 };
}

// ─── realpath ───────────────────────────────────────────────────────

function realpathCmd(args) {
  const paths = args.filter(a => !a.startsWith('-'));
  if (paths.length === 0) return { stdout: '', stderr: 'realpath: missing operand\n', exitCode: 1 };
  const output = [];
  for (const p of paths) {
    const resolved = normalizePath(p);
    if (!fileExists(resolved) && !isDir(resolved)) {
      return { stdout: '', stderr: `realpath: ${p}: No such file or directory\n`, exitCode: 1 };
    }
    output.push(resolved);
  }
  return { stdout: output.join('\n') + '\n', stderr: '', exitCode: 0 };
}

// ─── stat ───────────────────────────────────────────────────────────

function statCmd(args) {
  const paths = args.filter(a => !a.startsWith('-'));
  if (paths.length === 0) return { stdout: '', stderr: 'stat: missing operand\n', exitCode: 1 };
  const output = [];
  for (const p of paths) {
    const resolved = normalizePath(p);
    try {
      const s = statFile(resolved);
      output.push(`  File: ${p}`);
      output.push(`  Size: ${s.size || 0}\tBlocks: 0\tIO Block: 4096\t${s.isDirectory() ? 'directory' : 'regular file'}`);
      output.push(`Access: (0755/${s.isDirectory() ? 'drwxr-xr-x' : '-rwxr-xr-x'})\tUid: (1000/user)\tGid: (1000/user)`);
    } catch {
      return { stdout: '', stderr: `stat: cannot stat '${p}': No such file or directory\n`, exitCode: 1 };
    }
  }
  return { stdout: output.join('\n') + '\n', stderr: '', exitCode: 0 };
}

// ─── chmod / chown (no-op) ──────────────────────────────────────────

function chmod() { return { stdout: '', stderr: '', exitCode: 0 }; }
function chown() { return { stdout: '', stderr: '', exitCode: 0 }; }



export const commands = {
  ls, cat, grep, find, head, tail, echo, pwd, mkdir, rm, cp, mv, touch,
  wc, sort, uniq, tr, basename, dirname, env, cd,
  'true': trueCmd, 'false': falseCmd, exit: exitCmd,
  test: testCmd, '[': testCmd,
  rg, xargs, tee, sed, awk, which, whoami, date, uname, seq, yes, printf: printfCmd,
  readlink, realpath: realpathCmd, stat: statCmd, chmod, chown,
};

export function hasCommand(name) {
  return name in commands;
}

export function runCommand(name, args, options) {
  const fn = commands[name];
  if (!fn) return null;
  return fn(args, options);
}
