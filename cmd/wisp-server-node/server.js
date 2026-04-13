#!/usr/bin/env node
/**
 * Hardened Wisp v1 server for Node.js.
 *
 * Clean-room Wisp v1 implementation from the CC-BY-4.0 protocol spec at
 * https://github.com/MercuryWorkshop/wisp-protocol/blob/main/protocol.md.
 * No code is reproduced from wisp-js (which is AGPL).
 *
 * Runs on any Node.js host that can open outbound TCP: App Runner, Fargate,
 * EC2, Fly.io, Railway, bare metal, etc. Designed for small + cheap:
 * one process, no external state, no database, no shared memory.
 *
 * Anti-abuse: see guard.js. Hard-blocks private IPs, cloud metadata,
 * SMTP ports. Rate-limits per IP. Bandwidth-caps per session. Resolves
 * DNS before connect to prevent rebinding. Origin-checks WebSocket
 * upgrade requests.
 *
 * Protocol: Wisp v1.
 *   Every packet:
 *     uint8  type        offset 0
 *     uint32 stream_id   offsets 1..4, little-endian
 *     ...    payload     offsets 5..
 *   Types: 0x01 CONNECT, 0x02 DATA, 0x03 CONTINUE, 0x04 CLOSE.
 */

import { createServer as httpCreateServer } from 'node:http';
import { WebSocketServer } from 'ws';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import {
  resolveAndCheck,
  checkPort,
  isAllowedOrigin,
  tryAddSession,
  removeSession,
  getLimits,
  GuardError,
} from './guard.js';

// ─── Wisp v1 constants ────────────────────────────────────────────────

const PKT_CONNECT  = 0x01;
const PKT_DATA     = 0x02;
const PKT_CONTINUE = 0x03;
const PKT_CLOSE    = 0x04;
const STREAM_TYPE_TCP = 0x01;

const BUFFER_SIZE = 128; // DATA packets of credit per stream

// Close reasons (spec-aligned)
const CLOSE_REASON_VOLUNTARY    = 0x02;
const CLOSE_REASON_NETWORK_ERR  = 0x03;
const CLOSE_REASON_INVALID_INFO = 0x41;
const CLOSE_REASON_UNREACHABLE  = 0x42;
const CLOSE_REASON_REFUSED      = 0x43;
const CLOSE_REASON_TIMEOUT      = 0x47;
const CLOSE_REASON_BLOCKED      = 0x48;

// ─── Packet builders ──────────────────────────────────────────────────

function buildContinue(streamId, remaining) {
  const buf = Buffer.alloc(1 + 4 + 4);
  buf[0] = PKT_CONTINUE;
  buf.writeUInt32LE(streamId, 1);
  buf.writeUInt32LE(remaining, 5);
  return buf;
}

function buildData(streamId, data) {
  const buf = Buffer.alloc(1 + 4 + data.length);
  buf[0] = PKT_DATA;
  buf.writeUInt32LE(streamId, 1);
  data.copy ? data.copy(buf, 5) : buf.set(data, 5);
  return buf;
}

function buildClose(streamId, reason) {
  const buf = Buffer.alloc(1 + 4 + 1);
  buf[0] = PKT_CLOSE;
  buf.writeUInt32LE(streamId, 1);
  buf[5] = reason;
  return buf;
}

function parsePacket(bytes) {
  if (!bytes || bytes.length < 5) return null;
  return {
    type: bytes[0],
    streamId: bytes.readUInt32LE(1),
    payload: bytes.subarray(5),
  };
}

// ─── Structured logging ──────────────────────────────────────────────

function logEvent(event) {
  // Always JSON — CloudWatch, Stackdriver, and datadog all ingest this.
  try {
    process.stdout.write(JSON.stringify({ t: new Date().toISOString(), ...event }) + '\n');
  } catch { /* stdout may be closed */ }
}

// ─── Per-stream state ────────────────────────────────────────────────

class Stream {
  constructor(session, streamId, socket, destHost, destPort) {
    this.session = session;
    this.id = streamId;
    this.socket = socket;
    this.destHost = destHost;
    this.destPort = destPort;
    this.bytesUp = 0;
    this.bytesDown = 0;
    this.closed = false;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();

    // Wire socket → client DATA packets
    socket.on('data', (chunk) => {
      if (this.closed) return;
      this.bytesDown += chunk.length;
      this.lastActivity = Date.now();
      this.session._throttle(chunk.length).then(() => {
        if (this.closed) return;
        session._wsSend(buildData(this.id, chunk));
      });
    });
    socket.on('end', () => this._closeSelf(CLOSE_REASON_VOLUNTARY));
    socket.on('close', () => this._closeSelf(CLOSE_REASON_VOLUNTARY));
    socket.on('error', () => this._closeSelf(CLOSE_REASON_NETWORK_ERR));
  }

  writeUpstream(data) {
    if (this.closed) return;
    this.bytesUp += data.length;
    this.lastActivity = Date.now();
    try {
      this.socket.write(data);
    } catch {
      this._closeSelf(CLOSE_REASON_NETWORK_ERR);
    }
  }

  _closeSelf(reason) {
    if (this.closed) return;
    this.closed = true;
    try { this.socket.destroy(); } catch {}
    this.session._onStreamClosed(this);
    if (this.session.ws && this.session.ws.readyState === 1) {
      try { this.session.ws.send(buildClose(this.id, reason)); } catch {}
    }
    logEvent({
      type: 'stream_close',
      session: this.session.id,
      stream: this.id,
      dest: `${this.destHost}:${this.destPort}`,
      bytes_up: this.bytesUp,
      bytes_down: this.bytesDown,
      duration_ms: Date.now() - this.createdAt,
      reason,
    });
  }

  closeFromClient() {
    this.closed = true;
    try { this.socket.destroy(); } catch {}
  }
}

// ─── Per-session state (one per WebSocket) ───────────────────────────

class Session {
  constructor(ws, clientIp, origin) {
    this.id = randomBytes(6).toString('hex');
    this.ws = ws;
    this.clientIp = clientIp;
    this.origin = origin;
    /** @type {Map<number, Stream>} */
    this.streams = new Map();
    this.createdAt = Date.now();
    this.limits = getLimits();
    // Simple token-bucket for bandwidth throttling
    this._bwTokens = this.limits.bandwidthBps;
    this._bwLastRefill = Date.now();
    // Janitor for idle/lifetime timeouts
    this._janitor = setInterval(() => this._janitorTick(), 5000);
  }

  _wsSend(frame) {
    if (this.ws.readyState === 1) {
      try { this.ws.send(frame); } catch { /* socket gone */ }
    }
  }

  /**
   * Token-bucket throttle. Returns a promise that resolves when this many
   * bytes can be sent without exceeding the bandwidth cap. If the cap is
   * 0 (unlimited) the promise resolves immediately.
   */
  async _throttle(bytes) {
    if (this.limits.bandwidthBps === 0) return;
    // Refill
    const now = Date.now();
    const elapsed = (now - this._bwLastRefill) / 1000;
    this._bwTokens = Math.min(
      this.limits.bandwidthBps,
      this._bwTokens + Math.floor(elapsed * this.limits.bandwidthBps),
    );
    this._bwLastRefill = now;
    if (this._bwTokens >= bytes) {
      this._bwTokens -= bytes;
      return;
    }
    // Wait until enough tokens are available
    const deficit = bytes - this._bwTokens;
    const waitMs = Math.ceil((deficit / this.limits.bandwidthBps) * 1000);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    this._bwTokens = 0;
    this._bwLastRefill = Date.now();
  }

  async handlePacket(bytes) {
    const pkt = parsePacket(bytes);
    if (!pkt) return;

    if (pkt.type === PKT_CONNECT) {
      return this._handleConnect(pkt);
    }
    if (pkt.type === PKT_DATA) {
      const stream = this.streams.get(pkt.streamId);
      if (stream) stream.writeUpstream(pkt.payload);
      return;
    }
    if (pkt.type === PKT_CLOSE) {
      const stream = this.streams.get(pkt.streamId);
      if (stream) {
        stream.closeFromClient();
        this.streams.delete(pkt.streamId);
      }
      return;
    }
    // CONTINUE from client is unused server-side
  }

  async _handleConnect(pkt) {
    if (pkt.payload.length < 3) {
      this._wsSend(buildClose(pkt.streamId, CLOSE_REASON_INVALID_INFO));
      return;
    }
    const streamType = pkt.payload[0];
    const port = pkt.payload[1] | (pkt.payload[2] << 8);
    const host = pkt.payload.subarray(3).toString('utf8');

    if (streamType !== STREAM_TYPE_TCP) {
      // UDP not supported yet
      this._wsSend(buildClose(pkt.streamId, CLOSE_REASON_INVALID_INFO));
      return;
    }

    if (this.streams.size >= this.limits.maxStreamsPerSession) {
      this._wsSend(buildClose(pkt.streamId, CLOSE_REASON_BLOCKED));
      logEvent({ type: 'stream_limit', session: this.id, dest: `${host}:${port}` });
      return;
    }

    // Apply the guard: port first (cheap), then hostname resolution.
    try {
      checkPort(port);
    } catch (err) {
      this._wsSend(buildClose(pkt.streamId, CLOSE_REASON_BLOCKED));
      logEvent({ type: 'blocked', session: this.id, dest: `${host}:${port}`, reason: err.code });
      return;
    }

    let resolvedIp;
    try {
      resolvedIp = await resolveAndCheck(host);
    } catch (err) {
      const code = err instanceof GuardError ? err.code : 'unknown';
      this._wsSend(buildClose(pkt.streamId,
        code === 'dns_failure' ? CLOSE_REASON_UNREACHABLE : CLOSE_REASON_BLOCKED));
      logEvent({ type: 'blocked', session: this.id, dest: `${host}:${port}`, reason: code });
      return;
    }

    // Open the upstream TCP socket
    const socket = net.connect({ host: resolvedIp, port });
    const onFirstError = (err) => {
      this._wsSend(buildClose(pkt.streamId, CLOSE_REASON_REFUSED));
      logEvent({
        type: 'connect_error',
        session: this.id,
        dest: `${host}:${port}`,
        ip: resolvedIp,
        error: err?.code || err?.message || 'unknown',
      });
    };
    socket.once('error', onFirstError);
    socket.once('connect', () => {
      socket.removeListener('error', onFirstError);

      // Create stream state
      const stream = new Stream(this, pkt.streamId, socket, host, port);
      this.streams.set(pkt.streamId, stream);

      // Send initial CONTINUE for this stream
      this._wsSend(buildContinue(pkt.streamId, BUFFER_SIZE));

      logEvent({
        type: 'connect',
        session: this.id,
        stream: pkt.streamId,
        origin: this.origin || null,
        client_ip: this.clientIp,
        dest: `${host}:${port}`,
        resolved: resolvedIp,
      });
    });
  }

  _onStreamClosed(stream) {
    this.streams.delete(stream.id);
  }

  _janitorTick() {
    const now = Date.now();
    const { streamIdleMs, streamMaxLifetimeMs } = this.limits;
    for (const stream of this.streams.values()) {
      if (streamIdleMs > 0 && now - stream.lastActivity > streamIdleMs) {
        logEvent({ type: 'stream_idle_timeout', session: this.id, stream: stream.id });
        stream._closeSelf(CLOSE_REASON_TIMEOUT);
      } else if (streamMaxLifetimeMs > 0 && now - stream.createdAt > streamMaxLifetimeMs) {
        logEvent({ type: 'stream_lifetime_timeout', session: this.id, stream: stream.id });
        stream._closeSelf(CLOSE_REASON_TIMEOUT);
      }
    }
  }

  close() {
    clearInterval(this._janitor);
    for (const stream of this.streams.values()) stream.closeFromClient();
    this.streams.clear();
    removeSession(this.clientIp, this.id);
    logEvent({
      type: 'session_close',
      session: this.id,
      client_ip: this.clientIp,
      duration_ms: Date.now() - this.createdAt,
    });
  }
}

// ─── HTTP + WebSocket server ─────────────────────────────────────────

const PORT = Number(process.env.PORT) || 8080;

const httpServer = httpCreateServer((req, res) => {
  // Health check endpoints for load balancers
  if (req.url === '/' || req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    res.end('wisp-server-node ok\n');
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

const wss = new WebSocketServer({
  server: httpServer,
  path: '/wisp/',
  // Reject oversized frames — a single Wisp packet should never be huge
  maxPayload: 1 * 1024 * 1024,
  // Origin/allowlist check happens in verifyClient
  verifyClient: (info, done) => {
    const origin = info.req.headers.origin;
    if (!isAllowedOrigin(origin)) {
      logEvent({ type: 'origin_rejected', origin: origin || null });
      return done(false, 403, 'origin not allowed');
    }
    done(true);
  },
});

wss.on('connection', (ws, req) => {
  // Best-effort client IP (behind CloudFront/App Runner X-Forwarded-For)
  const xff = req.headers['x-forwarded-for'];
  const clientIp = (xff ? String(xff).split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';
  const origin = req.headers.origin || '';

  const sessionId = randomBytes(6).toString('hex');
  if (!tryAddSession(clientIp, sessionId)) {
    logEvent({ type: 'session_rejected_rate_limit', client_ip: clientIp });
    try {
      ws.close(1008, 'rate limit'); // 1008 = policy violation
    } catch {}
    return;
  }

  const session = new Session(ws, clientIp, origin);
  session.id = sessionId; // use the pre-generated id (already passed tryAddSession)
  logEvent({ type: 'session_open', session: sessionId, client_ip: clientIp, origin });

  // Send initial CONTINUE on stream 0 so the client knows its buffer size
  try { ws.send(buildContinue(0, BUFFER_SIZE)); } catch {}

  ws.on('message', (data, isBinary) => {
    if (!isBinary) return; // Wisp is binary-only
    const bytes = data instanceof Buffer ? data : Buffer.from(data);
    session.handlePacket(bytes).catch(() => { /* never throw to ws layer */ });
  });

  ws.on('close', () => session.close());
  ws.on('error', () => session.close());
});

// ─── Graceful shutdown ───────────────────────────────────────────────

function shutdown(signal) {
  logEvent({ type: 'server_shutdown', signal });
  wss.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ─── Start ───────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  logEvent({
    type: 'server_start',
    port: PORT,
    limits: getLimits(),
    node: process.version,
  });
});

// ─── Exports for tests ───────────────────────────────────────────────

export { buildContinue, buildData, buildClose, parsePacket, PKT_CONNECT, PKT_DATA, PKT_CLOSE, PKT_CONTINUE };
