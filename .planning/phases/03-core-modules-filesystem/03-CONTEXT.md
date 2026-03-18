# Phase 3: Core Modules + Filesystem — Context

**Phase:** 3 of 6
**Depends on:** Phase 2 (N-API Bridge Hardening) — bridge must be strict, leak-free, and production-grade
**Unlocks:** Phase 4 (Networking), Phase 5 (Subprocess Emulation)
**Requirements covered:** CORE-01 through CORE-08, FS-01 through FS-07 (15 requirements)

## What This Phase Is

Phase 3 gives the runtime its operational surface. Phases 1-2 proved we can compile, load, and bridge. Phase 3 makes the runtime *do things*: emit events, stream data, read/write files, manage buffers with encodings, and behave like a real Node.js process.

Without Phase 3, Claude Code cannot:
- Read or write files (the core of agentic work)
- Stream data through pipes (required by every I/O path)
- Emit or listen for events (the backbone of Node.js)
- Interact with process.stdin/stdout (terminal connectivity)

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Browser-first overrides where possible | `path`, `url`, `crypto`, `buffer` already have browser-native implementations in `browser-builtins.js` — extend, don't rewrite |
| MEMFS for filesystem (not OPFS) | OPFS deferred to v2 (PERS-01/02); MEMFS is synchronous and sufficient for v1 Claude Code sessions |
| EventEmitter in JS, not Wasm | Pure JS module — zero reason to pay Wasm bridge cost |
| Streams must support backpressure | Claude Code processes large files; unbounded buffering will hit the 4GB Wasm memory ceiling |
| process.stdin/stdout wired to bridge | Terminal UI (Phase 6) will connect these; Phase 3 establishes the plumbing |
| Leverage existing `browser-builtins.js` | Extend `pathBridge`, `bufferBridge`, `processBridge` rather than creating parallel implementations |
| `_registerBuiltinOverride` must work | Currently references a non-existent hook — this phase must wire it into EdgeJS module resolution |

## What We Already Have

From `napi-bridge/browser-builtins.js`:
- `cryptoBridge` — SHA hashing, randomBytes, randomUUID via Web Crypto
- `pathBridge` — join, resolve, dirname, basename, extname, relative, parse, format
- `urlBridge` — URL/URLSearchParams via native browser APIs
- `processBridge` — minimal process object (env, argv, cwd, exit, stdout/stderr stubs, nextTick, hrtime)
- `bufferBridge` — from (utf8/base64/hex), alloc, concat, isBuffer

**Gaps to close:**
- `registerBrowserBuiltins()` calls `_registerBuiltinOverride` which doesn't exist yet
- No EventEmitter
- No Streams (Readable/Writable/Transform/Duplex)
- Buffer missing `toString()`, `slice()`, `copy()`, `compare()`, `write()`, encoding completeness
- process missing `stdin` as Readable, signal handling, env injection via `initEdgeJS()`
- No filesystem operations (MEMFS integration)
- No `util.promisify`

## References

- Requirements: `.planning/REQUIREMENTS.md` (CORE-01 through CORE-08, FS-01 through FS-07)
- Architecture: `.planning/research/ARCHITECTURE.md` (browser-first overrides, four-tier bridge)
- Existing code: `napi-bridge/browser-builtins.js` (current browser module implementations)
- Concerns: `.planning/codebase/CONCERNS.md` (known bugs in builtins registration)
