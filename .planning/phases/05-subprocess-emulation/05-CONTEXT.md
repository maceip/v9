# Phase 5: Subprocess Emulation — Context

**Phase:** 5 of 6
**Depends on:** Phase 3 (Streams for stdio pipes, EventEmitter for process events)
**Unlocks:** Phase 6 (Claude Code's Bash tool needs subprocess spawning)
**Requirements covered:** PROC-01 through PROC-05 (5 requirements)
**Can run in parallel with:** Phase 4 (both depend on Phase 3, not each other)

## What This Phase Is

Claude Code spawns subprocesses constantly — every Bash tool call, every `git status`, every `ls`. In the browser there are no real processes, so we emulate them with Web Workers. Each "subprocess" is a Web Worker that receives commands and returns stdout/stderr/exit code.

This is not about running arbitrary native binaries. It's about providing enough of `child_process.spawn()` that Claude Code's Bash tool works for common operations: file listing, text search, git read ops, and simple shell commands.

## Architecture

```
Claude Code calls:
  child_process.spawn('bash', ['-c', 'ls -la /project'])

Our override:
  ┌──────────────────────────────────────────────┐
  │  child_process module override               │
  │  spawn() / exec() / execSync()               │
  ├──────────────────────────────────────────────┤
  │  Shell command parser                        │
  │  Splits 'ls -la /project' into command+args  │
  ├──────────────────────────────────────────────┤
  │  Command dispatcher                          │
  │  Routes to built-in shim OR Web Worker       │
  ├──────────────────────────────────────────────┤
  │  Built-in shims (fast path):                 │
  │  ls, cat, grep, find, head, tail, echo,      │
  │  git status/log/diff/blame, pwd, cd, env     │
  │  → Execute against MEMFS directly            │
  ├──────────────────────────────────────────────┤
  │  Web Worker fallback (slow path):            │
  │  → Spawn worker with Wasm instance           │
  │  → Wire stdin/stdout/stderr as streams       │
  │  → Return exit code via message              │
  └──────────────────────────────────────────────┘
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Shell shims for common commands | Faster than Worker spawn; most Claude Code commands are simple file ops |
| MEMFS-backed commands | `ls`, `cat`, `find`, `grep` operate on the in-memory filesystem from Phase 3 |
| git shims are read-only | PROC-05 only requires status/log/diff/blame; write ops deferred to v2 |
| Web Workers for complex cases | Fallback when shims don't cover the command |
| exec/execSync supported | Claude Code uses both async and sync subprocess calls |
| Bash parsing is simplified | No full bash parser; handle pipes, redirects, and basic globbing |

## What Claude Code Actually Spawns

Based on Claude Code source analysis, the most common subprocess calls:
1. `bash -c 'ls /path'` — file listing
2. `bash -c 'cat /path/file'` — read file contents
3. `bash -c 'grep -rn "pattern" /path'` — search
4. `bash -c 'find /path -name "*.js"'` — find files
5. `bash -c 'head -n 20 /path/file'` — preview file
6. `bash -c 'git status'` — repo status
7. `bash -c 'git diff'` — changes
8. `bash -c 'git log --oneline -10'` — recent commits

All of these can be shimmed against MEMFS without a real subprocess.

## References

- Requirements: `.planning/REQUIREMENTS.md` (PROC-01 through PROC-05)
- MEMFS: `napi-bridge/memfs.js` (from Phase 3)
- Streams: `napi-bridge/streams.js` (stdin/stdout/stderr pipes)
