# Phase 4: Networking — Context

**Phase:** 4 of 6
**Depends on:** Phase 3 (Streams, Buffer, EventEmitter — all required for HTTP response handling)
**Unlocks:** Phase 6 (full Claude Code conversation requires API calls)
**Requirements covered:** NET-01 through NET-05 (5 requirements)
**Can run in parallel with:** Phase 5 (Subprocess Emulation) — both depend on Phase 3, not each other

## What This Phase Is

Phase 4 makes the runtime talk to the network. Claude Code calls the Anthropic API on every turn — without HTTPS and streaming SSE, it's a dead shell. This is the phase where the browser runtime becomes actually useful.

The architecture is simple: Node.js `http`/`https` modules are replaced with browser `fetch()`. Streaming responses use the browser's `ReadableStream` bridged to Node.js `Readable`. No raw TCP sockets, no TLS stack, no DNS resolution — the browser handles all of that.

## Architecture

```
Claude Code calls:
  const res = await fetch('https://api.anthropic.com/v1/messages', { ... })

Which internally does:
  require('https').request(options, callback)

Our override intercepts at the http/https module level:
  ┌─────────────────────────────────────────────┐
  │  http/https module override (browser-side)  │
  │  Translates Node.js http.request() into     │
  │  browser fetch() calls                      │
  ├─────────────────────────────────────────────┤
  │  Response body: browser ReadableStream      │
  │  → bridged to Node.js Readable (Phase 3)    │
  ├─────────────────────────────────────────────┤
  │  SSE parsing: split on \n\n, emit events    │
  │  (Anthropic API uses SSE for streaming)     │
  ├─────────────────────────────────────────────┤
  │  crypto: Web Crypto API for hashing/HMAC    │
  │  (already partially in browser-builtins.js) │
  └─────────────────────────────────────────────┘
```

## What We Already Have

From `napi-bridge/browser-builtins.js`:
- `cryptoBridge.createHash()` — SHA-1/256/384/512 via Web Crypto (async)
- `cryptoBridge.randomBytes()` — via `crypto.getRandomValues`
- `cryptoBridge.randomUUID()` — via `crypto.randomUUID`

**Gaps to close:**
- `createHash` is async but Node.js `createHash` is sync — needs sync wrapper or Anthropic SDK must handle async
- No `createHmac` (needed for SDK auth)
- No `http`/`https` module override
- No `ClientRequest`/`IncomingMessage` classes
- No streaming response body → Node.js Readable bridge
- No SSE parsing
- No `net`/`tls`/`dns` stubs (must not crash when imported)

## Key Constraint: Anthropic SDK

The Anthropic SDK (`@anthropic-ai/sdk`) uses:
1. `https.request()` or `fetch()` for API calls
2. Streaming via SSE (Server-Sent Events) with `text/event-stream` content type
3. `crypto.createHash('sha256')` for request signing (if applicable)
4. `crypto.createHmac('sha256', key)` for HMAC auth
5. Standard HTTP headers (Authorization, Content-Type, Accept)

The SDK may use `fetch()` directly in newer versions (check at implementation time). If it does, our job is much simpler — just ensure `globalThis.fetch` works (it does in browsers natively). The http/https override is only needed if the SDK uses Node.js `http.request()`.

## References

- Requirements: `.planning/REQUIREMENTS.md` (NET-01 through NET-05)
- Existing crypto: `napi-bridge/browser-builtins.js` (cryptoBridge)
- Streams: `napi-bridge/streams.js` (Readable, Transform — from Phase 3)
- Research: `.planning/research/ARCHITECTURE.md` (fetch-first networking)
