# Phase 3 Engineering Workstreams

**Date:** 2026-03-18
**Audience:** Runtime/Module implementers
**Intent:** Parallel workstream assignments for 4 engineers to deliver Phase 3 at maximum velocity

## Engineer Roster (Phase 3)

- `Gemini` — Build/platform + module registration infrastructure
- `cloud` — Core module semantics (EventEmitter, Streams)
- `Kimmy` — Buffer, process, util + fs API surface
- `CurSOR` — MEMFS engine, testing, integration validation

> **Note:** Codex is off the roster for Phase 3. Integration/release arbitration is distributed: `Gemini` owns build integration, `CurSOR` owns test/release gating. Cross-lane conflicts escalate to weekly sync (all 4 engineers).

---

## WS8 — Module Registration Infrastructure
**Goal:** Browser-side modules replace Wasm-compiled equivalents at runtime.

This is the Phase 3 critical path blocker. Nothing works until `_registerBuiltinOverride` is wired.

- `WS8-T1` Implement `_registerBuiltinOverride(name, impl)` in EdgeJS module resolution path. `Gemini`
- `WS8-T2` Wire `registerBrowserBuiltins()` call into `initEdgeJS()` lifecycle. `Gemini`
- `WS8-T3` Validate: `require('path')` returns `pathBridge`, not Wasm-compiled path module. `CurSOR`
- `WS8-T4` Validate: all 5 existing browser builtins (crypto, path, url, buffer, process) load via override. `CurSOR`

**Exit criteria:** All browser builtins registered and verified via `require()`.

---

## WS9 — EventEmitter (CORE-01)
**Goal:** Production-grade EventEmitter that matches Node.js behavioral contract.

- `WS9-T1` Implement EventEmitter class: `on`, `off`, `once`, `emit`, `removeListener`, `removeAllListeners`, `listenerCount`, `prependListener`, `eventNames`. `cloud`
- `WS9-T2` Implement `error` event semantics: unhandled error event throws. `cloud`
- `WS9-T3` Implement max listener warning (configurable via `setMaxListeners`). `cloud`
- `WS9-T4` Register as `events` module via builtin override. `cloud`
- `WS9-T5` Conformance test suite: 15+ test cases covering all methods and edge cases. `CurSOR`

**Exit criteria:** EventEmitter passes full conformance suite; registered as `events` module.

---

## WS10 — Buffer Enhancement (CORE-02)
**Goal:** Buffer supports all encodings and methods Claude Code uses.

- `WS10-T1` Add `toString(encoding)` for utf8, base64, hex, ascii, latin1, binary. `Kimmy`
- `WS10-T2` Add `slice()`, `subarray()`, `copy(target, targetStart, sourceStart, sourceEnd)`. `Kimmy`
- `WS10-T3` Add `compare()`, `equals()`, `indexOf()`, `includes()`. `Kimmy`
- `WS10-T4` Add `write(string, offset, length, encoding)`, `byteLength(string, encoding)`. `Kimmy`
- `WS10-T5` Make Buffer instances inherit from Uint8Array with Node.js Buffer prototype methods. `Kimmy`
- `WS10-T6` Encoding roundtrip tests for all supported encodings. `CurSOR`

**Exit criteria:** `Buffer.from('hello').toString('hex')` roundtrips. All Node.js Buffer methods Claude Code uses work.

---

## WS11 — Streams (CORE-03)
**Goal:** Readable, Writable, Transform, Duplex with backpressure and pipe().

- `WS11-T1` Implement Readable: flowing/paused modes, `read()`, `push()`, `pipe()`, `unpipe()`, `on('data')`, `on('end')`, `on('error')`. `cloud`
- `WS11-T2` Implement Writable: `write()`, `end()`, `on('finish')`, `on('drain')`, backpressure via `highWaterMark`. `cloud`
- `WS11-T3` Implement Transform: `_transform()`, `_flush()`, extends Duplex. `cloud`
- `WS11-T4` Implement Duplex: extends both Readable and Writable. `cloud`
- `WS11-T5` Implement `pipeline()` and `finished()` utility functions. `cloud`
- `WS11-T6` Register as `stream` module. Wire Readable/Writable to stream exports. `cloud`
- `WS11-T7` Backpressure stress test: pipe 10MB through Transform without unbounded buffering. `CurSOR`

**Exit criteria:** `readable.pipe(transform).pipe(writable)` works with backpressure. All stream types functional.

---

## WS12 — Process Enhancement (CORE-04, CORE-05)
**Goal:** process object is a proper Node.js process with injectable env, streams, and lifecycle events.

- `WS12-T1` Make `process.env` injectable via `initEdgeJS({ env: { HOME: '/home/user', ... } })`. `Kimmy`
- `WS12-T2` Make `process.cwd()` configurable and return virtual working directory. `Kimmy`
- `WS12-T3` Wire `process.stdin` as a Readable stream (push data from terminal in Phase 6). `Kimmy`
- `WS12-T4` Wire `process.stdout` / `process.stderr` as Writable streams. `Kimmy`
- `WS12-T5` Implement `process.on('exit', fn)`, `process.on('uncaughtException', fn)` lifecycle events. `Kimmy`
- `WS12-T6` Make process extend EventEmitter. `Kimmy`
- `WS12-T7` Validate: `process.stdout.write('hello')` and `process.stdin.on('data', cb)` work end-to-end. `CurSOR`

**Depends on:** WS9 (EventEmitter), WS11 (Streams)
**Exit criteria:** process has injectable env, stream-based stdio, and lifecycle events.

---

## WS13 — Utilities (CORE-06, CORE-07, CORE-08)
**Goal:** path, url, and util modules complete for Claude Code usage.

- `WS13-T1` Add `path.posix` alias (identity) and `path.win32` stub (throws "not supported"). `Kimmy`
- `WS13-T2` Add `url.fileURLToPath()` and `url.pathToFileURL()`. `Kimmy`
- `WS13-T3` Implement `util.promisify(fn)`. `Kimmy`
- `WS13-T4` Implement `util.inherits(ctor, superCtor)`. `cloud`
- `WS13-T5` Implement `util.inspect(obj, opts)` — basic pretty-print (depth, colors optional). `cloud`
- `WS13-T6` Implement `util.types` — `isPromise`, `isDate`, `isRegExp`, `isArrayBuffer`, `isTypedArray`. `cloud`

**Exit criteria:** `util.promisify(fs.readFile)('/f')` works. `url.fileURLToPath` converts correctly.

---

## WS14 — MEMFS Filesystem Engine
**Goal:** In-memory POSIX filesystem tree powering the `fs` module.

- `WS14-T1` Implement inode tree: `{ type, content, children, stat }` with POSIX path resolution. `CurSOR`
- `WS14-T2` Implement file descriptor table: `open(path, flags)` → fd, `read(fd, buf)`, `write(fd, data)`, `close(fd)`. `CurSOR`
- `WS14-T3` Implement stat object: size, mtime, ctime, atime, mode, `isFile()`, `isDirectory()`, `isSymbolicLink()`. `CurSOR`
- `WS14-T4` Implement error generation: ENOENT, EISDIR, ENOTDIR, EEXIST, EACCES with proper `code` and `errno`. `CurSOR`
- `WS14-T5` Add memory pressure tracking: warn at 100MB total MEMFS, hard limit at 500MB. `CurSOR`

**Exit criteria:** MEMFS core passes internal API tests. Path resolution handles all POSIX edge cases.

---

## WS15 — fs Module API Surface
**Goal:** Complete `fs` module registered as browser builtin with all 7 required operations + Claude Code extras.

- `WS15-T1` Implement `readFile` / `readFileSync` with encoding option. `Kimmy`
- `WS15-T2` Implement `writeFile` / `writeFileSync` with encoding + mode options. `Kimmy`
- `WS15-T3` Implement `readdir` / `readdirSync` with `withFileTypes` (Dirent) support. `Kimmy`
- `WS15-T4` Implement `stat` / `statSync` / `lstat` / `lstatSync`. `CurSOR`
- `WS15-T5` Implement `mkdir` / `mkdirSync` with `{ recursive: true }`. `CurSOR`
- `WS15-T6` Implement `unlink` / `unlinkSync`. `CurSOR`
- `WS15-T7` Implement `rename` / `renameSync`. `CurSOR`
- `WS15-T8` Implement `existsSync`, `accessSync`, `realpathSync`. `Kimmy`
- `WS15-T9` Implement `createReadStream` / `createWriteStream` (backed by Streams from WS11). `cloud`
- `WS15-T10` Implement `fs.promises` namespace (thin async wrappers). `Kimmy`
- `WS15-T11` Wire `initEdgeJS({ files: { '/path': 'content' } })` to pre-populate MEMFS. `Gemini`
- `WS15-T12` Register `fs` module via builtin override. `Gemini`

**Depends on:** WS14 (MEMFS engine), WS10 (Buffer), WS11 (Streams)
**Exit criteria:** All 7 required fs operations work sync + async + promises. Claude Code can read/write/list/stat files.

---

## WS16 — Phase 3 Testing & Release Gate
**Goal:** Comprehensive test coverage and machine-enforced release gate for Phase 3.

- `WS16-T1` Write `tests/test-core-modules.mjs`: EventEmitter, Buffer, Streams, process, util conformance. `CurSOR`
- `WS16-T2` Write `tests/test-filesystem.mjs`: all fs operations, error codes, edge cases, recursive mkdir. `CurSOR`
- `WS16-T3` Write integration test: create file, read it back, stream it, pipe through transform. `CurSOR`
- `WS16-T4` Add Phase 3 checkpoints to release gate (`scripts/release-gate.mjs`). `CurSOR`
- `WS16-T5` Stress test: create 1000 files, read all, stat all, delete all — measure time and memory. `CurSOR`
- `WS16-T6` Add `make test-core` and `make test-fs` targets to Makefile. `Gemini`

**Exit criteria:** All tests pass. Release gate includes Phase 3 checkpoints. No test suppression.

---

## Parallelization Strategy

### Team Topology (4 Lanes)

- **Lane A: Infrastructure** (`Gemini`) — WS8 (module registration), WS15-T11/T12 (fs wiring), WS16-T6 (Makefile)
- **Lane B: Core Modules** (`cloud`) — WS9 (EventEmitter), WS11 (Streams), WS13-T4/T5/T6 (util), WS15-T9 (createReadStream)
- **Lane C: API Surface** (`Kimmy`) — WS10 (Buffer), WS12 (process), WS13-T1/T2/T3 (path/url/util), WS15-T1/T2/T3/T8/T10 (fs sync/async/promises)
- **Lane D: Engine + Validation** (`CurSOR`) — WS8-T3/T4 (registration validation), WS14 (MEMFS engine), WS15-T4/T5/T6/T7 (fs stat/mkdir/unlink/rename), WS16 (all testing)

### Execution Order

```
Week 1: WS8 (module registration — CRITICAL PATH BLOCKER)
         WS9 starts in parallel (EventEmitter, no registration dependency)
         WS14 starts in parallel (MEMFS engine, no registration dependency)
         WS10 starts in parallel (Buffer enhancement, no registration dependency)

Week 2: WS8 complete → WS11 (Streams, depends on EventEmitter)
         WS12 starts (process, depends on EventEmitter + Streams arriving)
         WS14 continues → WS15 starts (fs API, depends on MEMFS)
         WS13 starts (util/path/url polish)

Week 3: WS15 completes (fs full API surface)
         WS16 (testing + release gate)
         Integration validation across all modules
```

### Merge Discipline

- Single owning lane per file:
  - `napi-bridge/index.js` (module resolution) → Lane A
  - `napi-bridge/eventemitter.js`, `napi-bridge/streams.js` → Lane B
  - `napi-bridge/browser-builtins.js` (extensions) → Lane C
  - `napi-bridge/memfs.js`, `tests/*` → Lane D
- Daily integration branch: `integration/phase3-core-modules`
- No `|| true` in any test target. Ever.

### Critical Path

```
WS8 (registration) ──→ WS9 (EventEmitter) ──→ WS11 (Streams) ──→ WS12 (process.stdin/stdout)
                                                    │                        │
                                                    ↓                        ↓
                                              WS15-T9 (createReadStream)   WS15 (fs API)
                                                                             ↑
WS14 (MEMFS engine) ────────────────────────────────────────────────────────┘
```

WS10 (Buffer) and WS13 (util) are off the critical path and can proceed independently.

---

## By Engineer (Responsibility View)

### `Gemini` — 5 tasks
- WS8-T1 Module registration hook implementation
- WS8-T2 initEdgeJS lifecycle wiring
- WS15-T11 initEdgeJS files pre-population
- WS15-T12 fs module builtin registration
- WS16-T6 Makefile test targets

### `cloud` — 12 tasks
- WS9-T1 EventEmitter core implementation
- WS9-T2 Error event semantics
- WS9-T3 Max listener warning
- WS9-T4 Events module registration
- WS11-T1 Readable stream
- WS11-T2 Writable stream
- WS11-T3 Transform stream
- WS11-T4 Duplex stream
- WS11-T5 pipeline() and finished()
- WS11-T6 Stream module registration
- WS13-T4 util.inherits
- WS13-T5 util.inspect
- WS13-T6 util.types
- WS15-T9 createReadStream/createWriteStream

### `Kimmy` — 15 tasks
- WS10-T1 Buffer.toString(encoding)
- WS10-T2 Buffer.slice/copy
- WS10-T3 Buffer.compare/indexOf
- WS10-T4 Buffer.write/byteLength
- WS10-T5 Buffer prototype chain
- WS12-T1 process.env injection
- WS12-T2 process.cwd configuration
- WS12-T3 process.stdin as Readable
- WS12-T4 process.stdout/stderr as Writable
- WS12-T5 process lifecycle events
- WS12-T6 process extends EventEmitter
- WS13-T1 path.posix/win32
- WS13-T2 url.fileURLToPath
- WS13-T3 util.promisify
- WS15-T1 fs.readFile/readFileSync
- WS15-T2 fs.writeFile/writeFileSync
- WS15-T3 fs.readdir/readdirSync
- WS15-T8 fs.existsSync/accessSync/realpathSync
- WS15-T10 fs.promises

### `CurSOR` — 16 tasks
- WS8-T3 Module registration validation (require returns override)
- WS8-T4 All browser builtins load validation
- WS9-T5 EventEmitter conformance tests
- WS10-T6 Buffer encoding roundtrip tests
- WS11-T7 Streams backpressure stress test
- WS12-T7 process stdio end-to-end validation
- WS14-T1 MEMFS inode tree
- WS14-T2 File descriptor table
- WS14-T3 Stat object implementation
- WS14-T4 Error code generation
- WS14-T5 Memory pressure tracking
- WS15-T4 fs.stat/lstat
- WS15-T5 fs.mkdir (recursive)
- WS15-T6 fs.unlink
- WS15-T7 fs.rename
- WS16-T1 Core modules test suite
- WS16-T2 Filesystem test suite
- WS16-T3 Integration test
- WS16-T4 Release gate checkpoints
- WS16-T5 Stress test
- WS16-T6 (shared with Gemini) Makefile targets

---

## On-Call / Incident Calls (Phase 3)

- Module registration broken → `Primary: Gemini`, `Backup: cloud`
- Stream/EventEmitter regression → `Primary: cloud`, `Backup: Kimmy`
- Buffer/encoding corruption → `Primary: Kimmy`, `Backup: cloud`
- MEMFS data loss/corruption → `Primary: CurSOR`, `Backup: Kimmy`
- CI/test gate red → `Primary: CurSOR`, `Backup: Gemini`
- Cross-lane merge conflict → Weekly sync (all 4 engineers)

---

## Definition of "Phase 3 Done"

Phase 3 is marked done only when ALL are true:
- CORE-01: EventEmitter on/off/once/emit/removeListener passes conformance suite
- CORE-02: Buffer supports utf8/base64/hex with complete method coverage
- CORE-03: Streams pipe with backpressure; all 4 types functional
- CORE-04: process.env injectable, process.cwd configurable
- CORE-05: process.stdin/stdout/stderr are proper streams
- CORE-06: path module complete (already done, validated via override)
- CORE-07: url module complete with fileURLToPath
- CORE-08: util.promisify works
- FS-01 through FS-07: All filesystem operations pass tests
- All existing Phase 1/2 tests still pass
- Release gate includes Phase 3 checkpoints and passes
- No test suppression (`|| true`) anywhere
