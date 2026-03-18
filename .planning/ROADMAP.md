# Roadmap: EdgeJS v9 — Browser-Native Node.js Runtime

## Overview

EdgeJS v9 delivers Claude Code running in the browser through six phases that follow the project's hard dependency chain: compile the Wasm binary, harden the N-API bridge that connects it to browser JS, bring up core modules and filesystem that everything depends on, add networking for API calls, emulate subprocesses via Web Workers, and wire it all together with a terminal UI. Each phase produces a testable, coherent capability that unblocks the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Wasm Compilation** - Node.js C++ modules compile to .wasm and load in browser (01-01 done)
- [ ] **Phase 2: N-API Bridge Hardening** - Bridge is correct, leak-free, and performance-characterized
- [ ] **Phase 3: Core Modules + Filesystem** - Runtime has working EventEmitter, streams, Buffer, fs, process, and browser builtins
- [ ] **Phase 4: Networking** - HTTPS requests with SSE streaming work through browser fetch proxy
- [ ] **Phase 5: Subprocess Emulation** - child_process.spawn() works via Web Workers with shell command shims
- [ ] **Phase 6: Terminal UI + Integration** - Claude Code boots, converses, reads/writes files in browser

## Phase Details

### Phase 1: Wasm Compilation
**Goal**: The Node.js C++ runtime compiles to a .wasm binary that loads and initializes in the browser without errors
**Depends on**: Nothing (first phase)
**Requirements**: COMP-01, COMP-02, COMP-03
**Success Criteria** (what must be TRUE):
  1. `emcmake cmake && make` completes with zero compilation errors
  2. V8 embedding API shims pass static_assert checks for wasm32 pointer widths
  3. The .wasm binary loads in Chrome without traps, segfaults, or initialization failures
  4. Wasm binary size is under 50MB raw (module whitelist applied)
**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — Consolidate shim headers with pointer width assertions and CMake/patch infrastructure
- [ ] 01-02-PLAN.md — Compile EdgeJS to .wasm via iterative error fixing and browser load verification

### Phase 2: N-API Bridge Hardening
**Goal**: The N-API bridge correctly propagates errors, manages handle lifecycles, and performs acceptably for sustained sessions
**Depends on**: Phase 1
**Requirements**: NAPI-01, NAPI-02
**Success Criteria** (what must be TRUE):
  1. Errors thrown in JS callback propagate through N-API and are retrievable via napi_get_last_error_info
  2. A 30-minute simulated session shows no monotonic handle count growth (handle scopes clean up correctly)
  3. A basic JS expression evaluated through the Wasm runtime returns the correct result (runtime.eval('1+1') === 2)
**Plans**: TBD

Plans:
- [ ] 02-01: TBD

### Phase 3: Core Modules + Filesystem
**Goal**: The runtime provides working EventEmitter, Buffer, streams, process, path/url utilities, and a complete in-memory filesystem
**Depends on**: Phase 2
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, CORE-07, CORE-08, FS-01, FS-02, FS-03, FS-04, FS-05, FS-06, FS-07
**Success Criteria** (what must be TRUE):
  1. A script can require('events'), create an EventEmitter, register a listener, emit an event, and receive the callback
  2. A script can require('fs'), write a file with writeFileSync, read it back with readFileSync, and get identical content
  3. A Readable stream can be piped to a Writable stream with backpressure working (data flows without loss or hang)
  4. process.env contains values injected at initialization, process.cwd() returns a valid path, and process.stdout.write() produces output
  5. fs.readdir, fs.stat, fs.mkdir, fs.unlink, and fs.rename all work for basic directory and file operations
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD

### Phase 4: Networking
**Goal**: HTTPS requests route through the browser fetch proxy with streaming support, and crypto operations work for SDK authentication
**Depends on**: Phase 3
**Requirements**: NET-01, NET-02, NET-03, NET-04, NET-05
**Success Criteria** (what must be TRUE):
  1. An HTTPS POST request to the Anthropic API returns a valid response with correct headers
  2. A streaming SSE response delivers chunks incrementally (not buffered-then-delivered) through a Node.js Readable stream
  3. crypto.createHash('sha256') and crypto.createHmac('sha256', key) produce correct outputs matching Node.js reference values
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Subprocess Emulation
**Goal**: child_process.spawn() launches commands in Web Workers with stdio pipes, exit codes, and shell command shims
**Depends on**: Phase 3
**Requirements**: PROC-01, PROC-02, PROC-03, PROC-04, PROC-05
**Success Criteria** (what must be TRUE):
  1. child_process.spawn() launches a Web Worker that executes a command and returns output through stdout pipe
  2. stdin can be written to a spawned process and its stdout/stderr are readable as Node.js streams
  3. The spawned process emits 'close' with a numeric exit code that the parent can observe
  4. Shell shims for ls, cat, grep, find operate on the virtual filesystem and produce expected output
  5. git status and git log return meaningful read-only results for the virtual workspace
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: Terminal UI + Integration
**Goal**: Claude Code boots in the browser, user can have a full conversation with file reading/editing, all components wired together
**Depends on**: Phase 4, Phase 5
**Requirements**: TERM-01, TERM-02, TERM-03, INTG-01, INTG-02, INTG-03
**Success Criteria** (what must be TRUE):
  1. xterm.js renders Claude Code output with ANSI colors, and user keyboard input reaches process.stdin
  2. The terminal resizes correctly when the browser window changes size
  3. require() resolves built-in modules and relative paths, and the Anthropic SDK dependency tree loads without errors
  4. A user can type a prompt, Claude Code reads a file from the virtual filesystem, and the response appears in the terminal
  5. A user can ask Claude Code to edit a file, and the edit is reflected in the virtual filesystem
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Wasm Compilation | 1/2 | 01-01 done, 01-02 in progress | 01-01 |
| 2. N-API Bridge Hardening | 0/? | Not started | - |
| 3. Core Modules + Filesystem | 0/? | Not started | - |
| 4. Networking | 0/? | Not started | - |
| 5. Subprocess Emulation | 0/? | Not started | - |
| 6. Terminal UI + Integration | 0/? | Not started | - |
