# Parsec Status and Priority Gate

## Purpose

This document explains the current status of `experimental/parsec-engine`, why it has not received deeper optimization work recently, and what must be true before optimization becomes a priority.

## Current reality (blocking issue)

The immediate team blocker is not Parsec packaging speed.  
The blocker is baseline runnability: **Cursor/browser runtime flows are still unstable enough that some target apps do not reliably run end-to-end**.

Because of that, performance work (faster prep, more aggressive lift heuristics, deeper caching strategy) has intentionally received limited attention.  
If an app does not reliably run, optimizing it does not create practical value.

## Practical priority order

1. **Runnability first**  
   - Browser runtime initializes consistently.
   - CLI bundles render and interact reliably.
   - Integration/browser CI gates are stable and trustworthy.
2. **Correctness second**  
   - No hidden regressions via relaxed assertions.
   - Smoke/interactivity checks reflect real browser behavior.
3. **Performance third**  
   - Faster Parsec prep/lift stages.
   - Better cache reuse and warm-start behavior.
   - Deeper code splitting and packaging strategy tuning.

## What Parsec already covers

Parsec already provides meaningful V1 functionality for the "easy-hard" path:

- Multi-input ingestion (`npm`, JS files, zip, GitHub repo, raw wasm).
- Static analysis and source rewrites for browser compatibility.
- Aggressive bundling/minification path.
- Shared network virtualization hooks and loader metadata.
- Stage-2 lift planning/execution support for selected repo workloads.

So the issue is not "Parsec has no direction."  
The issue is **execution priority** under a hard platform constraint: runnability is currently the bottleneck.

## Why optimization is currently deferred

Optimization work is deferred by design until the following are true:

- Browser smoke/interactivity tests are consistently green (not intermittently green).
- CI failures are dominated by real regressions, not harness instability.
- Critical CLIs can load and run without brittle one-off handling.

Until those gates are met, optimization output is likely to be noisy, hard to validate, and expensive to maintain.

## Readiness gate for renewed Parsec acceleration

Parsec optimization should be re-prioritized when all are true:

- A stable browser smoke contract is enforced in CI.
- Runtime and integration lanes are green across consecutive runs.
- Top target app set (Cursor/Codex-related flows) is runnable end-to-end in browser.

At that point, performance work becomes high-leverage and measurable.

## Immediate working policy

For now:

- Treat Parsec optimization as **secondary**.
- Treat runtime runnability and CI stability as **primary**.
- Reject "speed-only" work that does not improve successful run rate.

