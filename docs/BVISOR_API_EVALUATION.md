# bVisor API Compatibility Evaluation

**Date**: 2026-04-11
**Goal**: Assess the feasibility of exposing a bVisor-compatible `Sandbox` API from v9's in-tab runtime.

---

## What bVisor actually is (from source)

bVisor is a **Linux syscall virtualizer** written in Zig. It is **not** a shell
wrapper or a container runtime. It intercepts every syscall a sandboxed process
makes and either virtualizes, passes through, or blocks it.

### Architecture (from `src/core/`)

```
Host Process (Node.js via N-API)
  └── Sandbox.init()          ← generates 16-byte uid, creates overlay at /tmp/.bvisor/sb/{uid}/
       └── runCmd("echo hi")
            └── execute()     ← setup.zig
                 ├── fork()
                 ├── [child]  seccomp.install() → BPF USER_NOTIF filter on ALL syscalls
                 │            execve("/bin/sh", "-c", "echo hi")
                 │            ← every syscall now trapped by parent
                 └── [parent] Supervisor.run()
                              ├── poll(notify_fd) → recv() → SECCOMP.notif
                              ├── dispatch to Io thread pool (MAX_INFLIGHT=8)
                              └── syscalls.handle() → per-syscall handler
                                   ├── openat → path.route() → COW/TMP/PROC/Passthrough/Block
                                   ├── read/write → File.read/write on virtual FD
                                   ├── getpid → virtual PID from Namespace
                                   ├── bind/listen/accept → EPERM (blocked)
                                   ├── ptrace/mount/chroot → ENOSYS (blocked)
                                   └── clone/mmap/signals → replyContinue (passthrough)
```

### Key subsystems

**Filesystem (`virtual/fs/`)**: 5 backends behind a unified `File` interface:
- `Cow` — Copy-on-write: reads pass through to real FS, writes copy to overlay first
- `Tmp` — Private `/tmp` per sandbox, redirected to overlay
- `Passthrough` — Direct kernel FD for `/dev/null`, `/dev/zero`, `/dev/urandom`
- `ProcFile` — Virtualized `/proc` entries (returns sandbox PIDs, not real ones)
- `Event` — eventfd instances

**Path routing (`virtual/path.zig`)**: Prefix-based trie:
- `/sys`, `/run`, `/.b` → BLOCKED (EPERM)
- `/dev/*` → BLOCKED except `null`, `zero`, `random`, `urandom` → Passthrough
- `/proc` → ProcFile (virtualized)
- `/tmp/.bvisor` → BLOCKED; `/tmp/*` → TMP backend
- Everything else → COW (default)

**Process model (`virtual/proc/`)**: Full Linux thread model:
- `Thread` — owns AbsTid, virtual Namespace, FdTable, FsInfo
- `ThreadGroup` — process abstraction (leader + threads), refcounted
- `Namespace` — virtual PID/TID mapping (AbsTid ↔ NsTid)
- `FdTable` — per-process virtual FD table, refcounted, supports CLONE_FILES sharing
- `FsInfo` — per-thread cwd/root, refcounted

**Stdout/stderr capture (`LogBuffer.zig`)**: Thread-safe append buffer with
mutex. The `write` syscall handler checks if fd == 1 or fd == 2, and if so,
writes to the Supervisor's LogBuffer instead of a file. The Node SDK's `Stream`
class drains the LogBuffer via `streamNext()` → `ReadableStream<Uint8Array>`.

**Syscall coverage**: ~35 virtualized, ~25 passthrough, ~15 blocked, ~240 unimplemented (ENOSYS).

---

## bVisor's public API (from `src/sdks/node/`)

The TypeScript SDK (`src/sdks/node/src/sandbox.ts`) is intentionally minimal:

```typescript
import { Sandbox } from "bvisor";

class Sandbox {
  constructor()                        // createSandbox() → Zig alloc + generateUid()
  setLogLevel(level: "OFF" | "DEBUG")  // toggle supervisor logging
  runCmd(command: string): Output      // fork+seccomp+execve("/bin/sh","-c",cmd)
}

interface Output {
  stdoutStream: ReadableStream<Uint8Array>  // pull-based: calls native streamNext()
  stderrStream: ReadableStream<Uint8Array>
  stdout(): Promise<string>                 // new Response(stream).text()
  stderr(): Promise<string>
}
```

**N-API boundary** (4 functions total, `src/sdks/node/zig/root.zig`):
- `createSandbox()` → `ZigExternal(Sandbox).create` — allocs Sandbox, generates uid
- `sandboxRunCmd(sandbox, cmd)` → `Sandbox.runCmd` — calls `core.execute()`, returns `{stdout: External<Stream>, stderr: External<Stream>}`
- `sandboxSetLogLevel(sandbox, level)` → `Sandbox.setLogLevel`
- `streamNext(stream)` → `Stream.next` — drains LogBuffer, returns `Uint8Array | null`

**Lifecycle**: `Sandbox` GC finalizer calls `cleanupOverlay()` which deletes `/tmp/.bvisor/sb/{uid}/`.

**Key detail**: `runCmd` is **blocking** — it calls `core.execute()` which runs
the full fork→seccomp→supervisor→waitpid cycle synchronously. The stdout/stderr
are buffered in LogBuffers during execution and drained afterward. The
`ReadableStream` wrapper makes it look async, but by the time you call
`streamNext()`, all data is already in the buffer.

---

## How v9's in-tab runtime compares

### What v9 already has (from `napi-bridge/`)

| bVisor subsystem | v9 equivalent | Parity |
|---|---|---|
| **Shell dispatch** | `shell-parser.js` — tokenizer, pipes, redirects, `&&`/`||`, globs, env vars, subshells | **Stronger** (bVisor delegates to real `/bin/sh`) |
| **Filesystem** | `memfs.js` — full in-memory FS with dirs, symlinks, stat, permissions | **Different** (MEMFS vs COW-on-real-FS) |
| **~30 shell commands** | `shell-commands.js` — `ls`, `cat`, `echo`, `grep`, `find`, `mkdir`, `chmod`, `sed`, `head`, `tail`, `wc`, `sort`, `env`, `which`, etc. | **Comparable** for shell builtins |
| **child_process** | `child-process.js` — `spawn`, `exec`, `execSync`, `fork` with `ExecutionContext` per-child (pid, cwd, env, cancellation) | **Comparable** |
| **Process model** | `ExecutionContext` — pid counter, per-child cwd/env, parent linkage, process table | **Simpler** (no threads/namespaces) |
| **Stdout/stderr** | Results returned as `{ stdout, stderr, exitCode }` from shell commands | **Simpler** (synchronous, no streaming) |
| **Path routing** | MEMFS is self-contained — no blocked paths needed | **Stronger isolation** (nothing to block) |
| **Networking** | `fetch()` + gvisor-tap-vsock for real TCP | **Stronger** (bVisor blocks servers, no DNS) |

### What bVisor has that v9 doesn't

1. **Real binary execution**: bVisor runs actual ELF binaries — `python3`, `gcc`,
   `curl`, `npm`, anything installed on the host. v9 only has JS shell shims.
   This is the fundamental gap.

2. **Real filesystem visibility**: bVisor's COW layer reads through to the host
   FS. `cat /etc/passwd` returns the real file. In v9, MEMFS is empty unless
   you pre-populate it.

3. **Kernel-level syscall interception**: Seccomp BPF is a hard boundary — the
   guest process literally cannot make a syscall without the supervisor seeing it.
   v9's isolation is JS-level (the "sandbox" is just running commands against
   MEMFS shims in the same JS realm).

4. **State persistence across commands**: Each `runCmd()` in bVisor reuses the
   same overlay — files created in one command are visible in the next. The
   overlay is per-sandbox, not per-command. v9's MEMFS already does this
   (persistent in-memory state), but the cwd resets to `/` each command in
   bVisor because each command is a fresh `execve` of `/bin/sh`.

### What v9 has that bVisor doesn't

1. **Cross-platform**: Runs in any browser. bVisor requires Linux with seccomp
   user notifier (kernel 5.x+), x86_64 or ARM64 only.

2. **Full Node.js API**: 67 modules polyfilling `fs`, `crypto`, `http`, `streams`,
   `Buffer`, `process`, `path`, `url`, `os`, `worker_threads`, etc.

3. **Wasm runtime**: EdgeJS compiles Node.js to WebAssembly. Can run real JS
   programs, not just bash commands.

4. **Networking**: Real HTTP via `fetch()`, real TCP via gvisor-tap-vsock. bVisor
   has basic socket passthrough but blocks `bind`/`listen`/`accept` and has no DNS.

5. **Shell parser**: v9's parser handles pipes, redirects, `&&`/`||`, globs,
   subshells, env var expansion. bVisor just calls the real `/bin/sh`.

---

## Implementation analysis

### API mapping (source-level)

```
bVisor                          v9 in-tab
──────                          ─────────
Sandbox.constructor()           new instance + set cwd to "/"
  → core.generateUid()          (no uid needed — MEMFS is shared or per-instance)
  → OverlayRoot.init()          MEMFS is already initialized

Sandbox.runCmd(cmd)             executeCommandString(cmd, { cwd })
  → setup.execute()             (no fork/seccomp — runs shell parser directly)
    → fork + seccomp + execve   → tokenize → parse → dispatch shell commands
    → Supervisor.run()           → each command runs against MEMFS
    → LogBuffer.write()          → result = { stdout, stderr, exitCode }
  → Stream wrapping              → wrap in Output object

Output.stdoutStream             new ReadableStream over buffered string
  → Stream.next() → LogBuffer   (v9 has all output at return time)
  → Uint8Array chunks            → single Uint8Array chunk → close

Output.stdout()                 Promise.resolve(result.stdout)
  → new Response(stream).text()  (identical result, simpler path)

Sandbox.setLogLevel()           Toggle console.log in runCmd
```

### What the wrapper actually needs to do

1. **Wrap `executeCommandString`** — call it with scoped cwd, return bVisor's `Output` shape.
2. **Track cwd across commands** — bVisor's `execve` resets to `/` each time, but `cd` within a command changes the real kernel cwd. v9 should track `cd` across `runCmd()` calls for parity.
3. **Create `ReadableStream<Uint8Array>`** — trivial wrapper over buffered strings.
4. **`stdout()`/`stderr()`** — `Promise.resolve()` over the string result.

### Behavioral differences to document

| Behavior | bVisor | v9 in-tab |
|---|---|---|
| **Command execution** | Real `/bin/sh` + any installed binary | JS shell parser + command shims |
| **Streaming** | LogBuffer drains incrementally via `streamNext()` | All output available immediately (single chunk) |
| **cwd persistence** | Each command starts at `/` (fresh execve) | Could persist cwd across commands |
| **Filesystem** | COW on host FS — real files visible read-only | MEMFS — empty by default, fully isolated |
| **Multi-sandbox isolation** | Each sandbox has independent overlay (different uid) | Shared MEMFS by default (could clone) |
| **Cleanup** | GC finalizer deletes `/tmp/.bvisor/sb/{uid}/` | MEMFS is in-memory, no cleanup needed |
| **Platform** | Linux only (seccomp) | Any browser or JS runtime |
| **Performance** | ~2ms sandbox init, native execution | ~0ms init, in-process JS execution |

---

## Recommendation

**The API is worth adopting. The implementation is straightforward.**

bVisor's `Sandbox` → `runCmd()` → `Output` is a clean, agent-friendly abstraction.
It maps directly onto v9's existing shell machinery. The wrapper is ~90 lines.

### What to ship

1. **`napi-bridge/sandbox.js`** — already created, implements `Sandbox` + `Output`
2. **Export from package.json** as `@aspect/v9-edgejs-browser/sandbox`
3. **Document the execution model difference** — agents need to know they get
   shell shims, not real binaries

### Future extensions (not needed now)

- **Per-sandbox MEMFS isolation** — clone MEMFS on `new Sandbox()` for true
  multi-sandbox isolation matching bVisor's per-uid overlay
- **`preload` option** — populate MEMFS with files at sandbox creation time
- **Wasm binary execution** — pipe commands to the EdgeJS Wasm runtime for
  real JS/Node execution within `runCmd()`
- **`exitCode` in Output** — bVisor doesn't expose this, but v9 has it
  internally and agents would benefit from it
