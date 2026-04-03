# Compatibility matrix (built-ins vs in-tab)

**Legend:** **full** — suite asserts behavior on both browser + Wasm hosts; **partial** — subset or host-specific branch; **stub** — import resolves but behavior is minimal or throws for unsupported ops; **N/A** — not exposed as a Node built-in here; **node-only** — asserted only when `CONFORMANCE_TARGET=node`.

| Built-in / area | Status | Proof |
|-----------------|--------|--------|
| **assert** | stub | Import map → bridge; no dedicated conformance case |
| **async_hooks** (`AsyncLocalStorage`) | partial | `in-tab-api-contract-suite.mjs` (sync + Node async branch) |
| **buffer** | partial | `in-tab-api-contract-suite.mjs` |
| **child_process** | partial | `test-child-process.mjs` patterns + suite (`spawn`/`exec`/`execSync` — real vs shim) |
| **console** | partial | Used by harness; no isolated conformance case |
| **crypto** | partial | `test-crypto.mjs` + suite |
| **diagnostics_channel** | stub | Export present |
| **dns** | stub | Export present |
| **events** | partial | `test-eventemitter.mjs` + suite |
| **fs** | partial | `test-fs.mjs` + suite (MEMFS; not full Node fs parity) |
| **http / https** | partial | `test-http.mjs` + suite (fetch/relay/FakeServer — see `docs/TRANSPORT.md`) |
| **http2** | stub | Export present |
| **inspector** | stub | Stubs / devtools placeholders |
| **module** | partial | `package-resolve.js`, MEMFS `require` / ESM path |
| **net** | partial | `net-stubs.js`; suite covers inspection APIs; raw TCP listen unsupported in bridge |
| **os** | partial | Suite numeric / interface smoke |
| **path** | partial | `test-path.mjs` + suite |
| **perf_hooks** | partial | `performance.now` in suite |
| **process** | partial | `test-process.mjs` + `docs/PROCESS_LIFECYCLE.md` |
| **querystring** | stub | Export present |
| **readline** | partial | Suite |
| **stream** | partial | `test-streams.mjs` + suite |
| **string_decoder** | partial | Suite |
| **timers** | partial | Used across suite; no dedicated file |
| **tls** | stub | Export present |
| **tty** | stub | Export present |
| **url** | partial | `test-url.mjs` + suite |
| **util** | partial | `test-util.mjs` + suite |
| **v8** | stub | Export present |
| **worker_threads** | partial | Suite (Node Worker vs bridge MessageChannel subset) |
| **zlib** | partial | Suite |

## Explicit skips

Cases that intentionally skip on a host use `HarnessSkip` in the suite with a reason string — search `HarnessSkip` in `tests/conformance/`.

When adding a row, **link the test file or suite case name**; if there is no test yet, use **stub** and note “no conformance case” in a follow-up issue or roadmap item.
