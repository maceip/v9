# Node.js in a browser tab — roadmap

**Goal:** Run **real, unmodified Node-style apps** in a tab (Chromium or Wasm + MEMFS) so developers can adopt this runtime with confidence. One **Node-shaped** contract, two substrates — see [`CONTRACT_HOSTS.md`](CONTRACT_HOSTS.md).

**Proof in CI:** `npm run test:nodejs-in-tab-contract` (browser + Wasm) and `npm run test:integration` (full gate including MEMFS slices). See the testing matrix at the end of this file.

---

## What “done” means here

- **Contract suite** defines behavior; both substrates run the same tests.
- **MEMFS + resolver** close the gap toward `npm start` on copied `node_modules` (not every edge case — see compatibility matrix direction below).

---

## Completed milestones (verified in-repo)

1. **`node_modules` on MEMFS** — `napi-bridge/seed-memfs-from-host.mjs` (tests re-export from `tests/helpers/`); `npm run test:memfs-node-modules`.
2. **CJS loader** — MEMFS `require` + `createRequire.resolve`; `test:memfs-reference-app` / `test:memfs-exports`.
3. **Process lifecycle** — `docs/PROCESS_LIFECYCLE.md`, `processBridge`; `npm run test:run-node-entry`.
4. **Entry API** — `runtime.runNodeEntry` / `napi-bridge/run-in-tab.mjs`.
5. **Native addons** — `ERR_DLOPEN_FAILED` for `*.node`; `npm run test:native-addon-reject`.
6. **Pre-bundle escape hatch** — `scripts/bundle-app-graph.mjs`; `npm run test:bundle-app-graph`.
7. **Resolver — `exports` patterns, `imports`, conditions** — `napi-bridge/package-resolve.js` + MEMFS resolution (`import` vs `require`, `development`/`production` via `NODE_ENV`); `npm run test:memfs-exports`.
8. **ESM in MEMFS** — Transpile + dynamic `import()`; **top-level await** via esbuild ESM bundle + `import(data:…)`; **circular dynamic import** no longer hard-fails; `npm run test:memfs-esm-entry`, `test:memfs-esm-tla`, `test:memfs-import-meta-dynamic`, `test:memfs-dynamic-import-cycle`.
9. **Reference / multi-package apps** — Real packages from host disk → MEMFS: `fflate` only (`test:memfs-reference-app`) and **fflate + `isomorphic-timers-promises`** with mixed ESM + TLA (`test:memfs-multi-package-app`).
10. **`node:test` in-tab** — Stub with `describe` / `test` / hooks (suite-scoped, ordered); ESM entries use `await describe(…)` so work finishes before module completion; `npm run test:memfs-node-test`. Host parity fixture: `npm run test:node-test-runner`.

---

## Next direction (not yet “done” in-repo)

Each item below lists **what exists today** and **what “done” means** so the scope is not vague.

- **Conformance-backed product spec (streams, HTTP, `child_process`, workers, …)**  
  - **Today:** [`NODEJS_SURFACE_SPEC.md`](NODEJS_SURFACE_SPEC.md) indexes what `tests/conformance/in-tab-api-contract-suite.mjs` already asserts; the suite is the behavioral source of truth.  
  - **Done when:** For every built-in you claim as “supported” for shipping, there is either (1) at least one passing case in that suite that runs on **both** substrates in `npm run test:nodejs-in-tab-contract`, or (2) a `HarnessSkip` (or equivalent) with a **stable reason string** and a matching row in the compatibility matrix. “Supported” without (1) or (2) is documentation-only, not product spec.

- **Neutral naming (`NODEJS_IN_TAB_*`, import maps, retire Claude-prefixed UX)**  
  - **Today:** Browser import map is generated from [`web/nodejs-in-tab-import-map.json`](../web/nodejs-in-tab-import-map.json) (`npm run apply:import-map`); drift is caught by `npm run test:import-map-consistency`. `NODEJS_IN_TAB_CONFORMANCE_TARGET` mirrors `CONFORMANCE_TARGET` when the latter is unset (`npm run test:conformance-env-alias`). Transport-related env vars are documented in [`TRANSPORT.md`](TRANSPORT.md).  
  - **Done when:** User-facing npm scripts and doc links prefer **nodejs-in-tab** / **in-tab-api-contract** names; `test:claude-contract:*` exist only as **deprecated aliases** documented in one place, or are removed after a deprecation window. Any new env knobs use the `NODEJS_IN_TAB_` prefix unless they are upstream (e.g. `NODE_ENV`).

- **Compatibility matrix (built-in → full / partial / stub / N/A)**  
  - **Today:** [`COMPATIBILITY_MATRIX.md`](COMPATIBILITY_MATRIX.md) is a hand-maintained table with representative proof links.  
  - **Done when:** Each row names a **specific** proof: a test file, a suite case title, or an explicit skip reason (grep `HarnessSkip` in `tests/conformance/`). Rows without proof are marked **TBD** until filled. Optional later step: generate rows from the suite metadata (not required for the first “done”).

- **Embedder bootstrap API (`runInTab` / `runNodeEntry`)**  
  - **Today:** Node embedders can use `runInTab` in [`napi-bridge/run-in-tab.mjs`](../napi-bridge/run-in-tab.mjs); see [`RUN_IN_TAB.md`](RUN_IN_TAB.md) and `npm run test:run-in-tab`. `runtime.runNodeEntry` remains the low-level entry.  
  - **Done when:** The doc lists a **minimal supported option surface** (entry, cwd/root, argv, env, MEMFS seed, `initEdgeJS` passthrough) and any **intentional non-goals** (e.g. no separate browser `runInTab` helper, or add one if required). If embedders need cleanup, document and optionally expose **teardown** (what to call on `runtime` / process exit) when the Wasm instance can be torn down safely.

- **Security, capability, and debuggability for untrusted or third-party code**  
  - **Today:** [`CAPABILITY_MODEL.md`](CAPABILITY_MODEL.md) states what code can reach (MEMFS, network shims, no real child processes in-tab, etc.).  
  - **Done when:** The capability doc stays aligned with the matrix and transport docs; **implementation** items (source maps for bundled MEMFS entries, structured errors, optional parent-page logging, Wasm-side inspect/trace) are either shipped with tests or listed as **explicit deferred** bullets with owners/commands— not lumped under a single vague “security” line.

**North star:** Shipping quality means `npm run test:nodejs-in-tab-contract` passes **and** the compatibility matrix has no misleading “full/partial” row without proof; embedders can read one capability doc and know what untrusted code can do.

---

## Related commands

| Command | Role |
|--------|------|
| `npm run test:nodejs-in-tab-contract` | **Dual substrate** (Playwright + Wasm) on the same suite |
| `npm run test:integration` | Full repo integration gate |
| `npm run test:in-tab-api-contract` | Suite on one target (+ `:bridge`, `:node`, `:bundle`) |
| `npm run build:in-tab-api-contract:wasm` | Rebuild Wasm bundle after suite edits |

Legacy `test:claude-contract:*` scripts remain thin aliases during migration.

Update this file when milestones land.
