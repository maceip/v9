# Phase 3 Runbook: cloud (Implementation) + CurSOR (Conformance Tests)

**Effective after:** P1/P2 gating verification passes (`make release-gate` exits 0)
**Duration target:** 3 weeks
**Rule:** CurSOR writes conformance tests FIRST. cloud implements AGAINST those tests. No implementation lands without a passing conformance suite.

---

## How This Works

```
CurSOR writes test          →  cloud reads test  →  cloud implements  →  tests pass  →  merge
(against real Node.js)         (understands the      (against the         (verified     (into
                                contract)             contract)            in CI)        integration)
```

**Why test-first:** We saw in Phase 2 what happens when implementation comes first — engineers test their own code and declare victory. Kimmy shipped a type guard typo that no test caught because the tests were written to match the (broken) implementation, not the Node.js contract.

**The conformance catalog (`03-04-CONFORMANCE-CATALOG.md`) is the source of truth.** Both engineers work from it. If a behavior is in the catalog, it gets a test. If it gets a test, it gets implemented. No gaps.

---

## Week 1: Foundation

### CurSOR — Tests

Write these test files, validate they pass in real Node.js (`node tests/conformance/test-*.mjs`):

| Day | File | What to Test | Catalog Section |
|-----|------|-------------|----------------|
| 1 | `tests/conformance/test-eventemitter.mjs` | All MUST behaviors + edge cases (error event throws, removeListener during emit, once removes before calling, Symbol events) | EventEmitter Contract |
| 1 | `tests/conformance/test-path.mjs` | All path methods including `.extname('.hidden')` → `''` edge case | path Contract |
| 2 | `tests/conformance/test-buffer.mjs` | All encodings (utf8/base64/hex/ascii/latin1/base64url), memory sharing (`Buffer.from(ab, offset, len)` shares memory), `byteLength` for multibyte | Buffer Contract |
| 3 | `tests/conformance/test-util.mjs` | `promisify`, `inherits`, `types.*`, basic `inspect` | util Contract |
| 3 | `tests/conformance/test-url.mjs` | `fileURLToPath`, `pathToFileURL`, `URL` constructor | url Contract |

**Important:** These tests must import from a module path that cloud's implementation will export. Use this pattern:

```js
// tests/conformance/test-eventemitter.mjs
import { EventEmitter } from '../napi-bridge/eventemitter.js';
// ... or if testing the full registration:
// const { EventEmitter } = require('events'); // via browser builtin override
```

For now, test against Node.js builtins to validate the tests themselves:
```js
// Temporary: validate against real Node.js
import { EventEmitter } from 'node:events';
```

Then switch imports to our implementation once cloud delivers.

### cloud — Implementation

| Day | File | What to Implement | Depends On |
|-----|------|------------------|------------|
| 1 | `napi-bridge/eventemitter.js` | Full EventEmitter class | Nothing |
| 2 | `napi-bridge/eventemitter.js` | Edge cases: error event, removeListener during emit, once semantics, Symbol events, newListener/removeListener events | CurSOR's tests |
| 3 | `napi-bridge/util.js` | `promisify`, `inherits`, `inspect` (basic), `types.*` | Nothing |
| 3 | `napi-bridge/browser-builtins.js` | Extend `pathBridge` with `path.posix` alias; extend `urlBridge` with `fileURLToPath`/`pathToFileURL` | Nothing |

**End of Week 1 gate:** `node tests/conformance/test-eventemitter.mjs` passes with our implementation. `test-path.mjs`, `test-url.mjs`, `test-util.mjs` pass.

---

## Week 2: Streams + Buffer + Process

### CurSOR — Tests

| Day | File | What to Test | Catalog Section |
|-----|------|-------------|----------------|
| 1 | `tests/conformance/test-streams.mjs` | Readable (flowing/paused), Writable (write/end/finish), pipe(), backpressure (write returns false → pause → drain → resume) | Streams Contract |
| 2 | `tests/conformance/test-streams.mjs` | Transform, Duplex, pipeline(), destroy propagation through pipe chain, push(null) semantics | Streams Contract |
| 2 | **CRITICAL: backpressure stress test** | Pipe 50MB through slow Transform. Memory must stay bounded (~2x highWaterMark). If memory grows to 50MB, test fails. | Hard Tasks #2 |
| 3 | `tests/conformance/test-process.mjs` | env injection, cwd, stdin as Readable, stdout/stderr as Writable, lifecycle events (exit, uncaughtException), nextTick ordering | process Contract |

### cloud — Implementation

| Day | File | What to Implement | Depends On |
|-----|------|------------------|------------|
| 1 | `napi-bridge/streams.js` | Readable (flowing mode, read(), push(), on('data'), on('end')) | EventEmitter |
| 1 | `napi-bridge/streams.js` | Writable (write(), end(), on('finish'), on('drain')) | EventEmitter |
| 2 | `napi-bridge/streams.js` | **Backpressure**: write() returns false when buffer > highWaterMark; pipe() wires pause/resume/drain | EventEmitter |
| 2 | `napi-bridge/streams.js` | Transform, Duplex, pipeline(), finished() | Readable + Writable |
| 3 | `napi-bridge/browser-builtins.js` | Extend `bufferBridge`: toString(encoding), slice (shared memory!), copy, compare, indexOf, write, byteLength. All 7 encodings. | Nothing |
| 3 | `napi-bridge/browser-builtins.js` | Extend `processBridge`: EventEmitter mixin, stdin as Readable, stdout/stderr as Writable, env injection via initEdgeJS, lifecycle events | EventEmitter + Streams |

**End of Week 2 gate:** All stream conformance tests pass including backpressure stress test. Buffer encoding roundtrips work. process.stdin/stdout are real streams.

---

## Week 3: Filesystem + Integration

### CurSOR — Tests

| Day | File | What to Test | Catalog Section |
|-----|------|-------------|----------------|
| 1 | `tests/conformance/test-fs.mjs` | readFile/writeFile (sync + async + promises), readdir (with Dirent), stat (all fields), mkdir (recursive), unlink, rename | fs Contract |
| 1 | `tests/conformance/test-fs.mjs` | **Error shapes**: every error has `.code`, `.errno`, `.syscall`, `.path`. ENOENT/EISDIR/ENOTDIR/EEXIST all correct. `existsSync` never throws. | fs Contract — error codes |
| 2 | `tests/conformance/test-fs.mjs` | createReadStream/createWriteStream, fs.promises namespace, fd-based I/O (open/read/write/close) | fs Contract |
| 2 | **Stress test** | Create 1000 files, read all, stat all, delete all. Measure time + memory. | WS16-T5 |
| 3 | `tests/test-integration-phase3.mjs` | End-to-end: create file → read it → stream through Transform → write result → verify. Uses all Phase 3 modules together. | All |
| 3 | Update `scripts/release-gate.mjs` | Add Phase 3 checkpoints: `P3-GATE-CORE-MODULES`, `P3-GATE-FILESYSTEM`, `P3-GATE-STREAMS-BACKPRESSURE` | WS16-T4 |

### cloud — Implementation

| Day | File | What to Implement | Depends On |
|-----|------|------------------|------------|
| 1 | `napi-bridge/memfs.js` | MEMFS inode tree, path resolution, stat object, error generation (ENOENT/EISDIR/ENOTDIR/EEXIST/EACCES with correct shape) | Buffer |
| 1 | `napi-bridge/memfs.js` | File descriptor table (open/read/write/close), memory pressure tracking | Nothing |
| 2 | `napi-bridge/fs.js` | fs API surface: readFile/writeFile/readdir/stat/mkdir/unlink/rename (sync + async + promises). existsSync, accessSync, realpathSync. | MEMFS + Buffer |
| 2 | `napi-bridge/fs.js` | createReadStream/createWriteStream backed by Streams | MEMFS + Streams |
| 3 | `napi-bridge/index.js` | Module registration: wire `_registerBuiltinOverride` into EdgeJS module resolution. Register all modules (events, stream, buffer, process, path, url, util, fs). Wire `initEdgeJS({ files })` for MEMFS pre-population. | All modules |
| 3 | `Makefile` | Add `make test-core` and `make test-fs` targets | CurSOR's tests |

**End of Week 3 gate:** All conformance tests pass. Integration test passes. `make release-gate` with Phase 3 checkpoints passes. `make test` includes all new test targets.

---

## File Ownership (No Overlaps)

| File | Owner | Rule |
|------|-------|------|
| `napi-bridge/eventemitter.js` (NEW) | cloud | cloud creates and owns |
| `napi-bridge/streams.js` (NEW) | cloud | cloud creates and owns |
| `napi-bridge/util.js` (NEW) | cloud | cloud creates and owns |
| `napi-bridge/memfs.js` (NEW) | cloud | cloud creates and owns |
| `napi-bridge/fs.js` (NEW) | cloud | cloud creates and owns |
| `napi-bridge/browser-builtins.js` | cloud | cloud extends (Buffer, process, path, url) |
| `napi-bridge/index.js` | cloud | cloud modifies (module registration, initEdgeJS) |
| `tests/conformance/*.mjs` (NEW) | CurSOR | CurSOR creates and owns ALL conformance tests |
| `tests/test-integration-phase3.mjs` (NEW) | CurSOR | CurSOR creates |
| `scripts/release-gate.mjs` | CurSOR | CurSOR adds Phase 3 checkpoints |
| `Makefile` | cloud | cloud adds test targets (coordinate with CurSOR on names) |

**Zero shared files.** cloud never touches `tests/conformance/`. CurSOR never touches `napi-bridge/*.js`. This eliminates merge conflicts entirely.

---

## Daily Cadence

```
Morning:  CurSOR pushes new/updated conformance tests
          cloud pulls, reads tests, understands contract
Midday:   cloud implements against the tests
Evening:  cloud pushes, CurSOR runs full suite, files bugs if needed
```

No PRs between them — both work on the same integration branch (`integration/phase3`). Single branch, zero merge overhead.

---

## Quality Gates (Non-Negotiable)

### Every conformance test must:
1. Pass against real Node.js FIRST (`node --experimental-vm-modules tests/conformance/test-*.mjs`)
2. Test MUST behaviors from the conformance catalog — not "works for me" behaviors
3. Include the edge cases listed in the catalog (these are the ones that matter)
4. Run in < 5 seconds (except stress tests)

### Every implementation must:
1. Pass ALL conformance tests for that module before merging
2. Not break any existing tests (38 current tests must stay green)
3. Not introduce `|| true`, `catch {}` (empty), or `void 0` return shortcuts
4. Be reviewed against the conformance catalog, not just the tests

### Backpressure is the single hardest deliverable
If streams ship without working backpressure, Phase 4 (networking/streaming SSE) will fail under load. This is not optional. The stress test (50MB through slow Transform, memory stays bounded) must pass.

---

## What cloud Must NOT Do

1. **Do not write your own tests.** CurSOR writes all tests. You implement against them.
2. **Do not stub fs errors as `new Error('not found')`.** Errors must have `.code`, `.errno`, `.syscall`, `.path`. Claude Code checks `err.code`.
3. **Do not implement `Buffer.from(arrayBuffer)` as a copy.** It must share memory. The conformance test checks this.
4. **Do not skip backpressure.** `write()` must return `false` when the buffer exceeds `highWaterMark`. The conformance test measures memory.
5. **Do not use `queueMicrotask` for `process.nextTick`.** It has wrong ordering relative to Promises. Use a dedicated microtask queue that drains before Promise callbacks.

## What CurSOR Must NOT Do

1. **Do not write tests that only test the happy path.** Every MUST edge case in the catalog = a test.
2. **Do not write tests that pass when the implementation is wrong.** Validate against real Node.js first.
3. **Do not weaken thresholds to make tests pass.** If the backpressure stress test fails, the implementation is wrong, not the threshold.
4. **Do not skip error shape tests.** `err.code === 'ENOENT'` is the most important assertion in the fs tests.
5. **Do not write conformance tests that import from `node:*`.** They must import from our modules so they test our code, not Node.js. Use a separate validation script to run against Node.js.

---

## Phase 3 Exit Criteria

Phase 3 is done when ALL are true:

- [ ] All 7 conformance test suites pass (EventEmitter, Buffer, Streams, process, fs, util, path+url)
- [ ] Backpressure stress test passes (50MB, memory bounded)
- [ ] fs stress test passes (1000 files create/read/stat/delete)
- [ ] Integration test passes (file → stream → transform → file roundtrip)
- [ ] All 38 existing tests still pass
- [ ] Module registration works: `eval("require('path').join('/a','b')")` returns `/a/b` through Wasm
- [ ] `make release-gate` exits 0 with Phase 3 checkpoints
- [ ] No `|| true` anywhere. No empty catch blocks. No stubbed error codes.
