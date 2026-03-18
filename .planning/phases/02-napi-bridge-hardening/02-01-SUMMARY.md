# Plan 02-01 Summary: N-API Bridge Hardening (Progress Snapshot)

**Updated:** 2026-03-18  
**Status:** In progress (CurSOR-tagged hardening workstreams implemented)

## Delivered in this execution wave

### WS1 — Production gate hardening (CurSOR scope)
- Removed suppressed test failure behavior in `Makefile` (`test-napi` no longer uses `|| true`).
- Upgraded wasm smoke test (`tests/test-wasm-load.mjs`) to strict mode:
  - hard-fails on missing artifacts,
  - requires successful runtime initialization through the real bridge import object,
  - asserts clean diagnostics (`missingImports` and `importErrors` empty).
- Added browser-run validation:
  - `tests/test-browser-smoke.mjs`,
  - `tests/helpers/static-server.mjs` with COOP/COEP headers for browser shared-memory compatibility.

### WS4 — Error metadata parity (CurSOR scope)
- Replaced unofficial error-source placeholders in `napi-bridge/index.js` with parsed metadata derived from real error stack information:
  - source line,
  - script resource,
  - line/column positions,
  - thrown-at formatting.

### WS5/WS6 — Stability + soak + instrumentation (CurSOR scope)
- Added runtime diagnostics counters for leak/perf characterization:
  - active handles, scope depth, free slots,
  - active refs + aggregate refcount,
  - callback info count,
  - wrapped pointer/object counts,
  - array-buffer metadata count.
- Added deterministic per-call cleanup in runtime execution path:
  - closes bridge handle scopes after main invocations,
  - frees argv allocations.
- Added repeated-call runtime stability test:
  - `tests/test-runtime-stability.mjs`.
- Added profile-based soak harness + thresholds:
  - `tests/test-soak.mjs` (`quick`, `integration`, `nightly`),
  - threshold checks for handle slope, JS heap slope, wasm heap slope, missing/import errors.

### WS7 — CI tiers and static guardrails (CurSOR scope)
- Added guardrail tests (`tests/test-guardrails.mjs`) for:
  - no `|| true` suppression in test paths,
  - strict unknown-import behavior in hardening tiers.
- Added CI workflows:
  - `.github/workflows/ci.yml` (quick + integration tiers),
  - `.github/workflows/nightly-soak.yml` (nightly soak/perf tier with artifact upload).
- Added tiered test targets in `Makefile` and npm scripts:
  - quick, integration, nightly.

## Verification Evidence

- `make test` -> pass
- `make test-browser` -> pass
- `make test-quick` -> pass
- `make test-integration` -> pass
- `npm run test:integration` -> pass
- `make test-soak-quick` -> pass
- `node tests/test-soak.mjs --profile integration --duration-sec 60` -> pass
- `node tests/test-soak.mjs --profile nightly --duration-sec 120` -> **fails by threshold** (expected strict gate behavior)

## Additional hardening after nightly run attempt

- Hardened bridge memory marshaling against out-of-bounds writes/reads in `napi-bridge/index.js`:
  - `isMemoryRangeValid(...)` helper added,
  - guarded `readString`, `writeString`, `writeI32`, `writeF64`, `readCString`.
- This fixed a nightly soak crash (`RangeError: Invalid typed array length`) and turned it into threshold-based failure reporting instead of runtime abort.

## Remaining to close Phase 2

1. **NAPI-02 nightly evidence packet**
   - Run the full 30+ minute nightly soak profile in CI and capture artifact history/graphs for acceptance packet.
   - Current strict-profile trend indicates heavy growth under long run; requires follow-up bridge cleanup work before NAPI-02 close.

2. **Bridge strictness ratchet**
   - Continue reducing compatibility fallbacks while keeping bootstrap green.

3. **Phase close evidence bundle**
   - Consolidate strictness + soak results into final closure documentation for NAPI-01/NAPI-02.
