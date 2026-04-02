# Node.js-in-tab: architecture synthesis and roadmap

This document merges two threads of direction for the project:

1. **Uniformity** — one public Node-shaped interface, one behavioral contract, multiple substrates that must not drift.
2. **Existing apps** — closing the gap to “clone a repo and run it” (`npm start`, tests), where the hard problems are **ecosystem mechanics**, not a few missing `fs` methods.

Claude-named paths and a large reference integration app are **scaffolding**: they stress-test real-world patterns. The product goal is **general-purpose Node-in-tab**, not a single-vendor wrapper.

---

## One interface, dual substrate (no product schism)

- **Single interface (what authors target)** — The Node-shaped surface: built-ins, idioms, and behavior encoded in the conformance suite and `napi-bridge` semantics. App code is written against this, not against “browser vs Wasm.”
- **Dual substrate (how it runs)** — Today: (a) real Chromium + import map + `napi-bridge`, and (b) EdgeJS-in-Wasm + MEMFS + the same bridges bundled into the VM. Same contract; two hosts — analogous to Node on different OSes.
- **Single validation gate** — One command must exercise **both** substrates against the **same** suite so implementations stay aligned. Split “browser-only” / “wasm-only” checks are for maintainers, not the primary CI story.

**Uniformity targets across components**

- **One behavioral spec** — The conformance suite (and, over time, the compatibility matrix) is the source of truth for what “Node-in-tab” means here.
- **One naming direction** — Prefer neutral env vars and artifacts (`NODEJS_IN_TAB_*`, `NODEJS_CONTRACT_OFFLINE`, `nodejs-in-tab-contract` entrypoints). Keep Claude-related names as aliases or legacy paths until a deliberate migration completes.
- **Import maps** — The browser entry’s import map must stay aligned (`web/index.html`, contract HTML). Prefer **generating** this from a single module or JSON so drift is impossible.
- **Lifecycle parity** — Document and implement the same `argv`, `cwd`, `env`, stdio, exit codes, and signal behavior on every substrate; avoid “works in browser host but not in Wasm” without an explicit, tested gap.

---

## Honest gap: interface vs “drop in `npm start`”

Most blockers for **existing** Node repos are:

| Area | Why it matters |
|------|----------------|
| **`node_modules` + resolution** | Real apps depend on `package.json`, `exports`, `imports`, conditions, hoisting, symlinks. |
| **CJS ↔ ESM interop** | Published packages mix formats; loaders must match common patterns. |
| **Process lifecycle** | `argv`, `cwd`, stdio, `exit` / `exitCode`, signals (often simulated). |
| **Native addons (`*.node`)** | Often unsupported in-tab; needs a clear policy: hard error, host registry, or substitute. |
| **Test runners** | `node:test`, Jest, Vitest, etc. add surface; tackle after loaders and lifecycle are solid. |

**Reference app** — A large, real codebase (today Claude-oriented) remains the **integration anchor**: it proves depth beyond the conformance floor. The **product** narrative is compatibility and real-app runs; the anchor can stay implementation detail until more flagship apps exist.

**Escape hatches**

- **Pre-bundle path** — For arbitrary graphs before the resolver is complete, an app-level esbuild/rollup step can reduce import-map pressure while keeping the same entry semantics.
- **Compatibility matrix** — Every row links to a test or an explicit SKIP with reason; include columns like “interpretive,” “pre-bundle only,” “unsupported.”

---

## Architectural priorities (high impact)

1. **Contract + matrix as the floor** — Expand the suite where real apps break; keep both substrates on the unified gate.
2. **Resolver + loaders** — Minimal `package.json` resolution, then full `exports`/`imports`, CJS path, ESM path, `createRequire`.
3. **MEMFS + real `node_modules` trees** — Load from disk or tarball into the VM; symlink-aware layout when feasible.
4. **Lifecycle API** — Stable host/bootstrap API (`runInTab` or equivalent): FS layout, entry, `argv`, `env`, stdio hooks, teardown.
5. **Native addon policy** — Explicit behavior and diagnostics, not silent failure.
6. **Security / capability model** — As arbitrary app code becomes runnable, document what the tab may and may not do.

---

## Completed baseline milestones (all verified in-repo)

Ordered so each step built toward “run a real `package.json` repo” without pretending parity where it does not exist. All ten are **done** — referenced files and npm scripts confirmed present.

1. **`node_modules` on MEMFS** — Prove a real tree (copy or unpack) and correct path access from the runtime. **Done (baseline):** `tests/helpers/seed-memfs-from-host.mjs` materializes host paths into `runtime.fs`; `npm run test:memfs-node-modules` checks a real `node_modules/fflate` tree byte-for-byte in MEMFS.
2. **Minimal resolver** — `main` + simple `exports` object forms; expand to patterns and `imports` later. **Done (baseline):** `napi-bridge/package-resolve.js` + `_resolveNodeModuleBare` in `napi-bridge/index.js`; nested `node`/`require`/`import` targets (common npm shapes); `npm run test:memfs-exports`.
3. **CJS loader** — `require`, cache, `__dirname` / `__filename`, JSON requires as needed by the reference app. **Done (baseline):** existing MEMFS `require` + `module-shim` `createRequire.resolve` delegating to `_memfsRequire.resolve(id, dir)`; covered by `test:memfs-reference-app` / `test:memfs-exports`.
4. **ESM loader + CJS interop** — Dynamic `import()`, `import.meta.url`, extension rules aligned with on-disk layout. **Done (interpretive bridge):** esbuild transpile + `import.meta.url` define + MEMFS `import()` via `globalThis.__memfsDynamicImport` (pending-import drain before run completes); **limits:** no top-level `await` in entries, no circular dynamic imports, `import.meta` only what esbuild defines. Tests: `npm run test:memfs-esm-entry`, `npm run test:memfs-import-meta-dynamic`.
5. **Process lifecycle contract** — `argv`, `cwd`, `env`, `exitCode`, `exit`, stdio behavior; documented signal semantics. **Done (baseline):** `docs/PROCESS_LIFECYCLE.md` + bridge `process` stubs read `processBridge` `argv`/`env`; `npm run test:run-node-entry` checks argv propagation.
6. **Entrypoint contract** — `node path/to/file.js [args]` equivalence via one host API shared by all substrates. **Done (baseline):** `runtime.runNodeEntry({ entry, cwd, argv, argv0, env })` and `import { runNodeEntry } from '@aspect/v9-edgejs-browser/napi-bridge/run-in-tab'` (`napi-bridge/run-in-tab.mjs`).
7. **Native addon policy** — Structured errors, optional host allowlist or stub table; no opaque breaks. **Done (baseline):** `require` throws `ERR_DLOPEN_FAILED` for `*.node`; `npm run test:native-addon-reject`.
8. **Pre-bundle escape hatch** — Document and automate app graph bundling when interpretive resolution is insufficient. **Done (baseline):** `scripts/bundle-app-graph.mjs` (esbuild `--entry` / `--outfile`); `npm run test:bundle-app-graph`; see roadmap “Pre-bundle path” above.
9. **Reference app CI** — Install (where allowed) → seed MEMFS → run documented entry; track blockers as issues. **Done:** `npm run test:memfs-reference-app` (host `fflate` → MEMFS → `require('fflate')` + `gzipSync`); runs in `test:integration` / `make test-integration`.
10. **Test execution milestone** — Start with **`node --test`** or the smallest viable runner; add others after subprocess/spawn story is clear. **Done:** host gate `npm run test:node-test-runner` (`node --test` on `tests/fixtures/node-test-example/parity.test.mjs`); in-tab gate `npm run test:memfs-node-test` (minimal `node:test` stub + ESM entry). Full Node test runner parity is explicitly out of scope for the stub — see `docs/PROCESS_LIFECYCLE.md`.

---

## Next ten developmental targets (building on the foundation)

Synthesized from prior “high impact / low effort” and “strategic” lists after merge cleanup. Ordered so each step builds on the foundation above. These are **directional** until each is implemented and marked complete in-repo.

1. **One “Node surface” spec, two adapters** — Treat `napi-bridge` + the conformance suite as **the** contract; keep **browser** and **Wasm** as two adapters that must satisfy the **same** tests. The unified gate (`npm run test:nodejs-in-tab-contract`) already enforces alignment; the next step is making the **enumerated behaviors** (streams, HTTP, `child_process`, `worker_threads`, etc.) the **explicit product spec** and naming everything else around that.

2. **Neutral runtime branding (mechanical de‑Claude‑ing)** — Introduce **parallel neutral names**: `nodejs-in-tab-contract` artifacts, `NODEJS_IN_TAB_*` env vars, `dist/*` filenames where legacy ones remain, with **thin re-exports** or npm scripts so nothing breaks. No behavior change — just lower cognitive load for contributors and users to match **general-purpose runtime** positioning. Keep deprecated aliases until a deliberate removal.

3. **Import map generation (one shared source)** — Today `web/index.html` and `web/nodejs-in-tab-contract.html` must stay in sync **by hand**. **Generate** the import map from a single JSON or JS module consumed by the dev server, contract HTML, and docs snippets, plus a CI **”maps must match”** guard so maps cannot drift silently.

4. **Authoritative compatibility matrix** — Maintain **one** table: built-in → **full / partial / stub / N/A / Wasm-only**, with links to tests (or an explicit **SKIP** with reason). Cheap to maintain if every row maps to a conformance case in `tests/conformance/`. This becomes the project's **homepage-level** artifact.

5. **`runInTab` / host SDK (app bootstrap path)** — Document and stabilize **one** supported way to run a third-party app: **entry file + MEMFS seed + env + optional pre-bundle**. One documented API — `runInTab({ root, entry, argv })` or equivalent — covering init, FS layout, `argv`, `env`, stdio hooks, and teardown (building on `runtime.runNodeEntry` / `napi-bridge/run-in-tab.mjs`). Hides EdgeJS/Wasm behind init/teardown; clarifies adoption for embedders.

6. **npm / app story** — Either a documented **bundle-first** path or MEMFS `node_modules` + **minimal resolver** (`package.json` `main` / `exports` only to start), aligned with the escape hatches above. Goal: a third-party app with dependencies can be loaded and run without manual intervention.

7. **HTTP client/server parity** — Expand `undici` / `fetch` bridge where tests prove behavior; keep **network policy** explicit (offline, allowlist, etc.).

8. **Streams & backpressure** — Real apps often fail on subtle stream edge cases; invest where the suite still **skips** or **stubs**.

9. **Child process & shell model** — Clear contract: what is **emulated**, what is **host-backed**, what is **unsupported** (complements `docs/PROCESS_LIFECYCLE.md` gaps).

10. **Debuggability & security** — Source maps, structured errors, optional logging bridge to the parent page; realistic inspect/trace for the Wasm path. Document the **capability model**: what arbitrary code may do in-tab, for anyone **embedding** the runtime.

### North star

Be the project where **if it passes the in-tab contract and fits the compatibility matrix, you can ship it** — and embedders know what power they are granting to untrusted code.

---

## What not to confuse

- **Two substrates** is an implementation detail for maintainers, not a choice authors should have to make for day-to-day development.
- **One npm test command** for the repo should remain the **unified dual gate**; avoid documentation that implies validating only one substrate for “release quality.”

### Testing matrix (what proves what)

| Command / target | Chromium (real tab) | Node hosts Wasm + MEMFS | Same `in-tab-api-contract` suite | MEMFS roadmap / resolver / `node:test` slices |
|------------------|----------------------|---------------------------|-----------------------------------|-----------------------------------------------|
| `npm run test:nodejs-in-tab-contract` | Yes (Playwright + `web/nodejs-in-tab-contract.html`) | Yes (bundled suite in MEMFS + `runFileAsync`) | **Yes** — both phases | No |
| `npm run test:integration` | **Yes** (includes unified contract) + browser smoke | Yes | **Yes** (via unified contract) | **Yes** — seed, exports, ESM, stub, host `node --test`, etc. |
| `npm run test:memfs-*` (individual) | No | Yes | No | **Subset** — see script names in `package.json` |
| `npm run test:in-tab-api-contract:bridge` | No | Yes (Node runs bridge target **without** unified wrapper) | Yes (single target) | No |

**Release-quality bar for substrate alignment:** run `npm run test:nodejs-in-tab-contract` (or full `npm run test:integration`). Running only MEMFS roadmap tests validates the resolver and glue but **does not** prove every contract check in **headless Chromium**.

**Gaps (still true):** `exports` patterns / `imports` field, full host `node:test` semantics in-tab, and anything not covered by a file in `tests/conformance/`. Those are **product** gaps, not “the wrong test command.”

---

## Related commands

- Unified contract (browser host + Wasm): `npm run test:nodejs-in-tab-contract`
- Suite only (Node or bridge): `npm run test:in-tab-api-contract` (+ `:bridge`, `:node`, `:bundle`)
- Wasm bundle of the suite: `npm run build:in-tab-api-contract:wasm`

Legacy `test:claude-contract:*` npm scripts are thin aliases during migration.

This file should be updated as milestones complete.
