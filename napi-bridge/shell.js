/**
 * Interactive shell for the in-tab runtime.
 *
 * Provides a bash-like REPL over xterm.js that dispatches commands through
 * the shell parser (shell-commands.js / shell-parser.js) against MEMFS.
 * Supports line editing, history, async commands (npm install), and prompt
 * with cwd display.
 *
 * Usage from terminal.js:
 *   import { createShell } from './shell.js';
 *   const shell = createShell({ write, memfs, cwd: '/workspace' });
 *   term.onData(data => shell.feed(data));
 *   shell.prompt();
 */

import { executeCommandString } from './shell-parser.js';
import { withCwd, commands as shellCommands, getMemfs } from './shell-commands.js';
import { resolvePath } from './memfs.js';

/**
 * Create an interactive shell instance.
 *
 * @param {object} opts
 * @param {function} opts.write - write string to terminal (xterm)
 * @param {string} [opts.cwd='/workspace'] - initial working directory
 * @param {object} [opts.env] - initial environment variables
 * @returns {Shell}
 */
export function createShell(opts = {}) {
  const write = opts.write || (() => {});
  let cwd = opts.cwd || '/workspace';
  let env = { ...(opts.env || {}) };
  let line = '';
  let cursorPos = 0;
  let history = [];
  let historyIdx = -1;
  let historyTmp = '';
  let busy = false;
  let nanoMode = null;
  const customPrompt = opts.prompt || null;

  const PROMPT_COLOR = '\x1b[32m';
  const CWD_COLOR = '\x1b[34m';
  const RESET = '\x1b[0m';

  function shortCwd() {
    if (cwd === '/') return '/';
    const home = env.HOME || '/home/user';
    if (cwd === home) return '~';
    if (cwd.startsWith(home + '/')) return '~' + cwd.slice(home.length);
    return cwd;
  }

  function printPrompt() {
    if (typeof customPrompt === 'function') {
      write(customPrompt({ cwd, shortCwd: shortCwd() }));
    } else if (typeof customPrompt === 'string') {
      write(customPrompt);
    } else {
      write(`${CWD_COLOR}${shortCwd()}${RESET} ${PROMPT_COLOR}$ ${RESET}`);
    }
  }

  // Rewrite the input line in-place. `prevVisualCol` is the visual column of
  // the cursor (relative to the start of the input area) BEFORE this rewrite
  // — required when the caller has already mutated `cursorPos`.
  // If omitted, `cursorPos` is assumed to still match the on-screen cursor.
  function rewriteLine(prevVisualCol) {
    const from = prevVisualCol !== undefined ? prevVisualCol : cursorPos;
    // 1. Move cursor back to start of input area
    if (from > 0) write(`\x1b[${from}D`);
    // 2. Clear from cursor to end of screen (handles wrapped long lines)
    write('\x1b[0J');
    // 3. Redraw the full line
    write(line);
    // 4. Move cursor back to the desired position if not at EOL
    const trailing = line.length - cursorPos;
    if (trailing > 0) write(`\x1b[${trailing}D`);
  }

  async function execute(cmd) {
    const trimmed = cmd.trim();
    if (!trimmed) {
      printPrompt();
      return;
    }

    // Add to history
    if (history.length === 0 || history[history.length - 1] !== trimmed) {
      history.push(trimmed);
      if (history.length > 200) history.shift();
    }
    historyIdx = -1;

    busy = true;
    try {
      const result = withCwd(cwd, () => {
        return executeCommandString(trimmed, { cwd, env });
      });

      // Track cwd changes
      if (result.cwd) {
        cwd = result.cwd;
      }

      // Handle nano interactive editor
      if (result._nano) {
        enterNano(result._nano);
        return; // nano mode takes over input; prompt printed on exit
      }

      // Handle async commands (npm install)
      if (result._async) {
        const asyncResult = await result._async;
        if (asyncResult.stdout) write(asyncResult.stdout.replace(/\n/g, '\r\n'));
        if (asyncResult.stderr) write(`\x1b[31m${asyncResult.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
      } else {
        if (result.stdout) write(result.stdout.replace(/\n/g, '\r\n'));
        if (result.stderr) write(`\x1b[31m${result.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
      }
    } catch (err) {
      write(`\x1b[31m${err.message}\x1b[0m\r\n`);
    }
    busy = false;

    printPrompt();
  }

  // ── Nano micro-editor mode ──────────────────────────────────────────

  function enterNano(opts) {
    const lines = (opts.content || '').split('\n');
    nanoMode = {
      path: opts.path,
      displayPath: opts.displayPath,
      lines,
      row: 0,
      col: 0,
      dirty: false,
      scrollTop: 0,
    };
    busy = false;
    renderNano();
  }

  function renderNano() {
    if (!nanoMode) return;
    write('\x1b[2J\x1b[H');
    write(`\x1b[7m  GNU nano   ${nanoMode.displayPath}${nanoMode.dirty ? ' [Modified]' : ''}  \x1b[0m\r\n`);
    const visibleLines = 18;
    for (let i = 0; i < visibleLines; i++) {
      const lineIdx = nanoMode.scrollTop + i;
      write((lineIdx < nanoMode.lines.length ? nanoMode.lines[lineIdx] : '') + '\r\n');
    }
    write('\x1b[7m ^X\x1b[0m Exit  \x1b[7m ^O\x1b[0m Save  \x1b[7m ^K\x1b[0m Cut  \x1b[7m ^G\x1b[0m Help\r\n');
    const screenRow = nanoMode.row - nanoMode.scrollTop + 2;
    write(`\x1b[${screenRow};${nanoMode.col + 1}H`);
  }

  function handleNanoInput(data) {
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      if (ch === '\x18') { // Ctrl+X — exit
        nanoMode = null;
        write('\x1b[2J\x1b[H');
        printPrompt();
        return;
      }
      if (ch === '\x0f') { // Ctrl+O — save
        const content = nanoMode.lines.join('\n');
        getMemfs().writeFile(nanoMode.path, content);
        nanoMode.dirty = false;
        write(`\x1b[22;1H\x1b[2K\x1b[32m[ Wrote ${nanoMode.lines.length} lines ]\x1b[0m`);
        setTimeout(() => renderNano(), 800);
        return;
      }
      if (ch === '\x0b') { // Ctrl+K — cut line
        if (nanoMode.lines.length > 1) {
          nanoMode.lines.splice(nanoMode.row, 1);
          if (nanoMode.row >= nanoMode.lines.length) nanoMode.row = nanoMode.lines.length - 1;
          nanoMode.col = 0;
        } else {
          nanoMode.lines[0] = '';
          nanoMode.col = 0;
        }
        nanoMode.dirty = true;
        renderNano(); return;
      }
      if (ch === '\r' || ch === '\n') {
        const cur = nanoMode.lines[nanoMode.row] || '';
        nanoMode.lines[nanoMode.row] = cur.substring(0, nanoMode.col);
        nanoMode.lines.splice(nanoMode.row + 1, 0, cur.substring(nanoMode.col));
        nanoMode.row++;
        nanoMode.col = 0;
        nanoMode.dirty = true;
        if (nanoMode.row >= nanoMode.scrollTop + 18) nanoMode.scrollTop++;
        renderNano(); return;
      }
      if (ch === '\x7f' || ch === '\b') {
        if (nanoMode.col > 0) {
          const cur = nanoMode.lines[nanoMode.row];
          nanoMode.lines[nanoMode.row] = cur.substring(0, nanoMode.col - 1) + cur.substring(nanoMode.col);
          nanoMode.col--;
          nanoMode.dirty = true;
        } else if (nanoMode.row > 0) {
          const prev = nanoMode.lines[nanoMode.row - 1];
          nanoMode.col = prev.length;
          nanoMode.lines[nanoMode.row - 1] = prev + nanoMode.lines[nanoMode.row];
          nanoMode.lines.splice(nanoMode.row, 1);
          nanoMode.row--;
          nanoMode.dirty = true;
        }
        renderNano(); return;
      }
      if (ch === '\x1b' && i + 1 < data.length && data[i + 1] === '[') {
        const seq = data[i + 2];
        if (seq === 'A' && nanoMode.row > 0) {
          nanoMode.row--;
          nanoMode.col = Math.min(nanoMode.col, nanoMode.lines[nanoMode.row].length);
          if (nanoMode.row < nanoMode.scrollTop) nanoMode.scrollTop = nanoMode.row;
        } else if (seq === 'B' && nanoMode.row < nanoMode.lines.length - 1) {
          nanoMode.row++;
          nanoMode.col = Math.min(nanoMode.col, nanoMode.lines[nanoMode.row].length);
          if (nanoMode.row >= nanoMode.scrollTop + 18) nanoMode.scrollTop = nanoMode.row - 17;
        } else if (seq === 'C') {
          if (nanoMode.col < (nanoMode.lines[nanoMode.row] || '').length) nanoMode.col++;
        } else if (seq === 'D') {
          if (nanoMode.col > 0) nanoMode.col--;
        }
        i += 2;
        renderNano(); continue;
      }
      if (ch >= ' ') {
        const cur = nanoMode.lines[nanoMode.row] || '';
        nanoMode.lines[nanoMode.row] = cur.substring(0, nanoMode.col) + ch + cur.substring(nanoMode.col);
        nanoMode.col++;
        nanoMode.dirty = true;
        renderNano();
      }
    }
  }

  /**
   * Feed raw terminal input data (from xterm onData).
   * Handles line editing, special keys, and command execution.
   */
  function feed(data) {
    if (nanoMode) { handleNanoInput(data); return; }
    if (busy) return; // ignore input while a command is running

    for (let i = 0; i < data.length; i++) {
      const ch = data[i];

      // Enter
      if (ch === '\r' || ch === '\n') {
        write('\r\n');
        const cmd = line;
        line = '';
        cursorPos = 0;
        execute(cmd);
        return;
      }

      // Ctrl+C
      if (ch === '\x03') {
        write('^C\r\n');
        line = '';
        cursorPos = 0;
        printPrompt();
        return;
      }

      // Ctrl+D — ignored (nothing to exit into from a tab)
      if (ch === '\x04') {
        continue;
      }

      // Ctrl+L (clear screen)
      if (ch === '\x0c') {
        write('\x1b[2J\x1b[H');
        printPrompt();
        write(line);
        const diff = line.length - cursorPos;
        if (diff > 0) write(`\x1b[${diff}D`);
        continue;
      }

      // Ctrl+A (beginning of line)
      if (ch === '\x01') {
        if (cursorPos > 0) {
          write(`\x1b[${cursorPos}D`);
          cursorPos = 0;
        }
        continue;
      }

      // Ctrl+E (end of line)
      if (ch === '\x05') {
        const diff = line.length - cursorPos;
        if (diff > 0) {
          write(`\x1b[${diff}C`);
          cursorPos = line.length;
        }
        continue;
      }

      // Ctrl+U (kill line)
      if (ch === '\x15') {
        const prev = cursorPos;
        line = '';
        cursorPos = 0;
        rewriteLine(prev);
        continue;
      }

      // Ctrl+K (kill to end of line)
      if (ch === '\x0b') {
        write('\x1b[0J');
        line = line.slice(0, cursorPos);
        continue;
      }

      // Ctrl+W (delete word backward)
      if (ch === '\x17') {
        if (cursorPos > 0) {
          const prev = cursorPos;
          let start = cursorPos - 1;
          while (start > 0 && line[start - 1] === ' ') start--;
          while (start > 0 && line[start - 1] !== ' ') start--;
          line = line.slice(0, start) + line.slice(cursorPos);
          cursorPos = start;
          rewriteLine(prev);
        }
        continue;
      }

      // Backspace (DEL 0x7F from most terminals, BS 0x08 from some mobile kbs)
      if (ch === '\x7f' || ch === '\b') {
        if (cursorPos > 0) {
          const prev = cursorPos;
          line = line.slice(0, cursorPos - 1) + line.slice(cursorPos);
          cursorPos--;
          rewriteLine(prev);
        }
        continue;
      }

      // Escape sequences
      if (ch === '\x1b' && i + 1 < data.length) {
        if (data[i + 1] === '[') {
          const seq = data[i + 2];
          if (seq === 'A') { // Up arrow — history
            i += 2;
            if (history.length > 0) {
              const prev = cursorPos;
              if (historyIdx === -1) {
                historyTmp = line;
                historyIdx = history.length - 1;
              } else if (historyIdx > 0) {
                historyIdx--;
              }
              line = history[historyIdx];
              cursorPos = line.length;
              rewriteLine(prev);
            }
            continue;
          }
          if (seq === 'B') { // Down arrow — history
            i += 2;
            if (historyIdx >= 0) {
              const prev = cursorPos;
              historyIdx++;
              if (historyIdx >= history.length) {
                historyIdx = -1;
                line = historyTmp;
              } else {
                line = history[historyIdx];
              }
              cursorPos = line.length;
              rewriteLine(prev);
            }
            continue;
          }
          if (seq === 'C') { // Right arrow
            i += 2;
            if (cursorPos < line.length) {
              cursorPos++;
              write('\x1b[C');
            }
            continue;
          }
          if (seq === 'D') { // Left arrow
            i += 2;
            if (cursorPos > 0) {
              cursorPos--;
              write('\x1b[D');
            }
            continue;
          }
          if (seq === 'H') { // Home
            i += 2;
            if (cursorPos > 0) {
              write(`\x1b[${cursorPos}D`);
              cursorPos = 0;
            }
            continue;
          }
          if (seq === 'F') { // End
            i += 2;
            const diff = line.length - cursorPos;
            if (diff > 0) {
              write(`\x1b[${diff}C`);
              cursorPos = line.length;
            }
            continue;
          }
          if (seq === '3' && data[i + 3] === '~') { // Delete key
            i += 3;
            if (cursorPos < line.length) {
              line = line.slice(0, cursorPos) + line.slice(cursorPos + 1);
              rewriteLine();
            }
            continue;
          }
          // Skip other escape sequences
          i += 2;
          while (i < data.length && data[i] >= '0' && data[i] <= '?') i++;
          continue;
        }
        i += 1;
        continue;
      }

      // Tab — completion
      if (ch === '\t') {
        const textUpToCursor = line.slice(0, cursorPos);
        const lastSpace = textUpToCursor.lastIndexOf(' ');
        const prefix = textUpToCursor.slice(lastSpace + 1);
        const isFirstToken = lastSpace === -1;

        let matches = [];

        if (isFirstToken) {
          const cmdNames = Object.keys(shellCommands);
          matches = cmdNames.filter(c => c.startsWith(prefix));
        } else {
          try {
            const memfs = getMemfs();
            let dirToSearch = cwd;
            let filePrefix = prefix;
            const slashIdx = prefix.lastIndexOf('/');
            if (slashIdx !== -1) {
              const dirPart = prefix.slice(0, slashIdx) || '/';
              dirToSearch = resolvePath(dirPart, cwd);
              filePrefix = prefix.slice(slashIdx + 1);
            }
            const entries = memfs.readdir(dirToSearch);
            const filtered = entries.filter(e => e.startsWith(filePrefix));
            matches = filtered.map(name => {
              const fullPath = dirToSearch === '/' ? '/' + name : dirToSearch + '/' + name;
              let suffix = '';
              try {
                if (memfs.stat(fullPath).isDirectory()) suffix = '/';
              } catch {}
              const dirPrefix = slashIdx !== -1 ? prefix.slice(0, slashIdx + 1) : '';
              return dirPrefix + name + suffix;
            });
          } catch {}
        }

        if (matches.length === 1) {
          const completion = matches[0] + (isFirstToken ? ' ' : '');
          const before = line.slice(0, lastSpace + 1);
          const after = line.slice(cursorPos);
          line = before + completion + after;
          cursorPos = before.length + completion.length;
          redrawLine();
        } else if (matches.length > 1) {
          write('\r\n' + matches.join('  ') + '\r\n');
          printPrompt();
          write(line);
          const diff = line.length - cursorPos;
          if (diff > 0) write(`\x1b[${diff}D`);
        }
        continue;
      }

      // Printable character
      if (ch >= ' ') {
        const prev = cursorPos;
        line = line.slice(0, cursorPos) + ch + line.slice(cursorPos);
        cursorPos++;
        // If inserting in the middle, redraw the rest
        if (cursorPos < line.length) {
          rewriteLine(prev);
        } else {
          write(ch);
        }
      }
    }
  }

  function prompt() {
    printPrompt();
  }

  function getCwd() {
    return cwd;
  }

  function setCwd(next) {
    if (typeof next === 'string' && next.length > 0) cwd = next;
  }

  function setHistory(entries) {
    if (!Array.isArray(entries)) return;
    history = entries.slice(-200);
    historyIdx = -1;
  }

  return {
    feed,
    prompt,
    getCwd,
    setCwd,
    setHistory,
    get history() { return history.slice(); },
    get busy() { return busy; },
  };
}

export default createShell;
