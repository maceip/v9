# Transport: HTTP, CORS, and raw sockets (in-tab)

Node-shaped code in a real browser tab cannot open host **syscall-level** TCP sockets. Every “socket works” story is implemented as **allowed browser egress** (today mainly `fetch` / `WebSocket`) plus a **relay** you control that performs real I/O on the far side.

This doc merges **reference** (what the repo implements) with **strategy** (why the pieces exist together).

---

## Strategy synthesis

### Goal

The product direction is **general-purpose Node-in-tab** (see [`NODEJS_IN_TAB_ROADMAP.md`](NODEJS_IN_TAB_ROADMAP.md)): run **real Node patterns** with minimal rewrites, on a **fast** substrate (EdgeJS Wasm + `napi-bridge`), not a full kernel-in-tab stack that proved too slow.

**“Sockets should work”** therefore means: **`net` / `tls` / HTTP stacks** must be able to reach the same *classes* of endpoints real Node reaches, subject to **explicit capability and security policy**.

### The browser is the only client surface

For embedded Chromium, outbound bits leave the renderer only through **platform APIs** (`fetch`, `WebSocket`, etc.). There is no raw `AF_INET` socket from untrusted tab code.

That does **not** mean applications are limited to “only HTTPS REST.” It means whatever carries bytes to the internet must eventually be **framed** for those APIs—for example **TCP-over-WebSocket** to a proxy (Wisp-like), or **HTTP relay** for request/response workloads.

### CORS is the economic reason for relays

**CORS gates cross-origin `fetch` response access.** Unmodified Node often assumes `http.get` / client SDKs can talk to **arbitrary hosts** without those servers emitting browser-friendly `Access-Control-Allow-*` headers.

- **Direct `fetch` from the tab to arbitrary APIs** is therefore often **broken-by-design** in the browser, independent of TLS or Wasm.
- A **same-origin (or embedder-controlled) HTTP relay** makes the browser call **your** origin; **your** server calls the target. The server-to-server leg is **not** subject to browser CORS.

**Fetch proxy vs TCP tunnel**

- **`NODEJS_IN_TAB_FETCH_PROXY`** (POST JSON relay) already solves **HTTP-shaped** outbound traffic under CORS pressure: same-origin to the proxy, unrestricted outbound from the proxy. See the env table below.
- A **general TCP tunnel** (e.g. Wisp-style multiplexed streams over one `wss:` session) is for **everything that is not “one HTTP exchange”**: duplex streams, odd TLS, protocols that are not convenient to map onto `fetch`, and **`net.connect`-style** expectations. It is the usual way to avoid trying to hammer **all** of Node’s network surface into `fetch`.

So: **without some class of relay you trust, cross-origin HTTP from the tab stays CORS‑kneecapped**; without a **byte-stream tunnel**, non-HTTP / raw-socket patterns stay **kneecapped** even when HTTP relay exists.

### WebSocket handshake headers (browser)

The DOM **`WebSocket` constructor does not accept arbitrary handshake headers** (unlike Node’s `ws` client). That affects **how you authenticate the outer tunnel**, not whether TCP-in-tunnel is viable. Typical patterns: token in **URL/query**, **cookies** (when same-site fits), **`Sec-WebSocket-Protocol`**, or **first tunneled frame** after connect—**not** “set `Authorization` like Node `ws`.”

### Wisp vs Emscripten POSIX socket proxy (when risk is similar)

Both are **WebSocket (or similar) to a privileged process that does real TCP**—same physics, different **integration layer**:

- **Wisp (or compatible):** explicit **muxed TCP streams**; good when the missing capability is **`net` / arbitrary bytes** from JS or a dedicated client.
- **Emscripten `PROXY_POSIX_SOCKETS` + `websocket_to_posix_proxy`:** toolchain-owned **POSIX `socket/connect/...` from Wasm/C**; good when the hot path is **native code hitting libc/libuv sockets** and you want fewer bespoke wire protocols—**if** the build actually routes syscalls there (see `emscripten-toolchain.cmake` / `wasi-shims/napi-emscripten-library.js`; not a free toggle).

Pick **by where your failing I/O lives** (JS `net` vs Wasm POSIX), not by assuming one removes CORS—**CORS is about direct browser HTTP**, which relays address separately.

---

## Implementation tracks (reference)

1. **HTTP(S) as `fetch`** — `napi-bridge/http.js`, `https`, and the `undici` stub call **`browserHttpFetch()`** from `napi-bridge/transport-policy.mjs`. Optional **same-origin fetch proxy** via **`NODEJS_IN_TAB_FETCH_PROXY`** when CORS or related browser policy blocks direct calls.

2. **Raw TCP / `tls.connect` / `net.connect`** — Two paths:

   **a) gvisor-tap-vsock (recommended):** Set **`NODEJS_GVISOR_WS_URL`** to point at a locally-running **gvisor-tap-vsock** binary with `-listen-ws`. The runtime connects via WebSocket and implements a lightweight userspace TCP/IP stack (Ethernet/ARP/IPv4/TCP) over the QEMU netdev protocol. Supports both **outbound `net.connect()`** and **inbound `server.listen()`** (with `-p host:guest` port forwarding on the binary). DNS resolves via **DNS-over-HTTPS** (Cloudflare). See `napi-bridge/gvisor-net.js`.

   Example: `./c2w-net -listen-ws -p 3000:3000 :8765` then set `NODEJS_GVISOR_WS_URL=ws://localhost:8765`.

   **b) Wisp (optional, AGPL):** Set **`globalThis.__NODE_TAB_WISP_TCP_CONNECT`** to an embedder-provided function that returns a Node-like duplex stream. Or set **`NODEJS_WISP_WS_URL`** to document intent; **`net.connect` / `tls.connect`** then throw a **clear error** until a client is registered. Upstream **`@mercuryworkshop/wisp-js`** is **AGPL-3.0** and not bundled.

## Anthropic browser traffic (`web/node-polyfills.js`)

Claude Code and related SDKs call **`api.anthropic.com`** / **`platform.claude.com`**. Browsers block reading those responses without **`Access-Control-Allow-Origin`**, so a **small HTTP proxy** you control (same-origin or CORS-enabled) is required for real sessions in-tab.

**In `web/node-polyfills.js`**, outbound `fetch` / `XMLHttpRequest` / tunneled **`WebSocket`** to those hosts can be rewritten to a **CORS proxy base URL** when one is configured:

1. Query parameter **`?proxy=<proxy-origin>`** on the **runtime page** (`web/index.html` or the GitHub Pages CLI iframe).
2. Or globals **`window.__V9_ANTHROPIC_FETCH_PROXY__`** or **`__V9_PAGES_ANTHROPIC_PROXY__`** (non-empty string), set from an inline script on the **landing** page before `docs/js/v9-app.js` loads — `resolveWebURL()` forwards **`proxy=`** into the iframe URL.
3. On **loopback** hostnames only (`localhost`, `127.0.0.1`, `::1`), the default **`http://localhost:8081`** matches the dev-server CORS stub. **`github.io` and other non-loopback hosts have no default** so the runtime does not rewrite traffic to localhost.

Reference worker: **`web/cors-proxy-worker.js`** (Cloudflare). For Pages, add your **`https://USER.github.io/REPO/`** origin to **`ALLOWED_ORIGINS`**, deploy the worker, and set **`__V9_ANTHROPIC_FETCH_PROXY__`** to the worker URL (or pass **`?proxy=`** on the site URL).

## OAuth / “localhost callback” in-tab

Node CLIs often start **`http.createServer`** on **`localhost:<port>`** and open a browser to an IdP that redirects back to that URL. In a real browser tab there is **no TCP listener** on the user’s machine for that port; the **`http`** module registers a **`FakeServer`** in **`globalThis.__browserRuntimeLocalHttpServers`** instead (see **`napi-bridge/http.js`**).

**Supported pattern**

1. **`FakeServer`** listens on a **chosen port** (registry key).
2. **`oauth-bridge.html`** (copied next to **`web/index.html`**) runs in a popup. Query params **`edge_callback_*`** tell it how to **`postMessage`** back to **`window.opener`** with **`type: 'edge-oauth-callback'`** (`port`, `path`, **`search`** OAuth params).
3. **`web/node-polyfills.js`** installs a **`message`** listener that dispatches the callback into **`server._handleRedirect`** for the matching port (when **`maybeRewriteOAuthUrl`** has rewritten **`redirect_uri`** to the bridge for a registered server).

For redirects that must be **world-reachable** (some IdPs require a public HTTPS URL), set **`NODEJS_IN_TAB_HTTP_RELAY`** / **`NODEJS_IN_TAB_HTTP_PUBLIC_BASE`** so **`FakeServer`** exposes a **`publicUrl`** (see **`napi-bridge/http.js`**). That is orthogonal to popup **`postMessage`** completion.

## Four-tier transport chain

v9 supports four transport tiers, probed in order of capability. Each tier
is independent — a deployment can enable any subset. The GitHub Pages demo
opts into tiers 2 and 3 via our hosted infra at `fetch.stare.network`;
self-hosted deployments get a clean slate by default and configure what
they need.

| Tier | What | Capability | Who runs the server |
|---|---|---|---|
| **1** | Local **v9-net** (gvisor-tap-vsock) via `ws://localhost:8765` | Full raw TCP, client + server sockets, all headers preserved | The developer, locally |
| **2** | Hosted **Wisp v1** tunnel over WebSocket | Full raw TCP (client only), all headers preserved | Someone you trust (or you) |
| **3** | Hosted **JSON fetch proxy** | HTTP(S) client only, full headers preserved | Someone you trust (or you) |
| **4** | **Direct browser `fetch()`** | HTTP(S) client only, browser-forbidden headers stripped, CORS required | No one — the browser itself |

Tier 1 and 2 are equivalent in capability; tier 1 is just local. Tier 3 is
a fallback for HTTP-only workloads when raw sockets aren't available. Tier
4 always works but is the most restricted.

## Configuration (for developers embedding v9)

The probe in `web/node-polyfills.js` resolves each tier's URL from this
precedence chain, highest wins:

1. **URL query param** — `?gvisor=`, `?wisp=`, `?fetchProxy=`
2. **Pre-set global** (set BEFORE `node-polyfills.js` loads):
   - `globalThis.__V9_GVISOR_WS_URL__`
   - `globalThis.__V9_WISP_WS_URL__`
   - `globalThis.__V9_FETCH_PROXY_URL__`
3. **Environment variable** (`process.env.*`, for host-mode):
   - `NODEJS_GVISOR_WS_URL`
   - `NODEJS_WISP_WS_URL`
   - `NODEJS_IN_TAB_FETCH_PROXY`
4. **Built-in default**: only tier 1 defaults to `ws://localhost:8765`.
   **Tier 2 and 3 have NO built-in hosted defaults.** Self-hosters get a
   clean slate — the probe will print `tier-2 wisp = (not configured)`
   and skip it unless the developer opts in explicitly.

### Self-hoster: configure your own hosted infra

If you're running your own Wisp server or fetch proxy, set the globals
before loading `node-polyfills.js`:

```html
<script>
  globalThis.__V9_WISP_WS_URL__ = 'wss://your-wisp.example.com/wisp/';
  globalThis.__V9_FETCH_PROXY_URL__ = 'https://your-proxy.example.com/proxy';
</script>
<script src="node-polyfills.js"></script>
```

Or at runtime:
```
https://your-app.example.com/?wisp=wss://your-wisp.example.com/wisp/
```

Or via env vars if you're running v9 on a host (not in a tab):
```bash
NODEJS_WISP_WS_URL=wss://your-wisp.example.com/wisp/ node your-app.js
```

### GitHub Pages demo: opts into `fetch.stare.network`

The file `web/transport-defaults-stare.js` sets the hosted defaults to
point at `fetch.stare.network`. It is hostname-guarded — activates only
on `*.github.io` or when `?enableStareTransport=1` is passed — so
self-hosters who fork the repo don't accidentally route traffic through
our shared infra.

### Env var reference

| Variable | Effect |
|----------|--------|
| **`NODEJS_GVISOR_WS_URL`** | Tier 1: WebSocket URL of a locally-running **gvisor-tap-vsock** binary (e.g. `ws://localhost:8765`). Full raw TCP via userspace TCP/IP stack. |
| **`NODEJS_WISP_WS_URL`** | Tier 2: WebSocket URL of a **Wisp v1** server. Used by `napi-bridge/wisp-client.js` for raw TCP through a remote multiplexed tunnel. |
| **`NODEJS_IN_TAB_FETCH_PROXY`** | Tier 3: HTTP(S) URL of a JSON fetch proxy. Payload: `{ url, init }` → `{ ok, status, statusText, headers, body64 }`. Use when CORS blocks direct calls. |
| **`NODEJS_HTTP_TRANSPORT`** | Real-Node-host-only: `fetch` forces `fetch()` for outbound HTTP. In-tab, transport is always policy-based. |

## Running the Wisp server yourself

v9 includes two production-ready implementations of the tier-2 Wisp server:

- **`cmd/wisp-server-node/`** — Node.js + Docker. Deploys to **AWS App Runner + CloudFront + WAF** (CDK stack included), Fargate, Fly.io, Railway, or any Docker host. Fully hardened: blocks RFC 1918, cloud metadata, SMTP ports; pre-resolves DNS to defeat rebinding; origin-checks; per-IP concurrent session limits; per-session bandwidth caps.
- **`cmd/wisp-worker/`** — Cloudflare Workers. Same hardening policy (minus per-IP limits, which need CF's native rate limiter). Minimal ops, scales automatically.

Both use the same Wisp v1 wire protocol and both read from a shared client
in `napi-bridge/wisp-client.js`.

## Detection rules

- **Tab vs Node:** `transport-policy.isNodeHost()` is `false` when `globalThis.document` exists, so in-tab **polyfilled `process.versions.node`** does not send `http.js` down the Node `CONNECT` proxy path.
- **`http.js`:** Uses **`document`** presence to choose **`browserHttpFetch`** vs Node stack.
- **`getRawSocketTransportMode()`**: returns `'gvisor'` if tier 1 is configured, `'wisp'` if tier 2 is configured, `'embedder'` if `__NODE_TAB_WISP_TCP_CONNECT` is set, else `'none'`.

## Related

- Roadmap and dual substrate: [`NODEJS_IN_TAB_ROADMAP.md`](NODEJS_IN_TAB_ROADMAP.md).
- **Unified contract (CI)** — Browser phase starts a localhost **in-tab fetch proxy** (`tests/helpers/in-tab-fetch-proxy.mjs`) and opens `web/nodejs-in-tab-contract.html?fetchProxy=...` so **httpbin** cases run under **COOP/COEP** without relying on third-party CORS/CORP from the renderer. There is no **`NODEJS_CONTRACT_OFFLINE`** skip gate; Wasm phase uses Node’s `fetch` for the same cases.
- Server-side **Wisp** relay (e.g. `wisp-server-python`) is **orthogonal**: wire it only after an optional **embedder** or **AGPL** client is hooked to `__NODE_TAB_WISP_TCP_CONNECT`.
