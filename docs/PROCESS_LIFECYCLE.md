# Process lifecycle (Node-in-tab)

This documents how the bridge approximates Node’s process contract for **interpretive** runs (MEMFS + JS bridge / Wasm). Hosts should converge on the same semantics.

## Surface

| Concern | In-tab behavior |
|--------|-----------------|
| **argv** | `process.argv` on the shared `processBridge` is set by `runNodeEntry()` (`argv0`, entry path, optional extras). The JS script bridge copies that array into the per-run `process` stub used by `new Function(...)`. Fallback when unset: `['node', <scriptPath>]`. |
| **cwd** | MEMFS working directory via `processBridge.chdir()`; `runNodeEntry()` defaults `cwd` to `/workspace` and creates the directory. |
| **env** | `processBridge.env` is a string-coercing proxy (see `browser-builtins.js`). Init options and `runNodeEntry({ env })` merge into it. The script bridge exposes a shallow copy plus defaults (`HOME`, `PATH`, `NODE_ENV`). |
| **stdout / stderr** | Writable streams; in tests they can be wired to `onStdout` / `onStderr`. |
| **stdin** | Readable; data is pushed with `runtime.pushStdin()`. |
| **exit / exitCode** | `process.exit(n)` throws an error tagged with `exitCode`; the bridge maps that to exit status `n`. Default `exitCode` is `undefined` (matches Node). |
| **Signals** | No OS signals; `SIGWINCH` can be emitted when terminal dimensions change (`setTerminalSize`). |

## Recommended entry API

Prefer **`runtime.runNodeEntry({ entry, cwd, argv, argv0, env })`** so `argv` and `cwd` stay aligned with how `executeCliAsync` runs the file.

## ESM (interpretive bridge)

- Entries that look like ESM (`.mjs`, `package.json` `"type":"module"` neighbors, or leading `import`/`export`) are transpiled with esbuild to CommonJS for `runFileAsync` / `runNodeEntry`.
- `import.meta.url` is defined to a `file://` URL matching the MEMFS path.
- Dynamic `import()` is rewritten to `globalThis.__memfsDynamicImport` and loads MEMFS / builtins; JSON returns `{ default: parsed }`. **Top-level `await` in ESM entries is not supported** (esbuild + `new Function` constraint). **Circular dynamic imports** throw with `ERR_UNSUPPORTED_NODE_MODULES_TYPE`.

## `node:test` in-tab

- A **minimal** stub is registered as builtin `test` (including `node:test`) — see `napi-bridge/node-test-minimal.js`: `test`, `it`, and `describe` run callbacks and await async tests. This is **not** TAP output, not isolation-per-test, and not a substitute for the real Node test runner — use host `node --test` when you need full semantics.

## Gaps

- Real subprocesses and many `child_process` cases are stubbed or host-specific.
- Native addons (`*.node`) are rejected with `ERR_DLOPEN_FAILED` (see resolver / `require` path).
- Full **Node** `node:test` (reporter, concurrency model, snapshotting) runs on the **host** via `npm run test:node-test-runner`; in-tab uses the minimal stub above.
