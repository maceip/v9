/**
 * Shell parser — parse shell command strings into structured commands.
 *
 * Handles:
 * - bash -c 'command' / sh -c 'command'
 * - Pipes: cmd1 | cmd2
 * - Redirects: > file, >> file, 2>&1
 * - Semicolons: cmd1; cmd2
 * - && / ||: conditional chaining
 * - Quoting: 'single', "double", \escape
 * - Environment variables: FOO=bar command
 * - Glob expansion: *.js (basic)
 */

import { defaultMemfs } from './memfs.js';
import { runCommand, hasCommand } from './shell-commands.js';

// ─── Tokenizer ───────────────────────────────────────────────────────

function tokenize(input) {
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
    if (input[i] === '2' && input[i + 1] === '>' && input[i + 2] === '&' && input[i + 3] === '1') {
      tokens.push({ type: 'MERGE_STDERR', value: '2>&1' }); i += 4; continue;
    }

    // Quoted strings
    if (input[i] === "'") {
      let str = '';
      i++; // skip opening quote
      while (i < len && input[i] !== "'") { str += input[i]; i++; }
      i++; // skip closing quote
      tokens.push({ type: 'WORD', value: str });
      continue;
    }

    if (input[i] === '"') {
      let str = '';
      i++; // skip opening quote
      while (i < len && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < len) { str += input[i + 1]; i += 2; }
        else { str += input[i]; i++; }
      }
      i++; // skip closing quote
      tokens.push({ type: 'WORD', value: str });
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
      tokens.push({ type: 'WORD', value: str });
      continue;
    }

    // Regular word
    let word = '';
    while (i < len && input[i] !== ' ' && input[i] !== '\t' && !isOperatorChar(input, i)) {
      if (input[i] === '\\' && i + 1 < len) { word += input[i + 1]; i += 2; }
      else if (input[i] === "'" ) {
        i++;
        while (i < len && input[i] !== "'") { word += input[i]; i++; }
        i++;
      } else if (input[i] === '"') {
        i++;
        while (i < len && input[i] !== '"') {
          if (input[i] === '\\' && i + 1 < len) { word += input[i + 1]; i += 2; }
          else { word += input[i]; i++; }
        }
        i++;
      } else {
        word += input[i]; i++;
      }
    }
    if (word) tokens.push({ type: 'WORD', value: word });
  }

  return tokens;
}

function isOperatorChar(input, i) {
  const c = input[i];
  if (c === '|' || c === ';' || c === '>' || c === '<') return true;
  if (c === '&' && input[i + 1] === '&') return true;
  if (c === '2' && input[i + 1] === '>' && input[i + 2] === '&') return true;
  return false;
}

// ─── Parser ──────────────────────────────────────────────────────────

function parseTokens(tokens) {
  // Split into command groups by ;, &&, ||
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
  // Split by PIPE
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
  const args = [];
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
      // Bug #14: Parse input redirect < file
      i++;
      if (i < tokens.length) { redirectIn = tokens[i].value; }
    } else if (tok.type === 'MERGE_STDERR') {
      mergeStderr = true;
    } else if (tok.type === 'WORD') {
      args.push(tok.value);
    }
    i++;
  }

  const cmd = args.shift() || '';
  return { cmd, args, envVars, redirectOut, redirectAppend, redirectIn, mergeStderr };
}

// ─── Glob expansion ──────────────────────────────────────────────────

function expandGlobs(args) {
  const result = [];
  for (const arg of args) {
    if (arg.includes('*') || arg.includes('?')) {
      const expanded = expandGlob(arg);
      if (expanded.length > 0) {
        result.push(...expanded);
      } else {
        result.push(arg); // No match, keep as-is
      }
    } else {
      result.push(arg);
    }
  }
  return result;
}

function expandGlob(pattern) {
  // Simple glob: split into dir + file pattern
  const lastSlash = pattern.lastIndexOf('/');
  let dir, filePattern;
  if (lastSlash >= 0) {
    dir = pattern.substring(0, lastSlash) || '/';
    filePattern = pattern.substring(lastSlash + 1);
  } else {
    dir = typeof process !== 'undefined' ? process.cwd() : '/';
    filePattern = pattern;
  }

  const re = new RegExp('^' + filePattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');

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
  if ((cmd === 'bash' || cmd === 'sh' || cmd === '/bin/bash' || cmd === '/bin/sh') && args[0] === '-c' && args.length >= 2) {
    return args.slice(1).join(' ');
  }
  return null;
}

// ─── Execute ─────────────────────────────────────────────────────────

export function executeCommandString(commandStr, options) {
  const tokens = tokenize(commandStr);
  const { pipelines, separators } = parseTokens(tokens);

  let lastResult = { stdout: '', stderr: '', exitCode: 0 };

  for (let i = 0; i < pipelines.length; i++) {
    // Check separator condition
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

    // Bug #14: Handle input redirect — read file and use as stdin
    if (redirectIn && input === null) {
      try {
        const resolved = redirectIn.startsWith('/') ? redirectIn
          : (typeof process !== 'undefined' ? process.cwd() : '/').replace(/\/$/, '') + '/' + redirectIn;
        const parts = resolved.split('/').filter(Boolean);
        const result = [];
        for (const part of parts) {
          if (part === '..') result.pop();
          else if (part !== '.') result.push(part);
        }
        const norm = '/' + result.join('/');
        input = new TextDecoder().decode(defaultMemfs.readFile(norm));
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
        // Handle redirect for the unwrapped result
        if (redirectOut) {
          writeRedirect(redirectOut, result.stdout, redirectAppend);
          return { stdout: '', stderr: result.stderr, exitCode: result.exitCode };
        }
        return result;
      }
      continue;
    }

    // Expand globs
    args = expandGlobs(args);

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
      result = runCommand(cmd, args, cmdOptions);
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
  const resolved = path.startsWith('/') ? path : (typeof process !== 'undefined' ? process.cwd() : '/') + '/' + path;

  // Normalize the path
  const parts = resolved.split('/').filter(Boolean);
  const result = [];
  for (const part of parts) {
    if (part === '..') result.pop();
    else if (part !== '.') result.push(part);
  }
  const norm = '/' + result.join('/');

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
