# Phase 1 + Phase 2 Close Checklist and Release Gate

**Owner:** Codex (integration/release)  
**Updated:** 2026-03-18  
**Purpose:** Convert WS7-T3 into a release-quality gate with a machine-readable policy, explicit checkpoint-to-check mapping, and structured evidence requirements.

## Codex-Tagged Task Audit

### Tagged task list

1. `WS7-T3` — Build phase close checklist and machine-enforced release gate.

### Quality audit

- `WS7-T3` was **not production quality** in the prior change.
- The previous version was partially **placebo** because it treated markdown checkpoint IDs as the source of truth and relied on ad hoc substring checks rather than a structured release policy.
- That approach would **not** pass a high-bar production review because the policy/checkpoint mapping was implicit, evidence requirements were not machine-readable, and future CI evolution would require editing code instead of policy.

## Source of Truth

The machine-readable source of truth is now:

- `.planning/phases/02-napi-bridge-hardening/02-03-PHASE-CLOSE-CHECKLIST.json`

The markdown file exists for human review, but the gate executes the JSON policy.

## How to Use This Checklist

1. Complete the lane-owned implementation tasks in `02-02-ENGINEERING-WORKSTREAMS.md`.
2. Populate structured evidence in `.planning/evidence/phase-close/02-napi-bridge-hardening.json`.
3. Use `.planning/evidence/phase-close/02-napi-bridge-hardening.template.json` as the schema/template starting point.
4. Run `make release-gate`.
5. Do **not** mark a phase closed unless every checkpoint below is satisfied and the release gate exits successfully.
6. Update `.planning/STATE.md` and the active phase summary with the evidence snapshot used for the decision.

## Phase 1 Release Checkpoints

- `P1-GATE-STRICT-BUILD` — Strict build/test entry points are present and do not suppress failures.
- `P1-GATE-BROWSER-INSTANTIATION` — Browser/headless instantiation evidence is present and the wasm artifact load validation passes.
- `P1-GATE-MANIFESTS` — Export/import manifest and size budget evidence are present and marked passing.

## Phase 2 Release Checkpoints

- `P2-GATE-NAPI-CONFORMANCE` — Unknown N-API imports are rejected and diagnostics evidence is marked passing.
- `P2-GATE-RUNTIME-CONTRACT` — Public `eval`/`runFile` runtime APIs no longer depend on probe-only temp scripts or forced `process.exit` wrappers.
- `P2-GATE-SOAK-EVIDENCE` — Long-session soak evidence exists and is marked passing.
- `P2-GATE-RELEASE-GUARDS` — Static release guards are active for test suppression and permissive runtime fallback behavior.

## Evidence Contract

The release gate expects a JSON evidence file at:

- `.planning/evidence/phase-close/02-napi-bridge-hardening.json`

The file must record pass/fail state for:

- `browserInstantiation`
- `manifestSnapshot`
- `sizeBudget`
- `diagnostics`
- `soak`

Each artifact must provide a `status` field. The machine-enforced gate currently requires `status: "pass"` for the checkpoint to close.

## Why This Is Production Quality

- policy is data, not hardcoded control flow,
- checkpoint-to-check mapping is explicit and reviewable,
- evidence requirements are structured and machine-readable,
- gate output distinguishes individual check failures from checkpoint failures,
- future CI tiers can extend the JSON policy without rewriting the engine.
