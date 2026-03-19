/**
 * Shell parser — parse shell command strings into structured commands.
 *
 * Handles:
 * - bash -c 'command' / sh -c 'command'
 * - Pipes: cmd1 | cmd2
 * - Redirects: > file, >> file, < file, 2>&1, 1>&2
 * - Semicolons: cmd1; cmd2
 * - && / ||: conditional chaining
 * - Quoting: 'single', "double", \escape (quoted args skip glob expansion)
 * - Environment variables: FOO=bar command, $VAR expansion
 * - Glob expansion: *.js (basic, unquoted only)
 *
 * SECURITY:
 * - Input length capped at MAX_INPUT_LENGTH to prevent ReDoS (C7)
 * - Glob regex uses simple character classes, not .* (C7)
 * - Path normalization clamps at root (C3)
 */

import { defaultMemfs } from './memfs.js';
import { runCommand, hasCommand } from './shell-commands.js';

const MAX_INPUT_LENGTH = 1_000_000; // C7: prevent ReDoS on huge inputs

// ─── Safe path normalization (C3: clamp at root) ────────────────────

function _normPath(p) {
  const parts = p.split('/').filter(Boolean);
  const result = [];
  for (const part of parts) {
    if (part === '..') { if (result.length > 0) result.pop(); }
    else if (part !== '.') result.push(part);
  }
  return '/' + result.join('/');
}

function _resolvePath(p) {
  if (p.startsWith('/')) return _normPath(p);
  const cwd = typeof process !== 'undefined' ? process.cwd() : '/';
  return _normPath(cwd.replace(/\/$/, '') + '/' + p);
}

// ─── Tokenizer ───────────────────────────────────────────────────────
// H5: Track whether each WORD token came from a quoted context.
// Quoted words have `quoted: true` and skip glob expansion.

function tokenize(input) {
  if (input.length > MAX_INPUT_LENGTH) {
    throw new Error(`Shell input too long (${input.length} > ${MAX_INPUT_LENGTH})`);
  }

  const tokens = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    // Skip whitespace
    if (input[i] === ' ' || input[i] === '\t') { i++; continue; }

    // Operators
    if (input[i] === '|' && input[i + 1] === '|') { tokens.push({ type: 'OR', value: '||' }); i += 2; continue; }
    if (input[i] === '|') { tokens.push({ type: 'PIPE', value: '|' }); i++; continue; }
    if (input[i] === '&' && input[i + 1] === '&') { tokens.push({ type: 'AND', value: '&&' }); i += 2; continue; }
    if (input[i] === ';') { tokens.push({ type: 'SEMI', value: ';' }); i++; continue; }
    if (input[i] === '>' && input[i + 1] === '>') { tokens.push({ type: 'APPEND', value: '>>' }); i += 2; continue; }
    if (input[i] === '>') { tokens.push({ type: 'REDIRECT', value: '>' }); i++; continue; }
    if (input[i] === '<') { tokens.push({ type: 'INPUT', value: '<' }); i++; continue; }
    // M5: Generalized fd redirects: N>&M (e.g., 2>&1, 1>&2)
    if (/[0-9]/.test(input[i]) && input[i + 1] === '>' && input[i + 2] === '&' && /[0-9]/.test(input[i + 3])) {
      const srcFd = input[i];
      const dstFd = input[i + 3];
      tokens.push({ type: 'FD_REDIRECT', value: `${srcFd}>&${dstFd}`, srcFd, dstFd });
      i += 4; continue;
    }

    // Quoted strings — mark as quoted so glob expansion is skipped (H5)
    if (input[i] === "'") {
      let str = '';
      i++; // skip opening quote
      while (i < len && input[i] !== "'") { str += input[i]; i++; }
      if (i < len) i++; // skip closing quote
      tokens.push({ type: 'WORD', value: str, quoted: true });
      continue;
    }

    if (input[i] === '"') {
      let str = '';
      i++; // skip opening quote
      while (i < len && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < len) { str += input[i + 1]; i += 2; }
        else { str += input[i]; i++; }
      }
      if (i < len) i++; // skip closing quote
      tokens.push({ type: 'WORD', value: str, quoted: true });
      continue;
    }

    // Backslash escape
    if (input[i] === '\\' && i + 1 < len) {
      let str = input[i + 1];
      i += 2;
      while (i < len && input[i] !== ' ' && input[i] !== '\t' && !isOperatorChar(input, i)) {
        if (input[i] === '\\' && i + 1 < len) { str += input[i + 1]; i += 2; }
        else { str += input[i]; i++; }
      }
      tokens.push({ type: 'WORD', value: str, quoted: false });
      continue;
    }

    // Regular word (may contain embedded quotes)
    let word = '';
    let hasQuotes = false;
    while (i < len && input[i] !== ' ' && input[i] !== '\t' && !isOperatorChar(input, i)) {
      if (input[i] === '\\' && i + 1 < len) { word += input[i + 1]; i += 2; }
      else if (input[i] === "'") {
        hasQuotes = true;
        i++;
        while (i < len && input[i] !== "'") { word += input[i]; i++; }
        if (i < len) i++;
      } else if (input[i] === '"') {
        hasQuotes = true;
        i++;
        while (i < len && input[i] !== '"') {
          if (input[i] === '\\' && i + 1 < len) { word += input[i + 1]; i += 2; }
          else { word += input[i]; i++; }
        }
        if (i < len) i++;
      } else {
        word += input[i]; i++;
      }
    }
    if (word) tokens.push({ type: 'WORD', value: word, quoted: hasQuotes });
  }

  return tokens;
}

function isOperatorChar(input, i) {
  const c = input[i];
  if (c === '|' || c === ';' || c === '>' || c === '<') return true;
  if (c === '&' && input[i + 1] === '&') return true;
  if (/[0-9]/.test(c) && input[i + 1] === '>' && input[i + 2] === '&') return true;
  return false;
}

// ─── Parser ──────────────────────────────────────────────────────────

function parseTokens(tokens) {
  const pipelines = [];
  let current = [];
  const separators = [];

  for (const tok of tokens) {
    if (tok.type === 'SEMI' || tok.type === 'AND' || tok.type === 'OR') {
      pipelines.push(current);
      separators.push(tok.type);
      current = [];
    } else {
      current.push(tok);
    }
  }
  if (current.length > 0) pipelines.push(current);

  return { pipelines, separators };
}

function parsePipeline(tokens) {
  const commands = [];
  let current = [];

  for (const tok of tokens) {
    if (tok.type === 'PIPE') {
      commands.push(parseSimpleCommand(current));
      current = [];
    } else {
      current.push(tok);
    }
  }
  if (current.length > 0) commands.push(parseSimpleCommand(current));

  return commands;
}

function parseSimpleCommand(tokens) {
  const envVars = {};
  const args = [];       // { value, quoted } pairs
  let redirectOut = null;
  let redirectAppend = false;
  let redirectIn = null;
  let mergeStderr = false;

  let i = 0;

  // Parse leading env assignments: FOO=bar
  while (i < tokens.length && tokens[i].type === 'WORD' && tokens[i].value.includes('=') && !tokens[i].value.startsWith('-')) {
    const eqIdx = tokens[i].value.indexOf('=');
    const key = tokens[i].value.substring(0, eqIdx);
    const val = tokens[i].value.substring(eqIdx + 1);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      envVars[key] = val;
      i++;
    } else {
      break;
    }
  }

  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.type === 'REDIRECT') {
      i++;
      if (i < tokens.length) { redirectOut = tokens[i].value; redirectAppend = false; }
    } else if (tok.type === 'APPEND') {
      i++;
      if (i < tokens.length) { redirectOut = tokens[i].value; redirectAppend = true; }
    } else if (tok.type === 'INPUT') {
      i++;
      if (i < tokens.length) { redirectIn = tokens[i].value; }
    } else if (tok.type === 'FD_REDIRECT' || tok.type === 'MERGE_STDERR') {
      // M5: Handle generalized fd redirects
      if (tok.srcFd === '2' && tok.dstFd === '1') mergeStderr = true;
      // Other fd redirects (1>&2, etc.) are noted but not fully implemented
    } else if (tok.type === 'WORD') {
      args.push({ value: tok.value, quoted: !!tok.quoted });
    }
    i++;
  }

  const cmdArg = args.shift() || { value: '', quoted: false };
  return {
    cmd: cmdArg.value,
    args,  // Now array of { value, quoted }
    envVars,
    redirectOut, redirectAppend, redirectIn, mergeStderr,
  };
}

// ─── $VAR expansion (M8) ────────────────────────────────────────────

function _expandVars(str) {
  if (typeof process === 'undefined' || !process.env) return str;
  return str.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    return process.env[name] || '';
  });
}

// ─── Glob expansion (C7: safe regex, H5: skip quoted args) ─────────

function expandGlobs(args) {
  const result = [];
  for (const arg of args) {
    // H5: Never expand globs for quoted arguments
    if (arg.quoted) {
      result.push(arg.value);
      continue;
    }
    const val = arg.value;
    if (val.includes('*') || val.includes('?')) {
      const expanded = expandGlob(val);
      if (expanded.length > 0) {
        result.push(...expanded);
      } else {
        result.push(val); // No match, keep as-is
      }
    } else {
      result.push(val);
    }
  }
  return result;
}

function expandGlob(pattern) {
  const lastSlash = pattern.lastIndexOf('/');
  let dir, filePattern;
  if (lastSlash >= 0) {
    dir = pattern.substring(0, lastSlash) || '/';
    filePattern = pattern.substring(lastSlash + 1);
  } else {
    dir = typeof process !== 'undefined' ? process.cwd() : '/';
    filePattern = pattern;
  }

  // C7: Build regex safely — use [^/]* instead of .* to prevent catastrophic backtracking
  let reStr = '^';
  for (const ch of filePattern) {
    if (ch === '*') reStr += '[^/]*';
    else if (ch === '?') reStr += '[^/]';
    else reStr += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  reStr += '$';

  let re;
  try { re = new RegExp(reStr); } catch { return []; }

  try {
    const entries = defaultMemfs.readdir(dir);
    return entries.filter(name => re.test(name)).map(name => {
      if (lastSlash >= 0) return dir + '/' + name;
      return name;
    });
  } catch {
    return [];
  }
}

// ─── Unwrap bash/sh -c ──────────────────────────────────────────────

function unwrapShellInvocation(cmd, args) {
  if ((cmd === 'bash' || cmd === 'sh' || cmd === '/bin/bash' || cmd === '/bin/sh') &&
      args.length >= 2 && args[0].value === '-c') {
    return args.slice(1).map(a => a.value).join(' ');
  }
  return null;
}

// ─── Execute ─────────────────────────────────────────────────────────

export function executeCommandString(commandStr, options) {
  const tokens = tokenize(commandStr);
  const { pipelines, separators } = parseTokens(tokens);

  let lastResult = { stdout: '', stderr: '', exitCode: 0 };

  for (let i = 0; i < pipelines.length; i++) {
    if (i > 0) {
      const sep = separators[i - 1];
      if (sep === 'AND' && lastResult.exitCode !== 0) continue;
      if (sep === 'OR' && lastResult.exitCode === 0) continue;
    }

    const pipeline = parsePipeline(pipelines[i]);
    lastResult = executePipeline(pipeline, options);
  }

  return lastResult;
}

function executePipeline(commands, options) {
  let input = null;

  for (let i = 0; i < commands.length; i++) {
    let { cmd, args, envVars, redirectOut, redirectAppend, redirectIn, mergeStderr } = commands[i];

    // M8: Expand $VAR in cmd and unquoted args
    cmd = _expandVars(cmd);

    // Handle input redirect
    if (redirectIn && input === null) {
      try {
        input = new TextDecoder().decode(defaultMemfs.readFile(_resolvePath(redirectIn)));
      } catch {
        return { stdout: '', stderr: `${cmd}: ${redirectIn}: No such file or directory\n`, exitCode: 1 };
      }
    }

    // Check for bash -c unwrapping
    const unwrapped = unwrapShellInvocation(cmd, args);
    if (unwrapped) {
      const result = executeCommandString(unwrapped, options);
      if (i < commands.length - 1) {
        input = result.stdout;
      } else {
        if (redirectOut) {
          writeRedirect(redirectOut, result.stdout, redirectAppend);
          return { stdout: '', stderr: result.stderr, exitCode: result.exitCode };
        }
        return result;
      }
      continue;
    }

    // Expand globs (H5: respects quoted flag) and $VAR in unquoted args
    const expandedArgs = expandGlobs(args.map(a => {
      if (a.quoted) return a;
      return { value: _expandVars(a.value), quoted: false };
    }));

    // Set env vars
    const savedEnv = {};
    if (typeof process !== 'undefined' && process.env) {
      for (const [k, v] of Object.entries(envVars)) {
        savedEnv[k] = process.env[k];
        process.env[k] = v;
      }
    }

    const cmdOptions = { ...options, _stdin: input };
    let result;

    if (hasCommand(cmd)) {
      result = runCommand(cmd, expandedArgs, cmdOptions);
    } else {
      result = { stdout: '', stderr: `${cmd}: command not found\n`, exitCode: 127 };
    }

    // Restore env vars
    if (typeof process !== 'undefined' && process.env) {
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }

    if (mergeStderr) {
      result.stdout += result.stderr;
      result.stderr = '';
    }

    if (redirectOut && i === commands.length - 1) {
      writeRedirect(redirectOut, result.stdout, redirectAppend);
      return { stdout: '', stderr: result.stderr, exitCode: result.exitCode };
    }

    input = result.stdout;

    if (i === commands.length - 1) {
      return result;
    }
  }

  return { stdout: input || '', stderr: '', exitCode: 0 };
}

function writeRedirect(path, content, append) {
  const norm = _resolvePath(path);

  if (append) {
    try {
      const existing = new TextDecoder().decode(defaultMemfs.readFile(norm));
      defaultMemfs.writeFile(norm, new TextEncoder().encode(existing + content));
    } catch {
      defaultMemfs.writeFile(norm, new TextEncoder().encode(content));
    }
  } else {
    defaultMemfs.writeFile(norm, new TextEncoder().encode(content));
  }
}

export { tokenize, parseTokens, parsePipeline, unwrapShellInvocation };
