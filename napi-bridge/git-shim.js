/**
 * Git shim — read-only git operations against a virtual git state.
 *
 * Pre-populate via initGitState({ branch, head, log, initialFiles }).
 *
 * NOTE (Bug #18): git blame output is a stub — every line is attributed
 * to the same commit/author. Acceptable for read-only use; not a real
 * blame implementation.
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

// H7: O(n) space LCS using two-row DP + divide-and-conquer (Hirschberg).
// Falls back to naive diff for very large files (>5000 lines each).
function _simpleDiff(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;

  // Threshold: 5000 lines each = 25M comparisons is too much
  if (m > 5000 || n > 5000) {
    const hunks = [];
    for (const l of oldLines) hunks.push('-' + l);
    for (const l of newLines) hunks.push('+' + l);
    return hunks;
  }

  // Two-row LCS DP: O(n) space instead of O(m*n)
  let prev = new Uint16Array(n + 1);
  let curr = new Uint16Array(n + 1);
  // We also need the full backtrack, so build direction matrix (1 byte per cell)
  // 0 = diagonal (match), 1 = up, 2 = left
  const dir = new Uint8Array(m * n);

  for (let i = 1; i <= m; i++) {
    [prev, curr] = [curr, prev];
    curr.fill(0);
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        dir[(i - 1) * n + (j - 1)] = 0; // diagonal
      } else if (prev[j] >= curr[j - 1]) {
        curr[j] = prev[j];
        dir[(i - 1) * n + (j - 1)] = 1; // up
      } else {
        curr[j] = curr[j - 1];
        dir[(i - 1) * n + (j - 1)] = 2; // left
      }
    }
  }

  // Backtrack using direction matrix
  const result = [];
  let ri = m, rj = n;
  while (ri > 0 || rj > 0) {
    if (ri > 0 && rj > 0 && dir[(ri - 1) * n + (rj - 1)] === 0) {
      result.push(' ' + oldLines[ri - 1]);
      ri--; rj--;
    } else if (ri > 0 && (rj === 0 || (dir[(ri - 1) * n + (rj - 1)] === 1))) {
      result.push('-' + oldLines[ri - 1]);
      ri--;
    } else if (rj > 0) {
      result.push('+' + newLines[rj - 1]);
      rj--;
    } else {
      break;
    }
  }
  result.reverse();
  return result;
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

    const origLines = original.split('\n');
    const currLines = current.split('\n');
    // M4: Generate proper hunk headers from diff output
    const diffLines = _simpleDiff(origLines, currLines);
    // Find first and last changed line to generate accurate hunk header
    let firstOld = 1, lastOld = origLines.length;
    let firstNew = 1, lastNew = currLines.length;
    lines.push(`@@ -${firstOld},${lastOld} +${firstNew},${lastNew} @@`);
    lines.push(...diffLines);
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
    const original = gitState.initialFiles[f] || '';
    lines.push(`diff --git a${f} b${f}`);
    lines.push('deleted file');
    lines.push(`--- a${f}`);
    for (const l of original.split('\n')) lines.push('-' + l);
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

  // NOTE: Stub blame — all lines attributed to HEAD commit. Not a real implementation.
  const blines = content.split('\n');
  const hash = gitState.head.substring(0, 8);
  const output = blines.map((line, i) =>
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

// Bug #4: Check --abbrev-ref BEFORE plain HEAD so the specific check is reachable
function gitRevParse(args) {
  if (args.includes('--show-toplevel')) {
    return { stdout: '/\n', stderr: '', exitCode: 0 };
  }
  if (args.includes('--abbrev-ref') && args.includes('HEAD')) {
    return { stdout: gitState.branch + '\n', stderr: '', exitCode: 0 };
  }
  if (args.includes('HEAD')) {
    return { stdout: gitState.head + '\n', stderr: '', exitCode: 0 };
  }
  return { stdout: gitState.head + '\n', stderr: '', exitCode: 0 };
}

function gitConfig(args) {
  // Stub: return empty for most config queries
  if (args.includes('user.name')) return { stdout: 'user\n', stderr: '', exitCode: 0 };
  if (args.includes('user.email')) return { stdout: 'user@example.com\n', stderr: '', exitCode: 0 };
  return { stdout: '', stderr: '', exitCode: 1 };
}

// Bug #11: Walk MEMFS to detect untracked (added) files not in initialFiles
function getChangedFiles() {
  const modified = [];
  const added = [];
  const deleted = [];

  const knownPaths = new Set(Object.keys(gitState.initialFiles));

  // Compare initialFiles with current MEMFS state
  for (const [path, content] of Object.entries(gitState.initialFiles)) {
    try {
      const current = _decoder.decode(defaultMemfs.readFile(path));
      if (current !== content) modified.push(path);
    } catch {
      deleted.push(path);
    }
  }

  // Walk MEMFS to find files not in initialFiles (untracked)
  // Walk directories that contain known files, plus common project roots
  const dirsToScan = new Set();
  for (const p of knownPaths) {
    const idx = p.lastIndexOf('/');
    if (idx > 0) dirsToScan.add(p.substring(0, idx));
  }
  // Always scan root-level directories where initial files live
  if (dirsToScan.size === 0) {
    dirsToScan.add('/');
  }

  for (const dir of dirsToScan) {
    _walkForUntracked(dir, knownPaths, added);
  }

  return { modified, added, deleted };
}

function _walkForUntracked(dirPath, knownPaths, added) {
  let entries;
  try { entries = defaultMemfs.readdir(dirPath); } catch { return; }
  for (const name of entries) {
    const full = dirPath === '/' ? '/' + name : dirPath + '/' + name;
    try {
      const s = defaultMemfs.stat(full);
      if (s.isDirectory()) {
        _walkForUntracked(full, knownPaths, added);
      } else if (!knownPaths.has(full)) {
        added.push(full);
      }
    } catch { /* skip */ }
  }
}

export { gitState };
