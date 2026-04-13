/**
 * wisp-worker — Hardened Wisp v1 server running on Cloudflare Workers.
 *
 * Deploys to wss://<your-domain>/wisp/ and bridges browser-originated Wisp
 * streams to real outbound TCP using Cloudflare's `cloudflare:sockets` API.
 *
 * PROTOCOL REFERENCE:
 *   https://github.com/MercuryWorkshop/wisp-protocol/blob/main/protocol.md
 *   (CC-BY-4.0 specification — this is a clean-room implementation that does
 *    NOT reproduce code from wisp-js which is AGPL.)
 *
 * ANTI-ABUSE:
 *   See guard.js. Blocks RFC 1918 / cloud metadata / SMTP ports by default,
 *   resolves hostnames via DoH before connect to defeat DNS rebinding, and
 *   checks the Origin header against ORIGIN_ALLOWLIST.
 *
 * DEPLOYMENT:
 *   cd cmd/wisp-worker
 *   npx wrangler deploy
 *
 *   Configure via wrangler.toml [vars]:
 *     ORIGIN_ALLOWLIST       = "https://maceip.github.io,https://example.com"
 *     MAX_STREAMS_PER_SESSION = "32"
 *     EXTRA_BLOCKED_PORTS    = "9000,9001"
 *
 *   For per-IP rate limiting in production, add a [[unsafe.bindings]] rate
 *   limit binding (Cloudflare Workers Rate Limiting API) and check it in
 *   fetch() before accepting the WebSocket upgrade.
 *
 * LIMITATIONS:
 *   - Cloudflare Workers connect() is TCP-only — UDP streams return error.
 *   - One Worker invocation per WebSocket; no cross-invocation state.
 *   - Per-IP limits require CF's native rate limiter (this file doesn't ship
 *     one to keep the Worker simple). Pair with wrangler.toml bindings.
 */

import { connect } from 'cloudflare:sockets';
import {
  resolveAndCheck,
  checkPort,
  isAllowedOrigin,
  getLimits,
  GuardError,
} from './guard.js';

// ─── Wisp v1 constants ────────────────────────────────────────────────

const PKT_CONNECT  = 0x01;
const PKT_DATA     = 0x02;
const PKT_CONTINUE = 0x03;
const PKT_CLOSE    = 0x04;

const STREAM_TYPE_TCP = 0x01;
const STREAM_TYPE_UDP = 0x02;

// Per-stream buffer credit. The client may send this many DATA packets
// without waiting for a CONTINUE.
const BUFFER_SIZE = 128;

// ─── Packet builders ──────────────────────────────────────────────────

function buildContinue(streamId, remaining) {
  const buf = new Uint8Array(1 + 4 + 4);
  const dv = new DataView(buf.buffer);
  buf[0] = PKT_CONTINUE;
  dv.setUint32(1, streamId, true);
  dv.setUint32(5, remaining, true);
  return buf;
}

function buildData(streamId, data) {
  const buf = new Uint8Array(1 + 4 + data.length);
  const dv = new DataView(buf.buffer);
  buf[0] = PKT_DATA;
  dv.setUint32(1, streamId, true);
  buf.set(data, 5);
  return buf;
}

function buildClose(streamId, reason) {
  const buf = new Uint8Array(1 + 4 + 1);
  const dv = new DataView(buf.buffer);
  buf[0] = PKT_CLOSE;
  dv.setUint32(1, streamId, true);
  buf[5] = reason;
  return buf;
}

function parsePacket(bytes) {
  if (bytes.length < 5) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    type: bytes[0],
    streamId: dv.getUint32(1, true),
    payload: bytes.subarray(5),
  };
}

// ─── Per-stream state ─────────────────────────────────────────────────

/**
 * A live Wisp stream bridged to a real Cloudflare connect() socket.
 */
class Stream {
  constructor(ws, streamId, socket) {
    this.ws = ws;
    this.streamId = streamId;
    this.socket = socket;
    this.writer = socket.writable.getWriter();
    this.reader = socket.readable.getReader();
    this.closed = false;
    // Start the reader pump: server→client data flow
    this._pumpReads();
  }

  async _pumpReads() {
    try {
      while (!this.closed) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value && value.length > 0) {
          if (this.ws.readyState === 1) {
            this.ws.send(buildData(this.streamId, new Uint8Array(value)));
          }
        }
      }
    } catch (err) {
      // Upstream error — close the stream
    } finally {
      this._closeSelf(0x03); // 0x03 = unexpected
    }
  }

  async writeUpstream(data) {
    if (this.closed) return;
    try {
      await this.writer.write(data);
    } catch (err) {
      this._closeSelf(0x03);
    }
  }

  _closeSelf(reason) {
    if (this.closed) return;
    this.closed = true;
    try { this.writer.releaseLock(); } catch {}
    try { this.reader.releaseLock(); } catch {}
    try { this.socket.close(); } catch {}
    if (this.ws.readyState === 1) {
      try { this.ws.send(buildClose(this.streamId, reason)); } catch {}
    }
  }

  closeFromClient() {
    this.closed = true;
    try { this.writer.releaseLock(); } catch {}
    try { this.reader.releaseLock(); } catch {}
    try { this.socket.close(); } catch {}
  }
}

// ─── Per-WebSocket session ────────────────────────────────────────────

/**
 * Handles one browser WebSocket, multiplexing many Wisp streams over it.
 */
function handleSession(ws, env, clientInfo) {
  /** @type {Map<number, Stream>} */
  const streams = new Map();
  const limits = getLimits(env);
  const sessionId = crypto.randomUUID().slice(0, 8);

  ws.accept();

  console.log(JSON.stringify({
    type: 'session_open',
    session: sessionId,
    client_ip: clientInfo.ip,
    origin: clientInfo.origin,
  }));

  // Send initial CONTINUE on stream 0 with the per-stream buffer size.
  try {
    ws.send(buildContinue(0, BUFFER_SIZE));
  } catch {}

  ws.addEventListener('message', async (event) => {
    let bytes;
    if (event.data instanceof ArrayBuffer) {
      bytes = new Uint8Array(event.data);
    } else if (event.data instanceof Uint8Array) {
      bytes = event.data;
    } else {
      // Ignore text frames
      return;
    }
    const pkt = parsePacket(bytes);
    if (!pkt) return;

    if (pkt.type === PKT_CONNECT) {
      await handleConnect(ws, streams, pkt, env, sessionId, limits);
    } else if (pkt.type === PKT_DATA) {
      const stream = streams.get(pkt.streamId);
      if (stream) await stream.writeUpstream(pkt.payload);
    } else if (pkt.type === PKT_CLOSE) {
      const stream = streams.get(pkt.streamId);
      if (stream) {
        stream.closeFromClient();
        streams.delete(pkt.streamId);
      }
    }
  });

  ws.addEventListener('close', () => {
    for (const stream of streams.values()) stream.closeFromClient();
    streams.clear();
    console.log(JSON.stringify({ type: 'session_close', session: sessionId }));
  });

  ws.addEventListener('error', () => {
    for (const stream of streams.values()) stream.closeFromClient();
    streams.clear();
  });
}

/**
 * Handle a Wisp CONNECT packet. Runs through the guard, opens a real TCP
 * socket via cloudflare:sockets, and wires both ends.
 */
async function handleConnect(ws, streams, pkt, env, sessionId, limits) {
  if (pkt.payload.length < 3) {
    try { ws.send(buildClose(pkt.streamId, 0x41)); } catch {}
    return;
  }
  const streamType = pkt.payload[0];
  const port = (pkt.payload[1] | (pkt.payload[2] << 8));
  const host = new TextDecoder().decode(pkt.payload.subarray(3));

  if (streamType !== STREAM_TYPE_TCP) {
    try { ws.send(buildClose(pkt.streamId, 0x42)); } catch {}
    return;
  }

  if (streams.size >= limits.maxStreamsPerSession) {
    console.log(JSON.stringify({ type: 'stream_limit', session: sessionId, dest: `${host}:${port}` }));
    try { ws.send(buildClose(pkt.streamId, 0x48)); } catch {}
    return;
  }

  // Run the guard — port check first (cheap), then hostname resolution.
  try {
    checkPort(port, env);
  } catch (err) {
    console.log(JSON.stringify({ type: 'blocked', session: sessionId, dest: `${host}:${port}`, reason: err.code }));
    try { ws.send(buildClose(pkt.streamId, 0x48)); } catch {}
    return;
  }

  let resolvedIp;
  try {
    resolvedIp = await resolveAndCheck(host);
  } catch (err) {
    const code = err instanceof GuardError ? err.code : 'unknown';
    console.log(JSON.stringify({ type: 'blocked', session: sessionId, dest: `${host}:${port}`, reason: code }));
    try {
      ws.send(buildClose(pkt.streamId, code === 'dns_failure' ? 0x42 : 0x48));
    } catch {}
    return;
  }

  try {
    const socket = connect({ hostname: resolvedIp, port });
    await socket.opened;
    const stream = new Stream(ws, pkt.streamId, socket);
    streams.set(pkt.streamId, stream);

    try { ws.send(buildContinue(pkt.streamId, BUFFER_SIZE)); } catch {}

    console.log(JSON.stringify({
      type: 'connect',
      session: sessionId,
      stream: pkt.streamId,
      dest: `${host}:${port}`,
      resolved: resolvedIp,
    }));
  } catch (err) {
    console.log(JSON.stringify({
      type: 'connect_error',
      session: sessionId,
      dest: `${host}:${port}`,
      error: String(err?.message || err),
    }));
    try { ws.send(buildClose(pkt.streamId, 0x43)); } catch {}
  }
}

// ─── Worker entry ─────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('wisp-worker ok\n', {
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Only /wisp/ takes WebSocket upgrades
    if (url.pathname !== '/wisp' && url.pathname !== '/wisp/') {
      return new Response('not found', { status: 404 });
    }

    // Require WebSocket upgrade
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected WebSocket upgrade', { status: 426 });
    }

    // Origin check (runs BEFORE accepting the upgrade)
    const origin = request.headers.get('Origin') || '';
    if (!isAllowedOrigin(origin, env)) {
      console.log(JSON.stringify({ type: 'origin_rejected', origin }));
      return new Response('origin not allowed', { status: 403 });
    }

    // OPTIONAL AUTH HOOK: uncomment to add a shared-secret check.
    //   const token = url.searchParams.get('token');
    //   if (!token || token !== env.WISP_SECRET) {
    //     return new Response('forbidden', { status: 403 });
    //   }

    // Get the client IP (Cloudflare sets this header on every request)
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Create the WebSocket pair
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    handleSession(server, env, { ip: clientIp, origin });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  },
};
