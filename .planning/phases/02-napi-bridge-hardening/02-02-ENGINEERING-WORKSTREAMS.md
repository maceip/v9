# Phase 1 + Phase 2 Engineering Gap Audit and Workstreams

**Date:** 2026-03-18  
**Audience:** Runtime/Bridge implementers  
**Intent:** Brutally honest status plus a concrete hole-closing plan

## Situational Update

### Phase 1 (Wasm Compilation)

**Where we are**
- Build/toolchain path exists and produces `dist/edgejs.wasm` and glue JS.
- Smoke checks validate module shape (`WebAssembly.validate`, compile, expected exports).
- Shim/assertion infrastructure is in place and catches basic wasm32 invariants.

**What is not done (for production)**
- Runtime fidelity still depends on broad shim and stub coverage in `wasi-shims/`.
- Toolchain flags currently allow unresolved/unsupported behavior (`ALLOW_UNIMPLEMENTED_SYSCALLS`, undefined symbol tolerance).
- Smoke test accepts instantiation failure and uses stubbed imports in fallback paths.

**Phase 1 status**
- **Engineering status:** functionally usable for iteration.
- **Production status:** **not closed**.

---

### Phase 2 (N-API Bridge Hardening)

**Where we are**
- Bridge import coverage improved significantly.
- Probe flows execute (`eval('1+1') -> 2`, `runFile('/probe.js') -> 0`) with clean probe diagnostics.
- Core bridge tests are green.

**What is not done (for production)**
- Several bridge behaviors are intentionally permissive to keep bootstrap alive.
- Multiple unofficial APIs are placeholders/no-ops.
- Deterministic probe wrappers currently rely on temp scripts + explicit `process.exit`, which is a harness tactic, not a final runtime contract.
- NAPI-02 soak proof (30+ minute non-growth) is not complete.

**Phase 2 status**
- **Engineering status:** bootstrap/probing stabilized.
- **Production status:** **not closed**.

## Non-Production Inventory (Fake/Mock/Placeholder)

## Phase 1 gaps
- `wasi-shims/` contains extensive stubs/no-op classes/functions (GC, profiler, sandbox, namespace, API placeholders).
- `wasi-shims/wasi-filesystem-stubs.h` is an empty placeholder.
- `wasi-shims/wasi-all-fixes.h` provides broad synthetic substitutes (e.g. embedder graph/disassembler/platform helpers), not engine-fidelity implementations.
- `wasi-shims/wasi-emscripten-mmap-overrides.cc` emulates mmap family with simplifications:
  - permission APIs treated as success for managed regions,
  - partial unmap behavior approximated,
  - `MAP_FIXED` path and anonymous map model are compatibility hacks.
- `emscripten-toolchain.cmake` keeps permissive linker/runtime settings suitable for bring-up but not release-hardness.
- `Makefile` currently suppresses N-API test failure in `test-napi` via `|| true`.
- `tests/test-wasm-load.mjs` is smoke-level and explicitly tolerates instantiation failure.

## Phase 2 gaps
- `napi-bridge/index.js` still contains compatibility shortcuts:
  - unknown N-API imports default to success in import proxy fallback,
  - unknown/undefined `env` imports default to `() => 0`,
  - selected `napi_call_function` exceptions are coerced to successful undefined returns,
  - `lstat` path fallback uses last argv path when arg0 is null.
- `eval` and `runFile` are currently wrapped through generated temporary scripts with forced `process.exit`.
- Several unofficial API implementations are placeholders/no-op behavior (callbacks accepted but not deeply wired, error-source helpers return defaults, microtask/promise detail behavior is simplified).
- Long-session lifecycle/perf evidence is insufficient for NAPI-02 closure.

## Workstreams to Close All Holes

## WS1 — Phase 1 Production Gate Hardening
**Goal:** Move from “builds” to “engine-fidelity build baseline.”

- Replace permissive linker/runtime flags with strict mode and explicit allowlists.
- Remove `test-napi` error suppression in `Makefile`; all tests must gate.
- Upgrade smoke to hard requirement:
  - successful instantiation with real bridge import object,
  - explicit browser-run validation (Playwright/Chrome headless).
- Add artifact integrity checks:
  - deterministic export/import manifest snapshots,
  - size budget warning and regression threshold.

**Exit criteria**
- Strict build succeeds with no fallback undefined import masking.
- Browser instantiation test passes in CI.

---

## WS2 — Platform/OS Contract Fidelity (V8 + Emscripten)
**Goal:** Replace broad stubs with minimal, correct contracts.

- Audit and classify every shim in `wasi-shims/`:
  - **retain** (necessary + correct),
  - **replace** (fake behavior),
  - **remove** (dead compatibility scaffold).
- Refactor mmap wrappers to enforce clear semantics:
  - explicit tracked allocation states,
  - better `mprotect`/`munmap` correctness guarantees,
  - documented unsupported modes with deterministic error codes.
- Eliminate catch-all no-op layers where runtime code now has concrete paths.

**Exit criteria**
- Shim inventory reduced and documented.
- No “silent success” for unsupported platform behaviors.

---

## WS3 — Core N-API Semantics Correctness (NAPI-01)
**Goal:** Ensure bridge APIs behave like Node-API contracts, not permissive adapters.

- Remove implicit-success fallback for unknown import names in `getImportModule()`.
- Tighten `napi_call_function`:
  - strict function/receiver validation,
  - remove compatibility shortcuts that convert errors into success.
- Tighten property APIs:
  - no no-op success on failed property set/get paths,
  - correct status and pending-exception propagation.
- Complete wrap/unwrap lifecycle semantics:
  - finalize callback handling,
  - stable object identity mapping and cleanup.

**Exit criteria**
- Error propagation and status semantics match expected N-API behavior in conformance tests.

---

## WS4 — Unofficial Node API Parity (Bootstrap Dependency Set)
**Goal:** Move unofficial APIs from placeholders to behaviorally accurate implementations.

- Implement realistic microtask checkpoint behavior.
- Implement promise detail introspection parity (state + result semantics).
- Wire module_wrap callback storage to execution paths (import meta/dynamic import hooks).
- Improve contextify parity:
  - compile behavior and metadata compatibility,
  - CJS loader and stack/source handling.
- Replace default error-source placeholder values with meaningful metadata.

**Exit criteria**
- Internal bootstrap paths run without depending on placeholder success semantics.

---

## WS5 — Runtime API Contract Hardening (`eval`/`runFile`)
**Goal:** Replace probe-specific wrappers with production runtime execution APIs.

- Remove temp-script + forced-exit wrappers from public runtime API paths.
- Introduce explicit execution API:
  - clear sync/async semantics,
  - deterministic stdout/stderr/result capture,
  - no hidden process-lifetime side effects.
- Ensure repeated calls preserve runtime state and cleanup consistently.

**Exit criteria**
- `eval` and `runFile` are production API surfaces, not test harness helpers.

---

## WS6 — Soak, Leak, and Performance Characterization (NAPI-02)
**Goal:** Prove long-session stability quantitatively.

- Add instrumentation counters:
  - active handles, refs, callback infos, wrapped pointers, array buffer metadata.
- Add 30+ minute soak harness with representative workloads:
  - callback-heavy, fs-heavy, module-load-heavy, error-heavy loops.
- Define thresholds and fail conditions:
  - no monotonic handle growth,
  - bounded memory growth slope,
  - bounded import error rate (target zero).
- Add JSPI cost benchmark suite for call-heavy paths.

**Exit criteria**
- NAPI-02 evidence packet with graphs/logs and reproducible pass criteria.

---

## WS7 — CI, Safety Rails, and Release Gates
**Goal:** Prevent regression back into permissive/mock behavior.

- Add CI tiers:
  - quick unit (current tests),
  - integration bootstrap/runtime probes,
  - nightly soak/perf.
- Add static guardrails:
  - disallow `|| true` in test targets,
  - fail on unknown import fallback usage in release profile,
  - fail when diagnostics show `missingImports` or `importErrors`.
- Create release checklist for Phase 1 and Phase 2 close.

**Exit criteria**
- Every phase gate is machine-enforced; manual interpretation no longer required.

## Parallelization Strategy (Yes, and Controlled)

Parallel work is not only possible; it is recommended. The key is to parallelize by boundary, not by file.

### Team Topology (4 lanes)

- **Lane A: Build/Platform** — WS1 + WS2 (toolchain strictness, shim audit, mmap/platform correctness).
- **Lane B: Bridge Core Semantics** — WS3 (strict N-API semantics, exception/status correctness).
- **Lane C: Runtime Contract + Unofficial Parity** — WS4 + WS5 (contextify/module_wrap/microtasks and eval/runFile contract cleanup).
- **Lane D: Verification + CI** — WS6 + WS7 (soak harness, perf characterization, release gates).

### What Can Run In Parallel Immediately

- Lane A and Lane B can start immediately and run independently.
- Lane C can start in parallel, but should branch from Lane B weekly to avoid semantic drift.
- Lane D can start instrumentation scaffolding immediately, then consume artifacts from A/B/C continuously.

### Merge Discipline (to avoid chaos)

- Single owning lane per file family:
  - `wasi-shims/*`, `emscripten-toolchain.cmake`, `Makefile` -> Lane A
  - `napi-bridge/index.js` (core semantics) -> Lane B
  - `napi-bridge/index.js` (unofficial/runtime APIs) + runtime wrappers -> Lane C
  - `tests/*`, CI, soak harness -> Lane D
- Daily integration branch cut (`integration/phase2-hardening`) with mandatory smoke + bridge tests.
- Weekly "strictness ratchet": remove one permissive fallback class per week, never reintroduce.

### Risk Controls

- No broad refactors touching both shims and bridge in one PR.
- No `|| true` in test paths.
- Any temporary compatibility bypass must include:
  - issue link,
  - expiration condition,
  - test that fails when bypass removed incorrectly.

## Build Asset Chaos Prevention (No-Collapse Mode)

This project should run with strict artifact containment. Parallel work is safe only if build outputs are isolated and predictable.

### Hard Rules

- Only approved generated-output roots:
  - `build/`
  - `dist/`
  - optional evidence/log root under `.planning/evidence/`
- No generated files in source trees (`napi-bridge/`, `wasi-shims/`, `tests/`, `.planning/phases/*` except markdown evidence).
- No lane shares the same concrete build/output directory.

### Per-Lane Isolation

- Every lane uses its own directory namespace:
  - `build/lane-a/*`, `dist/lane-a/*`
  - `build/lane-b/*`, `dist/lane-b/*`
  - etc.
- Integration lane is read-only consumer of lane artifacts and writes only to:
  - `build/integration/*`
  - `dist/integration/*`

### Artifact Lifecycle

- Keep only latest successful artifact per lane + one previous rollback artifact.
- Delete stale lane artifacts older than 72 hours unless tagged for evidence.
- Preserve only compact evidence in-repo (logs/metrics markdown), not large binaries.

### Merge/CI Guards

- PR gate fails if generated files appear outside approved roots.
- PR gate fails if build outputs are overwritten by another lane namespace.
- Nightly janitor job cleans stale lane directories and emits a short inventory report.

### Operational Discipline

- Each PR includes:
  - artifact path used,
  - size delta vs previous artifact,
  - whether artifact is reusable by integration lane.
- If artifact paths conflict, stop and rename directories before continuing.

## Engineer Tagging (5-Person Assignment)

### Engineer Roster

- `Gemini` - Build/platform execution lead
- `cloud` - Core N-API semantics lead
- `Kimmy` - Runtime contract and unofficial parity lead
- `CurSOR` - Verification, soak, and CI gates lead
- `Codex` - Integration/release lead (cross-lane arbitration)

### Workstream Task Tags

#### WS1 - Phase 1 Production Gate Hardening

- `WS1-T1` Replace permissive linker/runtime flags with strict mode and explicit allowlists. `Gemini`
- `WS1-T2` Remove test suppression (`|| true`) and enforce hard test gating. `CurSOR`
- `WS1-T3` Upgrade smoke requirements to require real bridge import instantiation. `CurSOR`
- `WS1-T4` Add browser-run validation (headless Chrome/Playwright). `CurSOR`
- `WS1-T5` Add deterministic export/import manifest snapshots and size regression checks. `Gemini`

#### WS2 - Platform/OS Contract Fidelity

- `WS2-T1` Audit/classify every shim (`retain/replace/remove`). `Gemini`
- `WS2-T2` Refactor mmap wrapper semantics and unsupported-mode error behavior. `Gemini`
- `WS2-T3` Remove catch-all no-op layers once concrete behavior exists. `cloud`

#### WS3 - Core N-API Semantics Correctness (NAPI-01)

- `WS3-T1` Remove implicit success fallback for unknown imports in `getImportModule()`. `cloud`
- `WS3-T2` Tighten `napi_call_function` semantics and receiver validation. `cloud`
- `WS3-T3` Tighten property API status/exception propagation behavior. `Kimmy`
- `WS3-T4` Complete wrap/unwrap lifecycle + finalize callback handling. `Kimmy`

#### WS4 - Unofficial Node API Parity

- `WS4-T1` Implement realistic microtask checkpoint behavior. `Kimmy`
- `WS4-T2` Implement promise detail parity (state/result semantics). `Kimmy`
- `WS4-T3` Wire module_wrap callbacks to active execution paths. `cloud`
- `WS4-T4` Improve contextify parity and metadata behavior for CJS loader paths. `Kimmy`
- `WS4-T5` Replace error-source placeholder defaults with meaningful metadata. `CurSOR`

#### WS5 - Runtime API Contract Hardening (`eval`/`runFile`)

- `WS5-T1` Remove temp-script + forced-exit wrappers from production API paths. `Kimmy`
- `WS5-T2` Introduce explicit execution API with deterministic capture semantics. `Kimmy`
- `WS5-T3` Validate repeated-call runtime stability and cleanup invariants. `CurSOR`

#### WS6 - Soak/Leak/Performance Characterization (NAPI-02)

- `WS6-T1` Add runtime instrumentation counters for handles/refs/callbacks/metadata. `CurSOR`
- `WS6-T2` Build 30+ minute soak harness across representative workloads. `CurSOR`
- `WS6-T3` Define and enforce leak/perf pass-fail thresholds. `CurSOR`
- `WS6-T4` Add JSPI call-chain benchmark suite and regression reporting. `Gemini`

#### WS7 - CI, Safety Rails, Release Gates

- `WS7-T1` Add CI tiering (quick/integration/nightly soak-perf). `CurSOR`
- `WS7-T2` Add static guardrails (no `|| true`, no unknown-import release fallback). `CurSOR`
- `WS7-T3` Build phase close checklist and machine-enforced release gate. `Codex`

### By Engineer (Responsibility View)

- `Gemini` - WS1-T1, WS1-T5, WS2-T1, WS2-T2, WS6-T4
- `cloud` - WS2-T3, WS3-T1, WS3-T2, WS4-T3
- `Kimmy` - WS3-T3, WS3-T4, WS4-T1, WS4-T2, WS4-T4, WS5-T1, WS5-T2
- `CurSOR` - WS1-T2, WS1-T3, WS1-T4, WS4-T5, WS5-T3, WS6-T1, WS6-T2, WS6-T3, WS7-T1, WS7-T2
- `Codex` - WS7-T3 plus escalation owner for all cross-lane conflicts

### On-Call / Incident Calls

- Build/system red call -> `Primary: Gemini`, `Incident lead: Codex`, `Backup: CurSOR`
- N-API semantic regression call -> `Primary: cloud`, `Backup: Kimmy`, `Incident lead: Codex`
- Runtime contract regression call -> `Primary: Kimmy`, `Backup: cloud`, `Incident lead: Codex`
- CI/soak gate red call -> `Primary: CurSOR`, `Backup: Gemini`, `Incident lead: Codex`
- Integration merge conflict call -> `Primary: Codex`, `Backup: CurSOR`

## Trajectory Analysis vs Architecture

Reference architecture intent:  
- `.planning/PROJECT.md` (N-API split, browser-native JS engine, no V8-in-Wasm)  
- `.planning/research/ARCHITECTURE.md` (four-tier bridge, browser-first overrides, JSPI-first I/O, OPFS persistence, fetch-first networking)

### Directional Scorecard

| Architecture Principle | Current Trajectory | Assessment | Why |
|---|---|---|---|
| N-API split (Wasm C++ layer + browser JS engine) | On track | **Green** | Current implementation is explicitly centered on bridge imports and browser JS execution. |
| Avoid full V8-in-Wasm | On track | **Green** | Current shim strategy preserves compile-time compatibility only; no runtime V8 engine path. |
| N-API correctness over permissive adapters | Partially on track | **Yellow** | Bootstrap is stable, but permissive success fallbacks still mask semantic mismatches. |
| Browser-first module overrides | Not yet materially started | **Yellow/Red** | Architecture calls for higher-level overrides; current effort is still bridge bring-up and parity scaffolding. |
| JSPI-first async I/O | Partial | **Yellow** | JSPI wiring exists, but end-to-end high-confidence perf/behavior data is not yet closed. |
| OPFS persistence as first-class runtime storage | Behind | **Red** | Current runtime behavior is still MEMFS/probe-centric; persistent FS integration pending later phase work. |
| Fetch-first networking strategy | Behind | **Red** | No full production-grade HTTP/HTTPS override/proxy path validated yet. |
| Test-gated milestone progression | Partial | **Yellow** | Unit/probe tests exist, but strict gating is weakened by permissive build/test settings. |

### Bottom Line

- **Overall trajectory:** directionally correct, execution maturity behind architecture intent.
- **Primary gap type:** not wrong architecture; incomplete de-risking and too many temporary compatibility allowances.
- **Correction vector:** WS1 + WS3 first (strictness and semantics), then WS4/WS5, then WS6/WS7 enforcement.

## Execution Order (Recommended)

1. **WS1 + WS3** (stop silent-success behavior and make failures visible)
2. **WS4 + WS5** (bootstrap parity and runtime contract cleanup)
3. **WS2** (reduce shim hacks once failures are explicit)
4. **WS6** (prove long-session stability)
5. **WS7** (lock gains in CI)

## Definition of “Phase 2 Done”

Phase 2 should be marked done only when all are true:
- NAPI-01 passed with strict semantics (no permissive success shortcuts).
- NAPI-02 passed with 30+ minute soak evidence.
- `eval`/`runFile` contract is production-grade and deterministic.
- Diagnostics are clean without relying on unknown import fallback behavior.
