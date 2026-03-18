# Requirements: EdgeJS v9 — Browser-Native Node.js Runtime

**Defined:** 2026-03-18
**Core Value:** Claude Code runs a full agentic conversation in the browser — reads files, edits files, makes API calls, responds with results — no local install required.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Compilation

- [ ] **COMP-01**: All required Node.js C++ modules compile cleanly to .wasm via Emscripten
- [ ] **COMP-02**: V8 embedding API shims complete — wasm32 pointer offsets, sandbox types, platform abstractions
- [ ] **COMP-03**: Wasm binary loads and initializes in browser without traps or segfaults

### N-API Bridge

- [ ] **NAPI-01**: Exception handling un-stubbed — errors propagate correctly, handles don't leak
- [ ] **NAPI-02**: Handle scope lifecycle correct for 30+ minute sessions without memory growth

### Core Modules

- [ ] **CORE-01**: EventEmitter implements on/off/once/emit/removeListener
- [ ] **CORE-02**: Buffer supports from/alloc/toString with utf8/base64/hex encodings
- [ ] **CORE-03**: Streams implement Readable/Writable/Transform/Duplex with backpressure and pipe()
- [ ] **CORE-04**: process.env injectable via initEdgeJS(), process.cwd() returns virtual working directory
- [ ] **CORE-05**: process.stdin/stdout/stderr connected to terminal UI
- [ ] **CORE-06**: path module handles join/resolve/dirname/basename/extname (POSIX)
- [ ] **CORE-07**: url module parses URLs via native URL class
- [ ] **CORE-08**: util.promisify wraps callback-style functions

### Filesystem

- [ ] **FS-01**: fs.readFile/readFileSync reads files from MEMFS
- [ ] **FS-02**: fs.writeFile/writeFileSync creates/overwrites files in MEMFS
- [ ] **FS-03**: fs.readdir/readdirSync lists directory contents
- [ ] **FS-04**: fs.stat/statSync returns size, mtime, isFile/isDirectory
- [ ] **FS-05**: fs.mkdir/mkdirSync creates directories (with recursive option)
- [ ] **FS-06**: fs.unlink/unlinkSync deletes files
- [ ] **FS-07**: fs.rename/renameSync moves/renames files

### Networking

- [ ] **NET-01**: HTTPS requests route through browser fetch proxy at N-API layer
- [ ] **NET-02**: Streaming responses work via ReadableStream→Node.js Readable bridge (SSE for Anthropic API)
- [ ] **NET-03**: crypto.createHash supports SHA-256/384/512 via Web Crypto API
- [ ] **NET-04**: crypto.createHmac supports HMAC-SHA256 for SDK auth
- [ ] **NET-05**: Request/response headers pass through correctly

### Subprocess

- [ ] **PROC-01**: child_process.spawn() launches Web Worker with Wasm instance
- [ ] **PROC-02**: Spawned process has stdin/stdout/stderr stream pipes
- [ ] **PROC-03**: Exit codes and close events propagate to parent
- [ ] **PROC-04**: Shell command shims for ls, cat, grep, find, head, tail, echo
- [ ] **PROC-05**: git shim for read operations (status, log, diff, blame)

### Terminal UI

- [ ] **TERM-01**: xterm.js renders Claude Code output with ANSI colors and cursor movement
- [ ] **TERM-02**: User keyboard input flows to process.stdin
- [ ] **TERM-03**: Terminal resizes correctly (SIGWINCH equivalent)

### Integration

- [ ] **INTG-01**: Module resolution handles require() for built-in modules and relative paths
- [ ] **INTG-02**: Claude Code + Anthropic SDK dependency tree loads and initializes
- [ ] **INTG-03**: User can have a full Claude Code conversation — prompt, file read/edit, response

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Persistence

- **PERS-01**: OPFS persistent filesystem syncs files across browser sessions
- **PERS-02**: Close tab, reopen, resume where left off

### Enhanced Subprocess

- **EPROC-01**: Web Workers pool for reduced spawn latency
- **EPROC-02**: git write operations (commit, branch, checkout)

### SDK & Embedding

- **SDK-01**: Clean initEdgeJS() API with options, events, lifecycle hooks
- **SDK-02**: Headless mode (no terminal UI) for embedding in web apps

### Multi-CLI

- **MCLI-01**: Codex CLI boots and converses
- **MCLI-02**: Gemini CLI boots and converses

### Extended Crypto

- **CRYP-01**: Full createHash for all algorithms
- **CRYP-02**: randomBytes via Web Crypto
- **CRYP-03**: createCipheriv/createDecipheriv if needed

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full V8 compilation to Wasm | N-API split deliberately avoids this — would be 50-80MB at fraction of native speed |
| Raw TCP socket support | Browsers cannot open raw TCP sockets; route HTTP through fetch proxy instead |
| Native addon (.node binary) loading | Cannot run native binaries in browser; use Wasm alternatives where they exist |
| Full npm install with postinstall scripts | Security/compatibility nightmare; bundle dependencies at build time |
| worker_threads module | Requires COOP/COEP; Claude Code doesn't use it; use Web Workers for child_process |
| Offline mode | Claude Code requires API calls for every turn |
| Server-side HTTP listener | Claude Code doesn't serve HTTP; out of scope for v1 |
| RISC-V emulation path (v1) | Separate project, already working |
| Emscripten upgrade to 4.0.23 | Deferred — build on current 3.1.64 first, upgrade when needed |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| COMP-01 | — | Pending |
| COMP-02 | — | Pending |
| COMP-03 | — | Pending |
| NAPI-01 | — | Pending |
| NAPI-02 | — | Pending |
| CORE-01 | — | Pending |
| CORE-02 | — | Pending |
| CORE-03 | — | Pending |
| CORE-04 | — | Pending |
| CORE-05 | — | Pending |
| CORE-06 | — | Pending |
| CORE-07 | — | Pending |
| CORE-08 | — | Pending |
| FS-01 | — | Pending |
| FS-02 | — | Pending |
| FS-03 | — | Pending |
| FS-04 | — | Pending |
| FS-05 | — | Pending |
| FS-06 | — | Pending |
| FS-07 | — | Pending |
| NET-01 | — | Pending |
| NET-02 | — | Pending |
| NET-03 | — | Pending |
| NET-04 | — | Pending |
| NET-05 | — | Pending |
| PROC-01 | — | Pending |
| PROC-02 | — | Pending |
| PROC-03 | — | Pending |
| PROC-04 | — | Pending |
| PROC-05 | — | Pending |
| TERM-01 | — | Pending |
| TERM-02 | — | Pending |
| TERM-03 | — | Pending |
| INTG-01 | — | Pending |
| INTG-02 | — | Pending |
| INTG-03 | — | Pending |

**Coverage:**
- v1 requirements: 36 total
- Mapped to phases: 0
- Unmapped: 36 ⚠️

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after initial definition*
