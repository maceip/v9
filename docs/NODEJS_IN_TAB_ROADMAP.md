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

## Next ten developmental targets (sequenced for existing-app progress)

Ordered so each step builds toward “run a real `package.json` repo” without pretending parity where it does not exist.

1. **`node_modules` on MEMFS** — Prove a real tree (copy or unpack) and correct path access from the runtime. **Done (baseline):** `tests/helpers/seed-memfs-from-host.mjs` materializes host paths into `runtime.fs`; `npm run test:memfs-node-modules` checks a real `node_modules/fflate` tree byte-for-byte in MEMFS.
2. **Minimal resolver** — `main` + simple `exports` object forms; expand to patterns and `imports` later.
3. **CJS loader** — `require`, cache, `__dirname` / `__filename`, JSON requires as needed by the reference app.
4. **ESM loader + CJS interop** — Dynamic `import()`, `import.meta.url`, extension rules aligned with on-disk layout.
5. **Process lifecycle contract** — `argv`, `cwd`, `env`, `exitCode`, `exit`, stdio behavior; documented signal semantics.
6. **Entrypoint contract** — `node path/to/file.js [args]` equivalence via one host API shared by all substrates.
7. **Native addon policy** — Structured errors, optional host allowlist or stub table; no opaque breaks.
8. **Pre-bundle escape hatch** — Document and automate app graph bundling when interpretive resolution is insufficient.
9. **Reference app CI** — Install (where allowed) → seed MEMFS → run documented entry; track blockers as issues.
10. **Test execution milestone** — Start with **`node --test`** or the smallest viable runner; add others after subprocess/spawn story is clear.

---

## What not to confuse

- **Two substrates** is an implementation detail for maintainers, not a choice authors should have to make for day-to-day development.
- **One npm test command** for the repo should remain the **unified dual gate**; avoid documentation that implies validating only one substrate for “release quality.”

---

## Related commands

- Unified contract (browser host + Wasm): `npm run test:nodejs-in-tab-contract`
- Suite only (Node or bridge): `npm run test:in-tab-api-contract` (+ `:bridge`, `:node`, `:bundle`)
- Wasm bundle of the suite: `npm run build:in-tab-api-contract:wasm`

Legacy `test:claude-contract:*` npm scripts are thin aliases during migration.

This file should be updated as milestones complete.
