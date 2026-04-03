# Node.js in a browser tab — roadmap

**Goal:** Run **real, unmodified Node-style apps** in a tab (Chromium or Wasm + MEMFS) so developers can adopt this runtime with confidence. One **Node-shaped** contract, two substrates — see [`CONTRACT_HOSTS.md`](CONTRACT_HOSTS.md).

**Proof in CI:** `npm run test:nodejs-in-tab-contract` (browser + Wasm) and `npm run test:integration` (full gate including MEMFS slices). See the testing matrix at the end of this file.

---

## What “done” means here

- **Contract suite** defines behavior; both substrates run the same tests.
- **MEMFS + resolver** close the gap toward `npm start` on copied `node_modules` (not every edge case — see compatibility matrix direction below).

---

## Completed milestones (verified in-repo)

1. **`node_modules` on MEMFS** — `tests/helpers/seed-memfs-from-host.mjs`; `npm run test:memfs-node-modules`.
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

- **Explicit product spec** from the conformance suite (streams, HTTP, child_process, workers, …).
- **Neutral naming** (`NODEJS_IN_TAB_*`, generated import maps, de-Claude mechanical aliases).
- **Compatibility matrix** (built-in → full / partial / stub) linked to tests or SKIP reasons.
- **Stable embedder API** — document `runInTab`-style bootstrap on top of `runNodeEntry`.
- **Security / capability** model for untrusted code in-tab.

**North star:** If it passes the in-tab contract and matches the matrix, you can ship it — and embedders know what power they grant.

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
