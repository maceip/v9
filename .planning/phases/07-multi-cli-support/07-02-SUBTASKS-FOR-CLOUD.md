# Phase 7 Subtasks for cloud

**Branch:** `codex-worksstream` (pull latest first)
**Goal:** All 13 missing Node.js modules work. Claude Code, Codex, and Gemini CLI all launch without crashing.
**Rule:** Use existing battle-tested packages where they exist. Write code only where nothing exists. Do NOT over-engineer.

---

## Subtask 1: Install existing packages

```bash
npm install os-browserify tty-browserify fflate browserify-zlib \
  isomorphic-timers-promises assert string_decoder constants-browserify
```

These 7 packages are battle-tested (7M-90M weekly downloads each), MIT licensed, and work in browsers. Do not rewrite them.

---

## Subtask 2: os module
**Source:** `os-browserify` (npm, 0.8KB)
**File:** `napi-bridge/os.js`
**Action:** Import `os-browserify`, extend with missing methods that the CLIs need:
- `os.userInfo()` → `{ username: 'user', homedir: '/home/user', shell: '/bin/bash', uid: 1000, gid: 1000 }`
- `os.hostname()` → `'browser'`
- `os.cpus()` → `[{ model: 'browser', speed: 2400 }]` (or `navigator.hardwareConcurrency` for count)
- `os.totalmem()` → `navigator.deviceMemory * 1024 * 1024 * 1024` or `4GB` default
- `os.freemem()` → `2GB` default
- `os.constants.signals` → `{ SIGTERM: 15, SIGINT: 2, SIGKILL: 9, ... }`
- Make `homedir()` and `tmpdir()` configurable via `initEdgeJS({ home: '/home/user', tmp: '/tmp' })`
**Register:** `_registerBuiltinOverride('os', osModule)`
**Needed by:** Claude Code, Codex, Gemini — all call `os.homedir()` at startup for config directory

---

## Subtask 3: tty module
**Source:** `tty-browserify` (npm, 0.4KB) as base, extend
**File:** `napi-bridge/tty.js`
**Action:** Import `tty-browserify` for `isatty()`. Override to return `true` for fd 0/1/2 (our terminal IS a tty). Add:
- `ReadStream` class extending our Readable with `isTTY: true`, `setRawMode(mode)`
- `WriteStream` class extending our Writable with `isTTY: true`, `columns`, `rows`, `getColorDepth()` → `24`, `hasColors()` → `true`, `getWindowSize()` → `[columns, rows]`
**Register:** `_registerBuiltinOverride('tty', ttyModule)`
**Needed by:** Claude Code (Ink checks `process.stdout.isTTY` and `getColorDepth()` to decide rendering), Gemini (compatibility checks)

---

## Subtask 4: readline module
**Source:** Write ourselves (~80 lines). No good existing lib.
**File:** `napi-bridge/readline.js`
**Action:** Implement:
- `createInterface({ input, output, terminal, prompt })` → returns `Interface`
- `Interface` extends EventEmitter:
  - `question(query, callback)` — write query to output, collect input until `\n`, call callback with line
  - `prompt()` — write prompt to output
  - `close()` — emit 'close', detach from input
  - `on('line', fn)` — split input on `\n`, emit per line
  - `on('close', fn)` — fires on close
  - `write(data)` — inject data
  - `setPrompt(str)` — change prompt
  - `[Symbol.asyncIterator]()` — async iteration over lines
- Listen on `input.on('data')`, buffer until `\n`, emit 'line'
**Register:** `_registerBuiltinOverride('readline', readlineModule)` and `_registerBuiltinOverride('readline/promises', readlinePromisesModule)`
**Needed by:** Claude Code (interactive prompts), Gemini (user input)

---

## Subtask 5: zlib module
**Source:** `fflate` (npm, 8-31KB) for compression engine + `browserify-zlib` (npm, 51KB) for Node.js API wrapper
**File:** `napi-bridge/zlib.js`
**Action:** Import `browserify-zlib` which wraps pako with the Node.js zlib API (createGzip, createGunzip, createDeflate, createInflate, gzipSync, gunzipSync, deflateSync, inflateSync, constants). If `browserify-zlib` is too heavy, use `fflate` directly and wrap with Transform streams:
- `createGunzip()` → Transform that calls `fflate.gunzipSync` on chunks
- `createGzip()` → Transform that calls `fflate.gzipSync` on chunks
- `gunzipSync(buf)` → `fflate.gunzipSync(buf)`
- `gzipSync(buf)` → `fflate.gzipSync(buf)`
- Export `constants` (Z_SYNC_FLUSH, Z_FINISH, etc.)
**Register:** `_registerBuiltinOverride('zlib', zlibModule)`
**Needed by:** Claude Code (compressed API responses), Gemini (compressed responses)

---

## Subtask 6: async_hooks module
**Source:** Extract from `unenv` (github.com/unjs/unenv, MIT) — they have a working AsyncLocalStorage
**File:** `napi-bridge/async-hooks.js`
**Action:** Pull unenv's `AsyncLocalStorage` implementation. It uses instance variables and propagates through synchronous `run()`/`exit()` calls. Add:
- `AsyncResource` class (constructor + `runInAsyncScope()` pass-through)
- `executionAsyncId()` → `0`
- `triggerAsyncId()` → `0`
- `createHook()` → `{ enable() {}, disable() {} }`
**Register:** `_registerBuiltinOverride('async_hooks', asyncHooksModule)`
**Needed by:** Claude Code — uses `AsyncLocalStorage` for request context tracking throughout the conversation loop

---

## Subtask 7: module shim
**Source:** Write ourselves (~20 lines)
**File:** `napi-bridge/module-shim.js`
**Action:**
- `createRequire(filename)` → return our MEMFS `_memfsRequire` function scoped to the directory of `filename`
- `builtinModules` → array of all our registered module names
- `isBuiltin(name)` → check against the list
- `Module.prototype` → minimal shape
**Register:** `_registerBuiltinOverride('module', moduleShim)`
**Needed by:** Claude Code, Codex — both call `createRequire(import.meta.url)` for loading config files

---

## Subtask 8: timers/promises
**Source:** `isomorphic-timers-promises` (npm, 5.2KB)
**File:** `napi-bridge/timers-promises.js`
**Action:** Re-export `isomorphic-timers-promises`. It provides `setTimeout`, `setInterval`, `setImmediate` as Promise-returning functions with AbortSignal support.
**Register:** `_registerBuiltinOverride('timers/promises', timersPromises)` and `_registerBuiltinOverride('timers', timersModule)` (re-export globalThis timers)
**Needed by:** Claude Code (retry logic), Gemini (debouncing)

---

## Subtask 9: stream/consumers
**Source:** Write ourselves (~25 lines, trivial)
**File:** Extend `napi-bridge/streams.js` or new `napi-bridge/stream-consumers.js`
**Action:**
```js
async function text(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
  }
  return chunks.join('');
}
async function json(stream) { return JSON.parse(await text(stream)); }
async function arrayBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk));
  }
  const result = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let offset = 0;
  for (const c of chunks) { result.set(c, offset); offset += c.length; }
  return result.buffer;
}
async function buffer(stream) { return Buffer.from(await arrayBuffer(stream)); }
async function blob(stream) { return new Blob([await arrayBuffer(stream)]); }
```
**Register:** `_registerBuiltinOverride('stream/consumers', consumers)`
**Needed by:** Claude Code — consumes API response bodies

---

## Subtask 10: worker_threads stub
**Source:** Extract from `unenv` (MIT) — full API surface as stubs
**File:** `napi-bridge/worker-threads.js`
**Action:** Pull unenv's `worker_threads` implementation:
- `isMainThread` → `true`
- `parentPort` → `null`
- `workerData` → `undefined`
- `threadId` → `0`
- `Worker` class — constructor accepts filename, `postMessage()` exists, but spawning is a no-op that emits 'exit' immediately
- `MessageChannel`, `MessagePort`, `BroadcastChannel` — use browser-native versions where available
- `resourceLimits` → `{}`
**Register:** `_registerBuiltinOverride('worker_threads', workerThreadsModule)`
**Needed by:** Claude Code — imports it but may gracefully degrade when workers can't spawn

---

## Subtask 11: assert module
**Source:** `assert` (npm package `commonjs-assert`, 48KB, 15.5M downloads/wk)
**File:** `napi-bridge/assert.js`
**Action:** Import the `assert` package. It's the official browserify assert, tracks Node.js API exactly. Provides `assert()`, `assert.ok()`, `assert.strictEqual()`, `assert.deepStrictEqual()`, `assert.throws()`, `assert.rejects()`, `assert.fail()`, `AssertionError`.
**Register:** `_registerBuiltinOverride('assert', assertModule)`
**Needed by:** Gemini CLI — uses assert in validation paths

---

## Subtask 12: string_decoder module
**Source:** `string_decoder` (npm, 3.7KB, 90M+ downloads/wk — this IS the Node.js implementation published to npm)
**File:** `napi-bridge/string-decoder.js`
**Action:** Import and re-export. This is the official Node.js mirror package, used by `readable-stream` internally. Zero adaptation needed.
**Register:** `_registerBuiltinOverride('string_decoder', stringDecoderModule)`
**Needed by:** Gemini CLI — incremental UTF-8 decoding in stream processing

---

## Subtask 13: constants module
**Source:** `constants-browserify` (npm, 4KB, 9M downloads/wk)
**File:** `napi-bridge/constants.js`
**Action:** Import and re-export. All POSIX constants (signals, errno codes, fs flags).
**Register:** `_registerBuiltinOverride('constants', constantsModule)`
**Needed by:** Codex — checks `os.constants.signals`

---

## Subtask 14: inspector stub
**Source:** Write ourselves (~10 lines)
**File:** `napi-bridge/inspector.js`
**Action:**
```js
export function open() {}
export function close() {}
export function url() { return undefined; }
export function waitForDebugger() {}
export class Session { constructor() { throw new Error('inspector not available in browser'); } }
export const console = { ...globalThis.console };
```
**Register:** `_registerBuiltinOverride('inspector', inspectorModule)` and `_registerBuiltinOverride('inspector/promises', inspectorModule)`
**Needed by:** Claude Code — imports but doesn't actively use

---

## Subtask 15: rg (ripgrep) command shim
**File:** Extend `napi-bridge/shell-commands.js`
**Action:** Add `rg` command that translates ripgrep flags to our grep shim:

| rg flag | grep equivalent |
|---------|----------------|
| `rg pattern path` | `grep -r pattern path` |
| `rg -i` | `grep -ri` |
| `rg -l` | `grep -rl` |
| `rg -n` | `grep -rn` |
| `rg -c` / `--count` | `grep -rc` |
| `rg -w` | `grep -rw` |
| `rg -F` / `--fixed-strings` | `grep -F` |
| `rg -t js` | filter by `.js` extension |
| `rg -g '*.ts'` | filter by glob |
| `rg --no-heading` | default (no file grouping) |
| `rg --json` | JSON output format per match |
| `rg --type-list` | print supported types |
| `rg -e PATTERN` | explicit pattern flag |
| `rg --hidden` | include hidden files |
| `rg --no-ignore` | don't respect .gitignore |

Parse rg args, translate to grep args, call our existing grep shim. Handle `--json` output format specially (Claude Code parses rg JSON output).
**Needed by:** Claude Code — uses ripgrep for all file searches

---

## Subtask 16: node-pty → child_process adapter
**File:** `napi-bridge/node-pty-shim.js`
**Action:** Gemini CLI imports `node-pty` for pseudo-terminal. Provide a shim that:
- `spawn(shell, args, options)` → delegate to our `child_process.spawn(shell, args, { stdio: 'pipe' })`
- Return object has `.onData(callback)` (maps to `stdout.on('data')`)
- `.write(data)` (maps to `stdin.write(data)`)
- `.kill()` (maps to `child.kill()`)
- `.resize(cols, rows)` — no-op (MEMFS commands don't care about terminal size)
**Register:** `_registerBuiltinOverride('node-pty', nodePtyShim)`
**Needed by:** Gemini CLI

---

## Subtask 17: Register all modules
**File:** `napi-bridge/browser-builtins.js`
**Action:** Import and register all 16 items above. Ensure `node:` prefix stripping works for all of them (e.g., `require('node:os')` → our os module).
**Also register aliases:**
- `node:os` → os
- `node:tty` → tty
- `node:readline` → readline
- `node:readline/promises` → readline/promises
- `node:zlib` → zlib
- `node:async_hooks` → async_hooks
- `node:module` → module
- `node:timers/promises` → timers/promises
- `node:stream/consumers` → stream/consumers
- `node:worker_threads` → worker_threads
- `node:assert` → assert
- `node:string_decoder` → string_decoder
- `node:constants` → constants
- `node:inspector` → inspector

---

## Subtask 18: Smoke test all three CLIs

**Claude Code:**
```js
const runtime = await initEdgeJS({
  files: { /* load cli.js from npm package */ },
  env: { ANTHROPIC_API_KEY: '...' },
});
runtime.runFile('/node_modules/@anthropic-ai/claude-code/cli.js');
// Verify: terminal shows Claude Code prompt without crashing
```

**Codex:**
```js
// Load open-codex entry point
runtime.runFile('/node_modules/codex-cli/dist/cli.js');
// Verify: terminal shows Codex prompt without crashing
```

**Gemini CLI:**
```js
// Load gemini-cli entry point
runtime.runFile('/node_modules/@google/gemini-cli/dist/cli.js');
// Verify: terminal shows Gemini prompt without crashing
```

For each CLI: "launches without crashing" is the Phase 7 bar. "Works well and fast" is Phase 8.

---

## Do NOT touch any file in `tests/`.

**Total: 18 subtasks. 7 npm installs, 4 small implementations, 3 stubs, 2 shims, 1 registration task, 1 smoke test.**
