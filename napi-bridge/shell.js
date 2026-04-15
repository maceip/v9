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
    write(`${CWD_COLOR}${shortCwd()}${RESET} ${PROMPT_COLOR}$ ${RESET}`);
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

  /**
   * Feed raw terminal input data (from xterm onData).
   * Handles line editing, special keys, and command execution.
   */
  function feed(data) {
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
