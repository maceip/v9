# bVisor API Compatibility Evaluation

**Date**: 2026-04-11
**Goal**: Assess the feasibility of exposing a bVisor-compatible `Sandbox` API from v9's in-tab runtime.

---

## bVisor API Surface (complete)

bVisor's public API is intentionally minimal — a single class with two methods:

```typescript
import { Sandbox } from "bvisor";

class Sandbox {
  constructor()
  setLogLevel(level: "OFF" | "DEBUG"): void
  runCmd(command: string): Output
}

interface Output {
  stdoutStream: ReadableStream<Uint8Array>
  stderrStream: ReadableStream<Uint8Array>
  stdout(): Promise<string>   // convenience: collects stream → string
  stderr(): Promise<string>
}
```

**That's the entire public contract.** Usage:

```typescript
const sb = new Sandbox();
const output = sb.runCmd("echo 'Hello, world!'");
console.log(await output.stdout());
```

### What bVisor does under the hood

| Capability | bVisor mechanism | v9 in-tab equivalent |
|---|---|---|
| **Shell execution** | `fork()` + `execve("/bin/sh", "-c", cmd)` via seccomp supervisor | Shell parser + MEMFS command shims |
| **Filesystem** | COW overlay on host FS; blocked paths (`/sys`, `/run`, `/dev/*`) | MEMFS (in-memory filesystem, fully isolated by default) |
| **Process identity** | Virtual PID/TID namespace | `ExecutionContext` with synthetic PIDs |
| **stdout/stderr** | Kernel pipe FDs → `ReadableStream<Uint8Array>` | `child.stdout` / `child.stderr` Readable streams |
| **Isolation** | Seccomp BPF syscall interception | JS-level sandbox (no syscalls at all — browser) |
| **Networking** | Passthrough sockets (servers blocked) | `fetch()` + optional gvisor-tap-vsock relay |
| **Multi-sandbox** | Each `new Sandbox()` gets independent COW overlay | Each MEMFS instance is already independent |

---

## Feasibility Assessment

### The API is trivially implementable

bVisor's `Sandbox` class maps almost 1:1 onto machinery v9 already has:

| bVisor API | v9 existing code | Gap |
|---|---|---|
| `new Sandbox()` | `new ExecutionContext()` + `defaultMemfs` | Need thin wrapper class |
| `sb.runCmd(cmd)` | `executeCommandString(cmd)` in `shell-parser.js` | Need to wire return format |
| `output.stdout()` | Result already returned as `{ stdout, stderr, exitCode }` | Wrap in `Promise<string>` |
| `output.stdoutStream` | `child.stdout` is already a Readable | Convert to `ReadableStream<Uint8Array>` |
| `sb.setLogLevel()` | No equivalent | Trivial (toggle debug logging) |

### What v9 already has that bVisor doesn't

v9's in-tab runtime is **more capable** than bVisor in several dimensions:

1. **Full Node.js API polyfills** — `fs`, `path`, `crypto`, `http`, `streams`, `Buffer`, `process`, etc. bVisor only runs bash commands.

2. **Wasm runtime** — Full V8-in-Wasm execution of arbitrary JS. bVisor runs native Linux binaries only.

3. **Networking** — `fetch()`-based HTTP + gvisor TCP stack. bVisor has basic socket passthrough with servers blocked.

4. **No Linux dependency** — v9 runs in any browser. bVisor is Linux-only (x86_64/ARM64, seccomp user notifier).

5. **Shell parser with rich features** — Pipes, redirects, `&&`/`||`, globs, env var expansion, heredocs. bVisor delegates to the real `/bin/sh`.

### What bVisor has that v9 doesn't

1. **Real binary execution** — bVisor can run `python3`, `curl`, `gcc`, any installed binary. v9's shell shims only cover common Unix commands (`ls`, `cat`, `mkdir`, `echo`, `grep`, `find`, `chmod`, etc.).

2. **Real filesystem visibility** — bVisor's COW overlay can read the actual host filesystem (read-only). v9's MEMFS starts empty (or with pre-loaded content).

3. **Kernel-level isolation** — Seccomp BPF is a stronger isolation boundary than JS-level sandboxing.

---

## Implementation Plan

A bVisor-compatible `Sandbox` class for v9 in-tab:

```typescript
// v9/napi-bridge/sandbox.js — bVisor-compatible API

import { executeCommandString } from './shell-parser.js';
import { defaultMemfs } from './memfs.js';

export class Sandbox {
  #memfs;
  #logLevel;

  constructor() {
    // Each sandbox gets its own MEMFS for isolation
    // (or shares default — depends on isolation needs)
    this.#memfs = defaultMemfs;
    this.#logLevel = "OFF";
  }

  setLogLevel(level) {
    this.#logLevel = level;
  }

  runCmd(command) {
    const result = executeCommandString(command);
    return createOutput(result.stdout ?? '', result.stderr ?? '');
  }
}

function createOutput(stdoutStr, stderrStr) {
  const stdoutBytes = new TextEncoder().encode(stdoutStr);
  const stderrBytes = new TextEncoder().encode(stderrStr);

  return {
    stdoutStream: new ReadableStream({
      start(controller) {
        if (stdoutBytes.length) controller.enqueue(stdoutBytes);
        controller.close();
      }
    }),
    stderrStream: new ReadableStream({
      start(controller) {
        if (stderrBytes.length) controller.enqueue(stderrBytes);
        controller.close();
      }
    }),
    stdout: () => Promise.resolve(stdoutStr),
    stderr: () => Promise.resolve(stderrStr),
  };
}
```

### Key design decisions

| Decision | Recommendation |
|---|---|
| **MEMFS sharing** | Default: shared MEMFS (matches v9 model). Option: per-sandbox MEMFS clone for bVisor-style COW isolation. |
| **Sync vs async** | v9's shell commands execute synchronously (no real processes). `runCmd()` returns immediately with buffered output, matching bVisor's streaming model for short commands. |
| **Missing commands** | Commands not in v9's shell shims return `exitCode: 127` ("command not found"), same as bVisor's behavior for blocked syscalls. |
| **Blocked paths** | MEMFS is inherently isolated — no `/sys`, `/proc`, `/dev` by default. Could add virtual stubs to match bVisor's behavior. |

---

## Compatibility Matrix

Which bVisor examples would work out of the box with v9's implementation:

| Example | bVisor behavior | v9 in-tab behavior | Compatible? |
|---|---|---|---|
| `echo 'Hello, world!'` | Runs `/bin/sh -c echo ...` | Shell shim handles `echo` | Yes |
| `pwd` | Returns sandbox cwd | Returns MEMFS cwd | Yes |
| `ls` | Lists real FS (COW) | Lists MEMFS contents | Yes (different contents) |
| `mkdir -p project/src` | Creates in COW overlay | Creates in MEMFS | Yes |
| `echo 'text' > file.txt` | Redirect to COW file | Redirect to MEMFS file | Yes |
| `cat file.txt` | Reads from COW | Reads from MEMFS | Yes |
| `find project -type f` | Real `find` binary | Shell shim `find` | Yes |
| `chmod +x script.py` | Real `chmod` | Shell shim `chmod` | Yes |
| `grep pattern file` | Real `grep` | Shell shim `grep` | Yes |
| `python3 hello.py` | Real Python interpreter | No — would need Wasm Python | No |
| `curl -s https://...` | Real `curl` (likely fails — no DNS) | `fetch()`-based stub possible | Partial |
| `uname -n` | Returns "bvisor" | Could return "v9" | Yes (with shim) |
| `sleep 1` | Real `sleep` | Shell shim (setTimeout) | Yes |
| `chroot /tmp` | EPERM (blocked) | No `chroot` — ENOENT (127) | Compatible (different error) |

**Result**: ~80% of bVisor's demonstrated use cases work with v9's existing shell shims. The gap is real binary execution (`python3`, `curl`, `gcc`).

---

## Strategic Value

### Why mimic bVisor's API?

1. **Agent ecosystem compatibility** — bVisor targets LLM agents. Same API = drop-in replacement for agents that don't need Linux binaries.

2. **Browser-native alternative** — bVisor is Linux-only. A bVisor-compatible v9 runs everywhere (browser, Cloudflare Workers, any JS runtime).

3. **Zero infrastructure** — bVisor needs a Linux host. v9's Sandbox runs in a browser tab with no server.

4. **API is excellent** — `new Sandbox()` + `sb.runCmd(cmd)` is the right abstraction for ephemeral command execution. Worth adopting regardless.

### Why NOT just copy the API?

1. **Semantic mismatch** — bVisor runs real Linux binaries; v9 runs JS shims. An agent expecting `apt-get install` will fail.

2. **Streaming behavior** — bVisor streams stdout incrementally (real pipe). v9 returns buffered output synchronously. The `ReadableStream` wrapper hides this, but long-running commands behave differently.

3. **Filesystem model** — bVisor's COW sees real host files. v9's MEMFS is empty by default. An agent expecting `/usr/bin/python3` to exist won't find it.

---

## Recommendation

**Do it.** The implementation cost is ~50 lines of code (wrapper class + output adapter). The API is clean and worth adopting. Key points:

1. **Ship the wrapper as `napi-bridge/sandbox.js`** and export from package as `@aspect/v9-edgejs-browser/sandbox`.

2. **Document the semantic differences** — especially around binary execution and filesystem visibility.

3. **Consider adding a `preload` option** to populate MEMFS before execution, bridging the "empty filesystem" gap:
   ```typescript
   const sb = new Sandbox({
     files: { '/workspace/hello.py': 'print("Hello")' }
   });
   ```

4. **Optional: per-sandbox MEMFS isolation** — clone MEMFS state on `new Sandbox()` for true multi-sandbox isolation (matches bVisor's COW-per-sandbox model).

5. **Don't pretend to be bVisor** — the API shape is compatible, but the capability set is different. Agents should know they're running in-tab, not on Linux.
