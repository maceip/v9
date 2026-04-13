# wisp-worker

A minimal Wisp v1 server that runs on Cloudflare Workers and bridges browser
Wisp streams to real outbound TCP via `cloudflare:sockets`.

This is the hosted backend for v9's **tier-2 transport** — when a user doesn't
have `v9-net` running locally, the browser can still make raw TCP connections
by tunneling through this Worker.

## Protocol

Implements Wisp v1 from the
[CC-BY-4.0 specification](https://github.com/MercuryWorkshop/wisp-protocol/blob/main/protocol.md).
This is a clean-room implementation — no code is copied from `wisp-js`
(which is AGPL). Both the client (`napi-bridge/wisp-client.js`) and this
server were written purely from the spec.

The wire format is trivially simple — every packet is:

```
uint8  type        (CONNECT=0x01, DATA=0x02, CONTINUE=0x03, CLOSE=0x04)
uint32 stream_id   (little-endian, 0 = connection control)
...    payload
```

Stream multiplexing is credit-based: the server advertises a buffer size via
a CONTINUE on stream 0 at connect time, and decrements per DATA packet. When
the client's credit reaches zero it waits for a per-stream CONTINUE.

## Deployment

```bash
# 1. Install wrangler
npm install -g wrangler

# 2. Deploy this directory
cd cmd/wisp-worker
wrangler deploy

# 3. Point v9 at your Worker
open 'https://maceip.github.io/v9/?wisp=wss://your-worker.workers.dev/wisp/'
```

No database, no secrets, no persistent state. Every TCP stream is a
fresh `connect()` call.

## Adding authentication

The Worker ships with zero auth. For public deployment you probably want
to gate access by URL-path shared secret or a signed token. Browsers can't
set the `Authorization` header on a `WebSocket`, so the common pattern is
to put the token in the URL.

Example (in `worker.js`'s `fetch`):

```js
const token = url.searchParams.get('token');
if (token !== env.WISP_SECRET) {
  return new Response('forbidden', { status: 403 });
}
```

Then set `WISP_SECRET` via `wrangler secret put WISP_SECRET`.

## Limitations

- **TCP only** — Cloudflare `connect()` is TCP. UDP Wisp streams return error.
- **Single Worker instance per WebSocket** — no cross-instance state. Each
  browser tab gets its own Worker invocation.
- **Fixed buffer** — 128 packets per stream. Enough for most HTTP/HTTPS
  workloads; large file transfers will pause briefly on credit exhaustion.
- **No binding** — client-side `net.createServer()` / `server.listen()` is
  not supported. Only outbound connections. For server sockets, use the
  local `v9-net` binary (tier 1).
