// ESM wrapper for node:console
export const Console = globalThis.console.Console || class Console {
  constructor(opts) {
    const out = opts?.stdout || { write: (s) => console.log(s) };
    const err = opts?.stderr || { write: (s) => console.error(s) };
    Object.assign(this, {
      log: (...a) => out.write(a.join(' ') + '\n'),
      error: (...a) => err.write(a.join(' ') + '\n'),
      warn: (...a) => err.write(a.join(' ') + '\n'),
      info: (...a) => out.write(a.join(' ') + '\n'),
      debug: (...a) => out.write(a.join(' ') + '\n'),
      trace: (...a) => out.write(a.join(' ') + '\n'),
      dir: (...a) => out.write(a.join(' ') + '\n'),
      time: () => {}, timeEnd: () => {}, timeLog: () => {},
      assert: (v, ...a) => { if (!v) err.write('Assertion failed: ' + a.join(' ') + '\n'); },
      count: () => {}, countReset: () => {},
      group: () => {}, groupEnd: () => {},
      table: (...a) => out.write(a.join(' ') + '\n'),
      clear: () => {},
    });
  }
};

export const { log, error, warn, info, debug, trace, dir, time, timeEnd, timeLog,
  assert, count, countReset, group, groupCollapsed, groupEnd, table, clear,
  dirxml, profile, profileEnd, timeStamp } = globalThis.console;

const _module = { Console, log, error, warn, info, debug, trace, dir, time, timeEnd, timeLog,
  assert, count, countReset, group, groupCollapsed, groupEnd, table, clear };
export default _module;
