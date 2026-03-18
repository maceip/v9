# Phase 1 + Phase 2 Close Checklist and Release Gate

**Owner:** Codex (integration/release)  
**Updated:** 2026-03-18  
**Purpose:** Convert the workstream close criteria into an explicit checklist that can be evaluated by a machine-enforced gate before Phase 1 or Phase 2 are considered release-ready.

## How to Use This Checklist

1. Complete the lane-owned implementation tasks in `02-02-ENGINEERING-WORKSTREAMS.md`.
2. Run `make release-gate`.
3. Do **not** mark a phase closed unless every checkpoint below is satisfied and the release gate exits successfully.
4. Update `.planning/STATE.md` and the active phase summary with the evidence snapshot used for the decision.

## Phase 1 Release Checkpoints

- `P1-GATE-STRICT-BUILD` — Strict build succeeds without permissive undefined-import masking and without test failure suppression.
- `P1-GATE-BROWSER-INSTANTIATION` — Browser/headless instantiation validates the real bridge import object rather than stubbed imports.
- `P1-GATE-MANIFESTS` — Export/import manifest snapshots and size checks are recorded for the artifact under evaluation.

## Phase 2 Release Checkpoints

- `P2-GATE-NAPI-CONFORMANCE` — Unknown N-API imports are rejected, not silently converted into success paths.
- `P2-GATE-RUNTIME-CONTRACT` — Public `eval`/`runFile` runtime APIs do not depend on probe-only temp scripts or forced `process.exit` wrappers.
- `P2-GATE-SOAK-EVIDENCE` — Long-session soak evidence exists and demonstrates bounded handle/memory growth.
- `P2-GATE-RELEASE-GUARDS` — Static guards are active for test suppression, unknown-import fallback, and diagnostics regressions.

## Machine-Enforced Gate Mapping

The release gate currently enforces the checkpoints that are directly measurable in-repo today:

- required planning + checklist documents exist,
- the checklist contains the release checkpoint IDs above,
- test commands do not suppress failures with `|| true`,
- unknown N-API import fallback is removed,
- `eval`/`runFile` no longer depend on probe-only wrapper markers,
- verification commands succeed:
  - `node tests/test-basic.mjs`
  - `node tests/test-napi-bridge.mjs`
  - `node tests/test-wasm-load.mjs`

Additional CI/nightly evidence checks can be layered onto the same gate as Lane D lands soak and browser validation artifacts.

## Current Expected Outcome

At the time this checklist was added, the gate is expected to **fail** until the remaining permissive bridge/runtime behaviors are removed by their owning lanes. That is intentional: this gate is a phase-close blocker, not a green-by-default smoke target.
