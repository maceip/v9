# wisp-server-node

Hardened Wisp v1 server for Node.js. This is the hosted tier-2 transport
that lets v9 running in a browser tab make real outbound TCP connections
without the user running any local binary.

## Why a container, not CloudFront Functions / Lambda@Edge

v9's architecture needs a long-lived WebSocket connection so the browser
can multiplex many TCP streams over one WS. None of AWS's "edge compute"
products support WebSocket servers:

| Service | WebSocket support | Can hold TCP state | Verdict |
|---|---|---|---|
| **CloudFront Functions** | no | no | request/response only, 1ms budget |
| **Lambda@Edge** | no | no | HTTP request/response only |
| **API Gateway WebSocket + Lambda** | yes (gateway) | **no** (per-message Lambda) | state must live in DynamoDB, ~50x the cost |
| **App Runner** | yes | yes | ✓ simplest fit |
| **Fargate** | yes | yes | ✓ works, always-on |
| **EC2** | yes | yes | ✓ cheapest, manual ops |

**The correct AWS architecture** is a container running a real Node.js
WebSocket server, fronted by CloudFront + WAF for TLS/DDoS/rate-limiting.
This directory provides:

- A minimal hardened Node.js Wisp server (`server.js`, `guard.js`)
- A Dockerfile for container deployment
- An AWS CDK stack for App Runner + CloudFront + WAF (`infra/cdk.ts`)

The server will run on **any Node.js host** — you can also deploy it to
Fly.io, Railway, Fargate, a DigitalOcean droplet, or your laptop.

## Anti-abuse protection

The server enforces all of the following on every connection — no opt-out
at runtime, only at deploy time via environment variables.

### Hard-blocked destinations

**IP blocklist** (`guard.js`):
- RFC 1918 private ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
- Loopback: `127.0.0.0/8`, `::1`
- **Link-local: `169.254.0.0/16`** — this covers AWS/Azure/GCP metadata service at `169.254.169.254`
- IPv6 ULA: `fc00::/7`
- Link-local IPv6: `fe80::/10`
- Multicast, broadcast, unspecified
- IETF reserved ranges (TEST-NET-1, TEST-NET-2, TEST-NET-3)

Hostnames are **resolved server-side before connect()** — DNS rebinding
attacks (where a hostname resolves to a private IP) are caught.

**Port blocklist**:
- **SMTP: 25, 465, 587** — the primary open-relay abuse vector
- Telnet 23
- IRC 6667, 6697
- Add more via `WISP_EXTRA_BLOCKED_PORTS` env var

### Soft limits (all configurable via env)

| Env var | Default | Purpose |
|---|---|---|
| `WISP_MAX_STREAMS_PER_SESSION` | 32 | Concurrent TCP streams per WebSocket |
| `WISP_MAX_SESSIONS_PER_IP` | 10 | Concurrent WebSocket sessions per client IP |
| `WISP_BANDWIDTH_BPS` | 10485760 (10 MB/s) | Per-session bandwidth cap (0 = unlimited) |
| `WISP_STREAM_IDLE_MS` | 60000 | Idle timeout per stream |
| `WISP_STREAM_MAX_LIFETIME_MS` | 1800000 (30 min) | Max lifetime per stream |
| `WISP_ORIGIN_ALLOWLIST` | `https://maceip.github.io` | Allowed WebSocket Origin headers |

### Origin check

WebSocket upgrade requests are rejected unless the `Origin` header is in
the allowlist. Localhost/loopback origins are always allowed for dev work.
Set `WISP_ORIGIN_ALLOWLIST=*` to disable the origin check (not recommended
for public deployment).

### Abuse logging

Every CONNECT, CLOSE, and blocked attempt is logged as a single line of
JSON to stdout. CloudWatch (App Runner's default log destination) ingests
this natively. Fields include: timestamp, session id, client IP, origin,
destination host+port, bytes sent/received, duration, block reason.

## Deploy to AWS

**First time (one-time bootstrap):**

```bash
cd cmd/wisp-server-node/infra
npm install
npx cdk bootstrap        # once per AWS account/region
npx cdk deploy           # creates ECR + App Runner + CloudFront + WAF
```

**Build and push the image:**

```bash
cd cmd/wisp-server-node
./build-and-push.sh
# Then re-deploy to pick up the new image
aws apprunner start-deployment --service-arn \
  $(aws apprunner list-services --query "ServiceSummaryList[?ServiceName=='wisp-server'].ServiceArn | [0]" --output text)
```

**Custom domain (optional):**

Set `WISP_DOMAIN_NAME=fetch.stare.network` before `cdk deploy`. The CDK
stack will create an ACM cert in us-east-1. After deploy, look at the
`CustomDomain` stack output and create a CNAME from your DNS to the
CloudFront distribution domain name.

**Cost estimate** (idle → light use):
- App Runner 0.25 vCPU / 0.5 GB: ~$5–15/mo
- CloudFront: free for first 1 TB/month
- WAF: ~$5/mo base + $1/rule + $0.60/million requests
- ECR: ~$0.10/mo for a few image versions

## Deploy elsewhere

The container is standard Docker and runs anywhere:

```bash
docker build -t wisp-server cmd/wisp-server-node
docker run -p 8080:8080 \
  -e WISP_ORIGIN_ALLOWLIST=https://your-site.example \
  wisp-server
```

For **Fly.io**:
```bash
cd cmd/wisp-server-node
fly launch
fly deploy
```

For **Railway** / **Render** / **Koyeb**: point at the Dockerfile,
set env vars in their UI, done.

## Run locally for testing

```bash
cd cmd/wisp-server-node
npm install
node server.js
```

Then test it from v9's browser page:

```
http://localhost:8080/health   # should return "wisp-server-node ok"

# v9 tab:
http://localhost:8080/v9/?wisp=ws://localhost:8080/wisp/
```

## Unit tests

The hardening policy has its own test suite, run from the repo root:

```bash
node tests/test-wisp-server-guard.mjs
```

Covers every IP blocklist rule, port blocklist, DNS rebinding, origin
allowlist, and per-IP session limits. 52 tests.

## Security notes

- The server runs as a non-root user inside the container.
- The container only exposes port 8080.
- No secrets are baked into the image; everything is env vars at runtime.
- `WISP_DISABLE_PRIVATE_IP_BLOCK=1` exists for **private local testing
  only** and **must not** be set on any public deployment. Without it, the
  server will happily connect to 169.254.169.254 and leak cloud metadata.
- If you add more allowed ports, think about whether they can be used for
  abuse. SSH (22) is fine for tunneling to your own infra but is a common
  brute-force target.
