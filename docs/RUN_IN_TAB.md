# Embedder bootstrap: `runInTab`

**Goal:** One supported pattern for running a third-party app in the Wasm + MEMFS runtime from **Node** (CI, tooling): initialize the runtime, optionally copy a host directory tree into MEMFS, set `argv` / `cwd` / `env`, run an entry script.

## API

```js
import { runInTab, runNodeEntry } from '@aspect/v9-edgejs-browser/napi-bridge/run-in-tab';
```

- **`runInTab(opts)`** — `await initEdgeJS(runtimeInit)` → optional **`seedFromHost`** → **`runNodeEntry`**. Returns `{ runtime, result, stdout, stderr }`.
- **`runNodeEntry(runtime, opts)`** — Thin wrapper around `runtime.runNodeEntry` (existing entry API).

### Options (`runInTab`)

| Field | Description |
|-------|-------------|
| **`entry`** | Required. MEMFS path to the script, or path relative to **`root`**. |
| **`root`** | MEMFS app root; default `process.env.NODEJS_IN_TAB_ROOT` or `/workspace`. |
| **`cwd`** | Process cwd; defaults to **`root`**. |
| **`argv`**, **`argv0`**, **`env`** | Passed through to `runNodeEntry` (and **`env`** merged into `initEdgeJS` env). |
| **`seedFromHost`** | `{ hostPath, memfsPath }[]` — copy real host trees into MEMFS via `seedMemfsFromHostPath`. |
| **`runtimeInit`** | Forwarded to **`initEdgeJS`** (`wasmPath`, `modulePath`, `files`, `preferJsScriptBridge`, `onStdout`, …). |
| **`captureOutput`** | Default `true`: if `runtimeInit` does not set `onStdout`/`onStderr`, chunks are collected into returned `stdout`/`stderr` arrays. |

### Environment (Node host)

Any **`NODEJS_IN_TAB_*`** variables in `process.env` are merged into the runtime’s initial env (in addition to `runtimeInit.env` and `opts.env`). Documented transport vars live in **`docs/TRANSPORT.md`** (`NODEJS_IN_TAB_FETCH_PROXY`, HTTP relay, etc.).

## Related

- **Process lifecycle** (argv, cwd, stdio, exit): **`docs/PROCESS_LIFECYCLE.md`**
- **Seeding `node_modules` from disk:** **`napi-bridge/seed-memfs-from-host.mjs`** (also re-exported from **`tests/helpers/seed-memfs-from-host.mjs`** for older tests)
- **Pre-bundle escape hatch:** **`scripts/bundle-app-graph.mjs`**, `npm run test:bundle-app-graph`
