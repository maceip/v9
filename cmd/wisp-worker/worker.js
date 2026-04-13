/**
 * wisp-worker — A minimal Wisp v1 server running on Cloudflare Workers.
 *
 * Deploys to wss://<your-domain>/wisp/ and bridges browser-originated Wisp
 * streams to real outbound TCP using Cloudflare's `cloudflare:sockets` API.
 *
 * PROTOCOL REFERENCE:
 *   https://github.com/MercuryWorkshop/wisp-protocol/blob/main/protocol.md
 *   (CC-BY-4.0 specification — this is a clean-room implementation that does
 *    NOT reproduce code from wisp-js which is AGPL.)
 *
 * DEPLOYMENT:
 *   1. npm create cloudflare@latest wisp-worker
 *      (choose: Hello World worker, TypeScript No, git No)
 *   2. Copy this file over src/index.js
 *   3. Add "node_compat = true" or "compatibility_flags = [\"nodejs_compat\"]" to wrangler.toml
 *   4. npx wrangler deploy
 *   5. Point v9 at wss://<your-worker>.workers.dev/wisp/ via ?wisp= or env
 *
 * LIMITATIONS:
 *   - Cloudflare Workers connect() is TCP-only (no UDP) — UDP streams return error.
 *   - One Worker instance per WebSocket; no cross-worker state.
 *   - Buffer size fixed at 128 packets per stream (reasonable for most workloads).
 *
 * SECURITY:
 *   - No authentication by default. For public deployment, add a URL-path
 *     shared secret or signed token check in fetch(). Browsers can't set
 *     WebSocket Authorization headers.
 */

import { connect } from 'cloudflare:sockets';

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
function handleSession(ws) {
  /** @type {Map<number, Stream>} */
  const streams = new Map();

  ws.accept();

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
      await handleConnect(ws, streams, pkt);
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
    // CONTINUE is unused server-side (we don't rate-limit ingress from server)
  });

  ws.addEventListener('close', () => {
    for (const stream of streams.values()) stream.closeFromClient();
    streams.clear();
  });

  ws.addEventListener('error', () => {
    for (const stream of streams.values()) stream.closeFromClient();
    streams.clear();
  });
}

/**
 * Handle a Wisp CONNECT packet by opening a real TCP socket via
 * cloudflare:sockets and wiring both ends.
 */
async function handleConnect(ws, streams, pkt) {
  if (pkt.payload.length < 3) {
    try { ws.send(buildClose(pkt.streamId, 0x41)); } catch {}
    return;
  }
  const streamType = pkt.payload[0];
  const port = (pkt.payload[1] | (pkt.payload[2] << 8)); // little-endian
  const hostBytes = pkt.payload.subarray(3);
  const host = new TextDecoder().decode(hostBytes);

  if (streamType !== STREAM_TYPE_TCP) {
    // UDP not supported on CF Workers
    try { ws.send(buildClose(pkt.streamId, 0x42)); } catch {}
    return;
  }

  try {
    const socket = connect({ hostname: host, port });
    // Wait for the socket to be ready
    await socket.opened;
    const stream = new Stream(ws, pkt.streamId, socket);
    streams.set(pkt.streamId, stream);

    // Give the new stream its initial credit
    try { ws.send(buildContinue(pkt.streamId, BUFFER_SIZE)); } catch {}
  } catch (err) {
    // Connect failed — tell the client
    try { ws.send(buildClose(pkt.streamId, 0x43)); } catch {}
  }
}

// ─── Worker entry ─────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Simple health check
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

    // OPTIONAL AUTH: check URL path shared secret, signed token, etc.
    // Example:
    //   const token = url.searchParams.get('token');
    //   if (!verifyToken(token, env.WISP_SECRET)) {
    //     return new Response('forbidden', { status: 403 });
    //   }

    // Create a WebSocket pair: one end to the client, one for us to handle
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  },
};
