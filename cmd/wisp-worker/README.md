# wisp-worker

Hardened Wisp v1 server that runs on Cloudflare Workers. This is an
alternative to `cmd/wisp-server-node/` for the tier-2 hosted transport —
choose this one if you prefer CF Workers, choose the other if you prefer
AWS or any other container host.

## Protocol

Clean-room implementation of Wisp v1 from the
[CC-BY-4.0 specification](https://github.com/MercuryWorkshop/wisp-protocol/blob/main/protocol.md).
No code from `wisp-js` (which is AGPL) is reproduced.

Wire format:
```
uint8  type        (CONNECT=0x01, DATA=0x02, CONTINUE=0x03, CLOSE=0x04)
uint32 stream_id   (little-endian, 0 = connection control)
...    payload
```

## Anti-abuse protection

See `guard.js`. Same policy as `cmd/wisp-server-node/guard.js`, adapted for
the Workers runtime (no `node:net`/`node:dns`):

**Hard blocks** (destination):
- RFC 1918 private ranges, loopback, link-local (covers AWS/GCP/Azure
  metadata at `169.254.169.254`), IPv6 ULA, multicast
- SMTP ports: 25, 465, 587
- Telnet 23, IRC 6667/6697
- Extra ports via `EXTRA_BLOCKED_PORTS` env var

**Hostname pre-resolve** defeats DNS rebinding:
- Resolves via DNS-over-HTTPS to `1.1.1.1/dns-query`
- If ANY returned address is in a blocked range, the connection is rejected

**Origin check**:
- WebSocket upgrades are rejected unless the `Origin` header matches
  `ORIGIN_ALLOWLIST` (default `https://maceip.github.io`)
- `localhost` / `127.*` origins always allowed (dev)
- Set `ORIGIN_ALLOWLIST=*` to disable (not recommended for public deployment)

**Per-IP rate limiting**: not implemented in this file because Workers are
ephemeral (no shared state). Use Cloudflare's native Rate Limiting binding —
there's a commented example in `wrangler.toml`.

**Structured logging**: every CONNECT/CLOSE/blocked attempt is logged as a
single line of JSON to the Worker log. Viewable via `wrangler tail`.

## Deploy

```bash
cd cmd/wisp-worker
npx wrangler deploy
```

Configure via `wrangler.toml [vars]` section:

```toml
[vars]
ORIGIN_ALLOWLIST = "https://maceip.github.io"
MAX_STREAMS_PER_SESSION = "32"
EXTRA_BLOCKED_PORTS = ""
```

After deploy, your Wisp endpoint is at:
```
wss://wisp-worker.<your-subdomain>.workers.dev/wisp/
```

Point v9 at it:
```
https://maceip.github.io/v9/?wisp=wss://wisp-worker.<your-subdomain>.workers.dev/wisp/
```

## Custom domain

Add a CNAME in the Cloudflare dashboard or via `wrangler.toml routes`. The
Worker can serve at any path as long as it ends in `/wisp/` or `/wisp`.

## Authentication

Zero auth by default. For public deployment you probably want a shared
secret in the URL path (browsers can't set `Authorization` headers on
WebSocket upgrade):

```js
// Uncomment in worker.js fetch():
const token = url.searchParams.get('token');
if (!token || token !== env.WISP_SECRET) {
  return new Response('forbidden', { status: 403 });
}
```

Then set the secret:
```bash
wrangler secret put WISP_SECRET
```

## Limitations

- **TCP only** — CF Workers `connect()` is TCP only. UDP streams are rejected.
- **One invocation per WebSocket** — no cross-invocation state.
- **Per-IP limits require the native rate limiter** — see wrangler.toml.

## Testing locally

```bash
cd cmd/wisp-worker
npx wrangler dev
```

Run the unit tests from the repo root (tests the pure policy logic — doesn't
hit the network):

```bash
node tests/test-wisp-worker-guard.mjs
```
