/**
 * Git shim — read-only git operations against a virtual git state.
 *
 * Pre-populate via initGitState({ branch, head, log, initialFiles }).
 */

import { defaultMemfs } from './memfs.js';

const _decoder = new TextDecoder('utf-8');

const gitState = {
  branch: 'main',
  head: 'abc1234',
  log: [
    { hash: 'abc1234', message: 'Initial commit', date: '2026-01-01' },
  ],
  initialFiles: {},
};

export function initGitState(state) {
  if (state.branch) gitState.branch = state.branch;
  if (state.head) gitState.head = state.head;
  if (state.log) gitState.log = state.log;
  if (state.initialFiles) gitState.initialFiles = { ...state.initialFiles };
}

export function runGit(args) {
  const sub = args[0];

  if (sub === 'status') return gitStatus(args.slice(1));
  if (sub === 'log') return gitLog(args.slice(1));
  if (sub === 'diff') return gitDiff(args.slice(1));
  if (sub === 'blame') return gitBlame(args.slice(1));
  if (sub === 'branch') return gitBranch(args.slice(1));
  if (sub === 'rev-parse') return gitRevParse(args.slice(1));
  if (sub === 'config') return gitConfig(args.slice(1));

  return { stdout: '', stderr: `git: '${sub}' is not a git command\n`, exitCode: 1 };
}

function gitStatus() {
  const lines = ['On branch ' + gitState.branch, ''];
  const changed = getChangedFiles();

  if (changed.modified.length === 0 && changed.added.length === 0 && changed.deleted.length === 0) {
    lines.push('nothing to commit, working tree clean');
  } else {
    if (changed.modified.length > 0 || changed.deleted.length > 0) {
      lines.push('Changes not staged for commit:');
      for (const f of changed.modified) lines.push('\tmodified:   ' + f);
      for (const f of changed.deleted) lines.push('\tdeleted:    ' + f);
      lines.push('');
    }
    if (changed.added.length > 0) {
      lines.push('Untracked files:');
      for (const f of changed.added) lines.push('\t' + f);
      lines.push('');
    }
  }

  return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
}

function gitLog(args) {
  let oneline = false;
  let count = gitState.log.length;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--oneline') oneline = true;
    if (args[i].startsWith('-') && /^-\d+$/.test(args[i])) count = parseInt(args[i].substring(1), 10);
  }

  const entries = gitState.log.slice(0, count);
  const lines = entries.map(e => {
    if (oneline) return `${e.hash.substring(0, 7)} ${e.message}`;
    return `commit ${e.hash}\nDate:   ${e.date}\n\n    ${e.message}\n`;
  });

  return { stdout: lines.join('\n') + '\n', stderr: '', exitCode: 0 };
}

function gitDiff(args) {
  let nameOnly = args.includes('--name-only');
  const changed = getChangedFiles();

  if (nameOnly) {
    const files = [...changed.modified, ...changed.added, ...changed.deleted];
    return { stdout: files.join('\n') + (files.length ? '\n' : ''), stderr: '', exitCode: 0 };
  }

  const lines = [];
  for (const f of changed.modified) {
    const original = gitState.initialFiles[f] || '';
    let current = '';
    try { current = _decoder.decode(defaultMemfs.readFile(f)); } catch {}
    lines.push(`diff --git a${f} b${f}`);
    lines.push(`--- a${f}`);
    lines.push(`+++ b${f}`);
    // Simple unified diff
    const origLines = original.split('\n');
    const currLines = current.split('\n');
    lines.push(`@@ -1,${origLines.length} +1,${currLines.length} @@`);
    for (const l of origLines) lines.push('-' + l);
    for (const l of currLines) lines.push('+' + l);
  }

  for (const f of changed.added) {
    let current = '';
    try { current = _decoder.decode(defaultMemfs.readFile(f)); } catch {}
    lines.push(`diff --git a${f} b${f}`);
    lines.push('new file');
    lines.push(`+++ b${f}`);
    for (const l of current.split('\n')) lines.push('+' + l);
  }

  for (const f of changed.deleted) {
    lines.push(`diff --git a${f} b${f}`);
    lines.push('deleted file');
    lines.push(`--- a${f}`);
  }

  return { stdout: lines.join('\n') + (lines.length ? '\n' : ''), stderr: '', exitCode: 0 };
}

function gitBlame(args) {
  const file = args.find(a => !a.startsWith('-'));
  if (!file) return { stdout: '', stderr: 'fatal: no file specified\n', exitCode: 1 };

  let content;
  try {
    content = _decoder.decode(defaultMemfs.readFile(file));
  } catch {
    return { stdout: '', stderr: `fatal: no such path '${file}'\n`, exitCode: 1 };
  }

  const lines = content.split('\n');
  const hash = gitState.head.substring(0, 8);
  const output = lines.map((line, i) =>
    `${hash} (user ${gitState.log[0]?.date || '2026-01-01'} ${i + 1}) ${line}`
  );

  return { stdout: output.join('\n') + '\n', stderr: '', exitCode: 0 };
}

function gitBranch(args) {
  if (args.length === 0) {
    return { stdout: `* ${gitState.branch}\n`, stderr: '', exitCode: 0 };
  }
  return { stdout: `* ${gitState.branch}\n`, stderr: '', exitCode: 0 };
}

function gitRevParse(args) {
  if (args.includes('HEAD')) {
    return { stdout: gitState.head + '\n', stderr: '', exitCode: 0 };
  }
  if (args.includes('--show-toplevel')) {
    return { stdout: '/\n', stderr: '', exitCode: 0 };
  }
  if (args.includes('--abbrev-ref') && args.includes('HEAD')) {
    return { stdout: gitState.branch + '\n', stderr: '', exitCode: 0 };
  }
  return { stdout: gitState.head + '\n', stderr: '', exitCode: 0 };
}

function gitConfig(args) {
  // Stub: return empty for most config queries
  if (args.includes('user.name')) return { stdout: 'user\n', stderr: '', exitCode: 0 };
  if (args.includes('user.email')) return { stdout: 'user@example.com\n', stderr: '', exitCode: 0 };
  return { stdout: '', stderr: '', exitCode: 1 };
}

function getChangedFiles() {
  const modified = [];
  const added = [];
  const deleted = [];

  // Compare initialFiles with current MEMFS state
  for (const [path, content] of Object.entries(gitState.initialFiles)) {
    try {
      const current = _decoder.decode(defaultMemfs.readFile(path));
      if (current !== content) modified.push(path);
    } catch {
      deleted.push(path);
    }
  }

  // Check for new files (walk MEMFS, compare against initialFiles)
  // This is expensive for large filesystems so we skip deep walk for now

  return { modified, added, deleted };
}

export { gitState };
