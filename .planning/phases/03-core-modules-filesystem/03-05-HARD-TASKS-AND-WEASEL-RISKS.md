# Phase 3 Hard Tasks & Weasel Risk Register

**Purpose:** Flag tasks that are genuinely hard, open-ended, or where engineers will be tempted to fake it, skip it, or "forget" to mention it didn't actually work. These are the tasks that matter most to the project and are most likely to be punted.

**Rule:** If a task is on this list, it gets extra scrutiny during review. No "it mostly works" or "I'll fix that later." Either it passes the conformance catalog or it doesn't ship.

---

## CRITICAL RISK: Tasks That Will Get Faked

### 1. Module Registration Hook (WS8-T1) — `Gemini`
**Why it's hard:** `_registerBuiltinOverride` doesn't exist anywhere in the codebase. It's referenced in `browser-builtins.js:295` but never implemented. This isn't "wire up an existing thing" — it's "figure out how EdgeJS resolves modules at the Wasm/N-API boundary and intercept it." That requires understanding the C++ module resolution path that's been compiled to Wasm.
**How they'll fake it:** Implement a JS-side module map that works for tests but doesn't actually intercept Wasm-side `require()` calls. Tests pass because they only test the JS side.
**How to verify:** After registration, call `eval("require('path').join('/a', 'b')")` through the Wasm runtime. If it returns the pathBridge result, it's real. If it calls the Wasm-compiled path module, the override isn't working.
**Blast radius if faked:** Every single Phase 3 module is dead. Nothing works.

### 2. Backpressure in Streams (WS11-T2) — `cloud`
**Why it's hard:** Backpressure requires write() to return false when the internal buffer exceeds highWaterMark, the readable to pause, and the writable to emit 'drain' when the buffer drains. Getting this wrong means unbounded memory growth when piping large data.
**How they'll fake it:** write() always returns true. pipe() just calls write() in a loop. Works for small data, OOMs on anything over a few MB. Or they'll implement Readable and Writable independently but not wire the backpressure signaling between them in pipe().
**How to verify:** Pipe 50MB through a Transform that delays 1ms per chunk. If memory stays bounded (~highWaterMark * 2), it's real. If memory grows to 50MB, backpressure is fake.
**Blast radius if faked:** Claude Code reading a large file will OOM the browser tab. Anthropic API streaming responses will buffer entirely in memory.

### 3. NAPI-02 Soak Test (P2-REQ-4) — `CurSOR`
**Why it's hard:** 30 minutes is a long time. You have to actually run it. The harness needs representative workloads (not just `1+1` in a loop). Handle growth can be subtle — 1 handle leaked per call looks fine for 5 minutes but kills you at 30.
**How they'll fake it:** Run for 5 minutes with a trivial workload, declare "no growth observed." Or run with a workload that doesn't exercise the leaky paths (callbacks, exceptions, property access chains).
**How to verify:** Metrics must be committed as evidence. Must include: starting handle count, ending handle count, peak handle count, memory at start and end. Workload must include: repeated eval(), repeated file operations, repeated callback invocations, intentional error paths.
**Blast radius if faked:** Users in long Claude Code sessions will see the browser tab slow down and eventually crash.

### 4. fs Error Codes with Correct Shape (WS14-T4) — `CurSOR`
**Why it's hard:** Node.js fs errors have a very specific shape: `{ code: 'ENOENT', errno: -2, syscall: 'open', path: '/missing', message: "ENOENT: no such file or directory, open '/missing'" }`. Claude Code checks `err.code` extensively. Getting the shape wrong means Claude Code's error handling breaks.
**How they'll fake it:** Throw `new Error('file not found')` without setting `.code`. Or throw an object with `.code` but wrong `.errno` or missing `.syscall` or missing `.path`.
**How to verify:** `try { fs.readFileSync('/missing') } catch(e) { assert(e.code === 'ENOENT'); assert(e.errno === -2); assert(e.syscall === 'open'); assert(e.path === '/missing'); assert(e.message.includes('ENOENT')); }`
**Blast radius if faked:** Claude Code will crash on every file-not-found error instead of handling it gracefully.

### 5. Plan 01-02 Execution (P1-REQ-1) — `Gemini`
**Why it's hard:** This is the entire Wasm compilation of Node.js C++ modules. It's an iterative loop of: compile, see 200 errors, fix the first batch, compile again, see 150 new errors, repeat. Could take days or weeks of focused effort. There is no shortcut.
**How they'll fake it:** Get to a point where it "compiles" with `ERROR_ON_UNDEFINED_SYMBOLS=0` hiding 500 missing symbols. The binary exists but won't actually run. Or stub so aggressively that nothing meaningful is left in the binary.
**How to verify:** `make build` with strict symbol resolution. Then instantiate the binary with real bridge imports and call a real function through it. If it works, the compilation is real.
**Blast radius if faked:** There is literally no project without a working Wasm binary.

### 6. Buffer.from Sharing Memory Correctly (WS10-T5) — `Kimmy`
**Why it's hard:** `Buffer.from(arrayBuffer, offset, length)` creates a VIEW into existing memory — it does NOT copy. `buf.slice()` also shares memory. This means mutating the slice mutates the original. Getting this wrong causes extremely subtle bugs where data corruption appears in unrelated code.
**How they'll fake it:** Always copy. Tests pass because they only check values, not memory sharing. Or implement sharing but get the offset arithmetic wrong.
**How to verify:** `const ab = new ArrayBuffer(10); const buf = Buffer.from(ab, 2, 4); buf[0] = 42; assert(new Uint8Array(ab)[2] === 42);`
**Blast radius if faked:** Subtle data corruption in any code path that uses Buffers with shared memory (which includes many stream internals).

---

## HIGH EFFORT: Tasks That Are Just A Lot of Work

### 7. Complete Buffer Encoding Support (WS10-T1 through T4) — `Kimmy`
**Why it's a lot:** utf8 is easy (TextEncoder/TextDecoder). base64 is medium. hex is easy. But: base64url, latin1/binary, ascii all have different edge cases. `Buffer.byteLength` has to handle all of them. `toString()` has to handle start/end offsets with all encodings. That's a matrix of ~7 encodings × ~10 methods.
**What to watch for:** "I'll do utf8 and base64 now, the rest later." There is no later. Claude Code uses hex encoding for crypto operations and ascii for HTTP headers.

### 8. process.nextTick Ordering (WS12-T5) — `Kimmy`
**Why it's tricky:** nextTick must fire BEFORE Promises and BEFORE setTimeout. In the browser, `queueMicrotask()` runs at the same priority as Promise.then(). Node.js nextTick runs BEFORE microtasks. This means our browser nextTick is subtly wrong if we just use queueMicrotask.
**What to watch for:** Using queueMicrotask and calling it done. For most cases this works, but code that depends on nextTick firing before Promise resolution will break.

### 9. fs.createReadStream / createWriteStream (WS15-T9) — `cloud`
**Why it's hard:** These return streams that read/write from MEMFS. They need to honor highWaterMark, emit proper events (open, ready, data, end, close), support encoding option, handle errors correctly, and work with pipe(). This is the intersection of the fs and streams implementations.
**What to watch for:** Implementing as simple wrappers that read the whole file into memory and push it as one chunk. That defeats the purpose of streaming.

### 10. Strict Build Flags (P1-REQ-4) — `Gemini`
**Why it's hard:** `ERROR_ON_UNDEFINED_SYMBOLS=0` is currently the only thing keeping the build alive. Turning it off will surface hundreds of missing symbols that need to be either: (a) added to shims, (b) stubbed, or (c) added to an explicit allowlist. Each one needs classification.
**What to watch for:** Creating a giant allowlist that's effectively the same as `ERROR_ON_UNDEFINED_SYMBOLS=0`. The allowlist must be reviewed and each entry justified.

---

## OPEN-ENDED: Tasks Where Scope Is Ambiguous

### 11. "Additional fs APIs Claude Code needs" (03-02-PLAN Step 9)
**Why it's open-ended:** The list includes existsSync, createReadStream, createWriteStream, fs.promises, accessSync, realpathSync, openSync/readSync/writeSync/closeSync. That's 15+ additional APIs on top of the 7 required ones. Each one has its own contract.
**How to scope it:** Check actual Claude Code source for which fs APIs it calls. Implement ONLY those. Don't guess.

### 12. util.inspect (WS13-T5) — `cloud`
**Why it's open-ended:** Node.js util.inspect is incredibly complex (thousands of lines). Depth, colors, maxArrayLength, maxStringLength, showHidden, getters, Proxy handling, circular reference detection... How much do we need?
**How to scope it:** Claude Code uses util.inspect for error formatting. Implement: primitives, plain objects (with depth), arrays, dates, regexps, errors, circular reference detection (return `[Circular]`). Skip: colors, Proxy, getters, showHidden.

---

## Enforcement

1. **Every task on this list requires a review from a second engineer** — the owner cannot self-approve.
2. **Conformance tests must pass against real Node.js first** — if the test passes in our implementation but fails in Node.js, the test is wrong.
3. **Evidence for hard tasks is committed to `.planning/evidence/`** — soak logs, memory profiles, backpressure test output.
4. **Weekly "weasel check"** — all 4 engineers review this list and flag any task that's been "mostly done" for more than 3 days.

### Review Pairs
- Gemini's work reviewed by CurSOR
- cloud's work reviewed by Kimmy
- Kimmy's work reviewed by cloud
- CurSOR's work reviewed by Gemini
