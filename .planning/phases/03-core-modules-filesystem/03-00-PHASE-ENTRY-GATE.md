# Phase 3 Entry Gate: Phase 1 + Phase 2 Close Requirements

**Purpose:** Phase 3 MUST NOT begin until every item in this document is satisfied. This is the hard prerequisite.
**Enforced by:** `make release-gate` must exit 0 before any Phase 3 task is assigned.
**Owner:** All 4 engineers share responsibility. No single integration lead.

---

## Why This Gate Exists

Phase 3 builds directly on top of Phase 1 and Phase 2 deliverables:
- Phase 3 modules run inside the Wasm binary that Phase 1 produces → if the binary doesn't compile, nothing works
- Phase 3 modules call through the N-API bridge that Phase 2 hardens → if the bridge is permissive, modules will silently fail in production
- Phase 3 tests depend on Phase 2's strict semantics → permissive fallbacks will mask Phase 3 bugs

Starting Phase 3 on a shaky foundation means debugging Phase 3 bugs that are actually Phase 1/2 bugs. That is a time sink we cannot afford.

---

## Phase 1 Close Requirements

### P1-REQ-1: Clean Wasm Compilation (COMP-01)
**Status:** NOT DONE
**What:** `emcmake cmake && make build` completes with zero compilation errors.
**Evidence:** `make build` exits 0. Build log contains no `error:` lines.
**Owner:** `Gemini`
**Blocked by:** Plan 01-02 (iterative compile-fix-shim loop) not yet executed.

### P1-REQ-2: Wasm Binary Loads (COMP-03)
**Status:** NOT DONE
**What:** `dist/edgejs.wasm` passes `WebAssembly.validate()` and `WebAssembly.compile()`.
**Evidence:** `node tests/test-wasm-load.mjs` exits 0 with PASS for validation and compilation.
**Owner:** `Gemini`
**Blocked by:** P1-REQ-1 (no binary to test yet).

### P1-REQ-3: V8 Shims Correct (COMP-02)
**Status:** PARTIAL (pointer assertions done in 01-01, but full shim audit not done)
**What:** All V8 embedding API shims have correct wasm32 pointer widths. No silent corruption paths.
**Evidence:** `static_assert` checks pass at compile time. Shim audit (WS2-T1) classifies every header.
**Owner:** `Gemini`

### P1-REQ-4: Strict Build Flags (P1-GATE-STRICT-BUILD)
**Status:** NOT DONE
**What:** Build succeeds WITHOUT `ERROR_ON_UNDEFINED_SYMBOLS=0` masking missing symbols. Undefined symbols are either explicitly allowed (N-API imports) or fixed.
**Evidence:** `emscripten-toolchain.cmake` uses strict symbol resolution with explicit allowlist.
**Owner:** `Gemini` (WS1-T1)

### P1-REQ-5: Browser Instantiation (P1-GATE-BROWSER-INSTANTIATION)
**Status:** NOT DONE
**What:** Wasm binary instantiates with the real N-API bridge import object, not stub imports.
**Evidence:** `test-wasm-load.mjs` instantiates with `NapiBridge.getImportModule()`, not a Proxy catch-all.
**Owner:** `CurSOR` (WS1-T3, WS1-T4)

### P1-REQ-6: Artifact Manifests (P1-GATE-MANIFESTS)
**Status:** NOT DONE
**What:** Export/import manifest snapshots recorded. Size budget baseline established.
**Evidence:** `make size` runs and reports. Manifest snapshot committed.
**Owner:** `Gemini` (WS1-T5)

---

## Phase 2 Close Requirements

### P2-REQ-1: No Test Suppression
**Status:** NOT DONE
**What:** No `|| true` in any test target in Makefile or package.json.
**Current violation:** `Makefile:160` — `test-napi` target uses `|| true`.
**Fix:** Remove `|| true` from test-napi. Fix any test failures that surface.
**Evidence:** `make release-gate` passes the `test-suppression` check.
**Owner:** `CurSOR` (WS1-T2)

### P2-REQ-2: Unknown Import Rejection (P2-GATE-NAPI-CONFORMANCE)
**Status:** NOT DONE
**What:** Unknown N-API imports are rejected, not silently converted into success paths.
**Current violation:** `napi-bridge/index.js` `getImportModule()` has a permissive Proxy fallback that returns `() => 0` for unknown imports.
**Fix:** Remove the catch-all fallback. Unknown imports must throw or return undefined.
**Evidence:** `make release-gate` passes the `unknown-import-fallback` check.
**Owner:** `cloud` (WS3-T1)

### P2-REQ-3: Runtime Contract (P2-GATE-RUNTIME-CONTRACT)
**Status:** NOT DONE
**What:** `eval` and `runFile` are production API surfaces, not probe wrappers using temp scripts and `process.exit`.
**Current violation:** `napi-bridge/index.js` contains `process.exit(0)`, `process.exit(1)`, `__edge_eval_`, `__edge_run_` probe markers.
**Fix:** Replace temp-script wrappers with clean execution API.
**Evidence:** `make release-gate` passes the `runtime-wrapper-fallbacks` check.
**Owner:** `Kimmy` (WS5-T1, WS5-T2)

### P2-REQ-4: Soak Evidence (P2-GATE-SOAK-EVIDENCE)
**Status:** NOT DONE
**What:** 30+ minute soak test demonstrates non-monotonic handle growth under sustained load.
**Fix:** Build soak harness (WS6-T2), run it, capture evidence, commit metrics.
**Evidence:** Soak log in `.planning/evidence/` showing bounded handle/memory growth.
**Owner:** `CurSOR` (WS6-T1, WS6-T2, WS6-T3)

### P2-REQ-5: Release Guards Active (P2-GATE-RELEASE-GUARDS)
**Status:** NOT DONE
**What:** Static guards prevent regression: no `|| true`, no unknown import fallback, no probe markers.
**Fix:** All guards are already coded in `scripts/release-gate.mjs`. The requirement is that they PASS.
**Evidence:** `make release-gate` exits 0.
**Owner:** `CurSOR` (WS7-T1, WS7-T2)

### P2-REQ-6: All Tests Green
**Status:** PARTIAL (test-basic and test-wasm pass; test-napi suppressed with || true)
**What:** `make test` runs all three test suites and all exit 0 without suppression.
**Evidence:** `make test` exits 0. No `|| true` anywhere.
**Owner:** `CurSOR`

---

## Engineer Assignments (Phase 1+2 Close Sprint)

### `Gemini` — Phase 1 Close (6 tasks)
1. **Execute Plan 01-02**: iterative compile-fix-shim loop until `make build` exits 0
2. **P1-REQ-1**: Zero compilation errors
3. **P1-REQ-2**: dist/edgejs.wasm passes validate/compile
4. **P1-REQ-3**: Shim audit complete (retain/replace/remove classification)
5. **P1-REQ-4**: Strict build flags (remove ERROR_ON_UNDEFINED_SYMBOLS=0, use explicit allowlist)
6. **P1-REQ-6**: Export/import manifest snapshot + size baseline

### `cloud` — Phase 2 Bridge Strictness (4 tasks)
1. **P2-REQ-2**: Remove unknown import fallback from `getImportModule()`
2. **WS3-T2**: Tighten `napi_call_function` semantics
3. **WS3-T3**: Tighten property API status/exception propagation (shared with Kimmy)
4. **WS2-T3**: Remove catch-all no-op layers

### `Kimmy` — Phase 2 Runtime Contract (5 tasks)
1. **P2-REQ-3**: Remove temp-script wrappers from eval/runFile
2. **WS5-T2**: Implement clean execution API for eval/runFile
3. **WS3-T4**: Complete wrap/unwrap lifecycle + finalize callbacks
4. **WS4-T1**: Realistic microtask checkpoint behavior
5. **WS4-T2**: Promise detail parity

### `CurSOR` — Phase 2 Verification + Gate (7 tasks)
1. **P2-REQ-1**: Remove `|| true` from test-napi, fix failing tests
2. **P2-REQ-4**: Build 30+ minute soak harness and capture evidence
3. **P2-REQ-5**: Verify all release gate checks pass
4. **P2-REQ-6**: All tests green without suppression
5. **P1-REQ-5**: Browser instantiation with real bridge imports
6. **WS7-T1**: CI tiering (quick/integration/nightly)
7. **WS7-T2**: Static guardrails active

---

## Execution Order

```
Sprint 1 (BLOCKING — nothing else starts):
  Gemini: Plan 01-02 (compile EdgeJS to .wasm)
  cloud:  P2-REQ-2 (remove unknown import fallback)
  Kimmy:  P2-REQ-3 (remove temp-script wrappers)
  CurSOR: P2-REQ-1 (remove || true, fix test-napi)

Sprint 2 (after Sprint 1 green):
  Gemini: P1-REQ-4 (strict build flags)
  cloud:  WS3-T2, WS3-T3 (bridge semantics tightening)
  Kimmy:  WS5-T2 (clean execution API)
  CurSOR: P2-REQ-4 (soak harness + evidence)

Sprint 3 (close-out):
  Gemini: P1-REQ-6 (manifests + size baseline)
  cloud:  WS2-T3 (remove no-op layers)
  Kimmy:  WS4-T1, WS4-T2 (microtask/promise parity)
  CurSOR: P1-REQ-5 (browser instantiation), P2-REQ-5 (release gate green)
```

---

## Gate Validation

The entry gate is satisfied when ALL of the following are true:

```bash
# 1. Wasm compiles
make build            # exits 0

# 2. All tests pass (no suppression)
make test             # exits 0, no || true anywhere

# 3. Release gate passes
make release-gate     # exits 0 (all 6 checks pass)

# 4. Soak evidence exists
ls .planning/evidence/soak-*.md   # at least one file

# 5. Phase summaries complete
cat .planning/phases/01-wasm-compilation/01-02-SUMMARY.md    # exists
cat .planning/phases/02-napi-bridge-hardening/02-01-SUMMARY.md  # updated with close evidence
```

**If any of these fail, Phase 3 work MUST NOT begin.**

---

## After Gate Passes

1. Update `.planning/STATE.md`: mark Phase 1 and Phase 2 as complete
2. Update progress: `completed_phases: 2`, `percent: 33`
3. Create 01-02-SUMMARY.md with Phase 1 close evidence
4. Update 02-01-SUMMARY.md with Phase 2 close evidence
5. Begin Phase 3 execution per `03-03-ENGINEERING-WORKSTREAMS.md`
