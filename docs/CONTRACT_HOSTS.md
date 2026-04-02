# API contract: which “host” runs the suite?

The behavioral suite in `tests/conformance/in-tab-api-contract-suite.mjs` is **one spec** exercised on **three different hosts**. Only **one** of them is a browser tab.

| Host | What runs it | “In a tab”? |
|------|----------------|------------|
| **Browser** | Headless/real Chromium via Playwright; `web/nodejs-in-tab-contract.html` (+ import map, COOP/COEP) | **Yes** — actual renderer tab |
| **Node (bridge)** | `node` with `CONFORMANCE_TARGET=bridge`; loads **`napi-bridge`** modules in the **same Node process** as the test runner | **No** — ordinary Node I/O |
| **Node (node)** | `CONFORMANCE_TARGET=node`; Node’s real `node:*` built-ins | **No** |
| **Wasm (MEMFS)** | `initEdgeJS` + `runtime.runFileAsync`; bundled suite runs **inside the EdgeJS VM** while the outer process is still Node | **No** — Wasm VM, not Chromium |

So names like **“in-tab”** or **“node-in-tab”** are **legacy umbrella** wording: they referred to the product (“Node-shaped code that often ships in a tab”), not to “every invocation runs in a tab.” The **unified gate** (`npm run test:nodejs-in-tab-contract`) runs **browser host + Wasm host**; the **bridge** target is “bridge modules in Node” for fast iteration.

**Preferred mental model:** **contract suite** + **host** = `{ browser | bridge | node | wasm }`. “In-tab” = **browser host only**.

When adding npm script names or docs, prefer **browser-contract**, **bridge-contract**, **wasm-contract**, or **dual-host gate** over implying everything is tab-bound.
