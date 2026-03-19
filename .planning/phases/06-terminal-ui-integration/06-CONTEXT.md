# Phase 6: Terminal UI + Integration — Context

**Phase:** 6 of 6 (final)
**Depends on:** Phase 4 (networking — API calls) + Phase 5 (subprocess — Bash tool)
**Requirements covered:** TERM-01 through TERM-03, INTG-01 through INTG-03 (6 requirements)

## What This Phase Is

Phase 6 is where everything comes together. The user opens a web page, sees a terminal, types a prompt, and has a full Claude Code conversation — file reads, edits, API calls, responses — all in the browser.

This phase has two parts:
1. **Terminal UI** — xterm.js rendering with keyboard input and resize
2. **Integration** — module resolution, Claude Code + Anthropic SDK loading, full conversation flow

## Architecture

```
┌─────────────────────────────────────────────┐
│              Browser Tab                     │
├─────────────────────────────────────────────┤
│  xterm.js Terminal                          │
│  ┌─────────────────────────────────────┐    │
│  │  Claude Code output (ANSI colors)   │    │
│  │  User keyboard input               │    │
│  │  Resize handling                    │    │
│  └─────────────────────────────────────┘    │
│           ↕ (process.stdin/stdout)          │
├─────────────────────────────────────────────┤
│  EdgeJS Runtime (Wasm)                      │
│  ├── Claude Code (JS)                       │
│  ├── Anthropic SDK (JS)                     │
│  ├── Module resolution (require/import)     │
│  ├── fs (MEMFS) ← Phase 3                   │
│  ├── http/https (fetch) ← Phase 4           │
│  ├── child_process (shims) ← Phase 5        │
│  └── process (streams) ← Phase 3            │
└─────────────────────────────────────────────┘
```

## What's New in This Phase

| Component | What | Why |
|-----------|------|-----|
| xterm.js | Terminal emulator rendering | ANSI colors, cursor, scrollback |
| process.stdin wiring | xterm keyboard → process.stdin Readable | User input |
| process.stdout wiring | process.stdout Writable → xterm | Output display |
| SIGWINCH | Terminal resize → process signal | Responsive layout |
| Module resolution | `require()` for builtins + relative paths | Claude Code imports dozens of modules |
| SDK loading | Anthropic SDK dependency tree | All SDK deps must resolve |
| Conversation flow | Prompt → API call → streaming response → tool use → result | The full loop |

## References

- Requirements: `.planning/REQUIREMENTS.md` (TERM-01 through TERM-03, INTG-01 through INTG-03)
- process.stdin/stdout: `napi-bridge/browser-builtins.js` (from Phase 3)
- xterm.js: https://xtermjs.org (~265KB, MIT license)
