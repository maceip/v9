# Phase 7: Multi-CLI Support — Context

**Phase:** 7 (post-v1)
**Depends on:** Phase 6 (terminal UI, module resolution, conversation flow)
**Goal:** Claude Code, Codex CLI, and Gemini CLI all run in the browser with full feature parity

## The Three CLIs

### Claude Code (`@anthropic-ai/claude-code`)
- **Source:** npm package, pre-bundled 12MB `cli.js`
- **API:** Anthropic API via `@anthropic-ai/sdk` (uses fetch)
- **Terminal UI:** Ink (React for CLI) → ANSI escape codes
- **Unique needs:** `worker_threads`, `async_hooks` (AsyncLocalStorage), ripgrep binary, tree-sitter-bash native addon, `resvg.wasm`
- **Native binaries:** ripgrep (rg), tree-sitter-bash.node, audio-capture.node

### Codex CLI (`@openai/codex`)
- **Source:** github.com/openai/codex — original TypeScript CLI at ymichael/open-codex
- **API:** OpenAI API via `openai` SDK (uses fetch in v5+)
- **Terminal UI:** Ink (React for CLI) → ANSI escape codes
- **Unique needs:** `shell-quote` for command parsing, `open` for URLs, `which` for executable lookup
- **Native binaries:** None — pure JS/TS

### Gemini CLI (`@google/gemini-cli`)
- **Source:** github.com/google-gemini/gemini-cli — TypeScript monorepo
- **API:** Google Generative AI API via `@google/generative-ai` SDK (uses fetch)
- **Terminal UI:** Custom ANSI rendering via process.stdout.write, NOT Ink
- **Unique needs:** `node-pty` for pseudo-terminal, `chardet` for encoding detection, process group management
- **Native binaries:** node-pty (native addon for PTY)

## Combined Node.js API Surface

All three CLIs collectively require these Node.js modules:

| Module | Claude Code | Codex | Gemini | We Have | Gap |
|--------|------------|-------|--------|---------|-----|
| fs / fs/promises | YES | YES | YES | YES | — |
| path / path/posix | YES | YES | YES | YES | — |
| buffer | YES | YES | YES | YES | — |
| stream | YES | — | YES | YES | stream/consumers missing |
| events | YES | YES | YES | YES | — |
| url | YES | YES | YES | YES | — |
| util | YES | YES | YES | YES | — |
| crypto | YES | YES | YES | YES | — |
| http / https | YES | — | YES | YES | — |
| child_process | YES | YES | YES | YES | — |
| process | YES | YES | YES | YES | — |
| net | YES | — | YES | YES (stub) | — |
| tls | YES | — | — | YES (stub) | — |
| dns | — | — | — | YES (stub) | — |
| **os** | YES | YES | YES | **NO** | homedir, tmpdir, platform, arch, cpus, EOL |
| **readline** | YES | — | YES | **NO** | createInterface for interactive input |
| **tty** | YES | — | YES | **NO** | isatty, ReadStream, WriteStream |
| **zlib** | YES | — | YES | **NO** | gzip/gunzip for compressed responses |
| **async_hooks** | YES | — | — | **NO** | AsyncLocalStorage |
| **module** | YES | YES | — | **NO** | createRequire |
| **timers/promises** | YES | — | YES | **NO** | setTimeout as Promise |
| **stream/consumers** | YES | — | — | **NO** | text(), arrayBuffer(), json() |
| **worker_threads** | YES | — | — | **NO** | Worker, parentPort, workerData |
| **inspector** | YES | — | — | **NO** | stub only |
| **assert** | — | — | YES | **NO** | assert, strictEqual, deepStrictEqual |
| **string_decoder** | — | — | YES | **NO** | StringDecoder |
| **constants** | — | YES | — | **NO** | fs.constants, os.constants |

## Native Binary Shims

| Binary | Used By | Browser Alternative |
|--------|---------|-------------------|
| ripgrep (`rg`) | Claude Code | Our grep shim + rg flag translation |
| tree-sitter-bash.node | Claude Code | Stub — syntax highlighting only |
| audio-capture.node | Claude Code | Stub — not needed for text |
| node-pty | Gemini CLI | Our child_process shim (no real PTY needed) |

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Implement real modules, not stubs | All three CLIs actively use os, readline, tty, zlib — stubs will crash |
| Pure JS zlib via pako/fflate | Browser has no native sync zlib; use a JS implementation |
| AsyncLocalStorage pass-through | Store/retrieve context in a Map keyed by async ID |
| worker_threads → Web Worker bridge | Map Worker to Web Worker, postMessage is identical |
| readline via stdin events | Build on our existing process.stdin Readable |
| os module is static config | homedir/tmpdir/platform/arch are all known at init time |
