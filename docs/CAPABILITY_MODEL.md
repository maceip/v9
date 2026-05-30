# Capability model (embedding Node-in-tab)

This runtime executes **JavaScript** supplied by the embedder. Treat app code as **trusted or sandboxed by your own policy** — the bridge does not provide a browser-grade sandbox comparable to an iframe with locked-down CSP.

## What in-tab code can do (typical)

- **Read and write MEMFS** via Node-shaped `fs` APIs (`runtime.fs` / bridged `node:fs`).
- **Perform HTTP(S)** via `fetch` / `http` / `https` shims using the host’s network stack (browser: subject to CORS, COOP/COEP, and optional **`NODEJS_IN_TAB_FETCH_PROXY`**; see **`docs/TRANSPORT.md`**).
- **Observe and set process-like state** exposed on `processBridge` (argv, env, cwd, stdio hooks) — see **`docs/PROCESS_LIFECYCLE.md`**.
- **Import mapped built-ins** per **`web/nodejs-in-tab-import-map.json`** (browser) or bundled shims (Wasm path).

## What is limited or emulated

- **No real OS processes** in the bridge/Wasm path: `child_process` is partially emulated or host-specific; see **`docs/COMPATIBILITY_MATRIX.md`**.
- **No raw TCP listen** in the tab/bridge net stack unless an embedder tunnel is registered (`docs/TRANSPORT.md`).
- **Native addons** (`.node`) are rejected with **`ERR_DLOPEN_FAILED`**.
- **No secret filesystem**: MEMFS is isolated per `initEdgeJS()` instance but is fully controlled by the embedder and any code that runs inside the VM.

## Embedder responsibilities

1. **Supply WASM + module factory** paths appropriate to your deployment (`initEdgeJS` options).
2. **Decide network policy** (offline, allowlisted relay, public relay URLs) via env and transport docs.
3. **Do not expose privileged host APIs** to untrusted bundles without an explicit review — the Node-shaped surface is large.

## Debuggability (direction)

Structured errors and source maps for bundled entries are roadmap items; today, stack traces from the bridge/Wasm path reflect transpiled or eval’d code. Use **`NODEJS_IN_TAB_CONTRACT_DEBUG`** (browser contract helper) and stderr hooks for diagnostics.
