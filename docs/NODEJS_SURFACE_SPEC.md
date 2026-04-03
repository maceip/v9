# Node-shaped surface (product spec)

**Contract:** Behavior that counts as “Node-in-tab” here is whatever the **in-tab API conformance suite** asserts, run on **both** substrates in `npm run test:nodejs-in-tab-contract` (Chromium + Wasm MEMFS). The suite entrypoint is `tests/conformance/in-tab-api-contract-suite.mjs`; the runner is `tests/conformance/test-in-tab-api-contract.mjs`.

**Not in scope for “pass = ship”:** Anything absent from that file is undefined for release quality until a case exists (or the [compatibility matrix](COMPATIBILITY_MATRIX.md) marks it explicitly).

## Modules exercised by the suite (illustrative)

| Area | Conformance coverage (representative) |
|------|--------------------------------------|
| **fs** | Sync workflow, promises pipeline, streams, flags, callbacks |
| **crypto** | `randomBytes`, `randomUUID`, hash, HMAC |
| **zlib** | gzip roundtrip |
| **stream** | `pipeline` through `PassThrough` |
| **string_decoder** | Multi-byte split chunks |
| **child_process** | `spawn` / `exec` / `execSync` (host-backed vs MEMFS shim — suite branches on target) |
| **readline** | Question + injected answer |
| **async_hooks** | `AsyncLocalStorage` |
| **worker_threads** | Node vs bridge subsets |
| **events / buffer / path / url / os / util / perf_hooks** | Small behavioral checks |
| **http / https** | Live TLS via relay where applicable; in-process `createServer` patterns |
| **net** | `BlockList`, `SocketAddress`, policy surface; TCP listen documented as unavailable in bridge |

## Extending the spec

1. Add or extend a case in `in-tab-api-contract-suite.mjs`.
2. Run `npm run test:in-tab-api-contract` on `bridge` and `node` locally.
3. Run the dual gate: `npm run test:nodejs-in-tab-contract`.
4. If the Wasm bundle embeds the suite, rebuild: `npm run build:in-tab-api-contract:wasm`.

Update [COMPATIBILITY_MATRIX.md](COMPATIBILITY_MATRIX.md) when you add or change coverage.
