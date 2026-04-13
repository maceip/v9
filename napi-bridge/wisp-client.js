/**
 * wisp-client.js — Clean-room Wisp v1 client for v9.
 *
 * Implements the Wisp v1 wire protocol so v9 can make TCP connections through
 * a hosted Wisp tunnel (wss://fetch.stare.network/wisp/ by default). Provides
 * a Node-compatible Duplex stream per TCP connection, matching the shape of
 * GvisorSocket so net-stubs.js can pick either transport transparently.
 *
 * PROTOCOL REFERENCE:
 *   https://github.com/MercuryWorkshop/wisp-protocol/blob/main/protocol.md
 *   (CC-BY-4.0 specification — this implementation is a clean-room re-write
 *    from the spec and does NOT reproduce any code from wisp-js which is AGPL.)
 *
 * WIRE FORMAT (Wisp v1, little-endian):
 *
 *   Every packet:
 *     uint8  type        offset 0
 *     uint32 stream_id   offset 1..4
 *     ...    payload     offset 5..
 *
 *   Packet types:
 *     0x01 CONNECT   client→server:
 *                      uint8  stream_type  (0x01=TCP, 0x02=UDP)
 *                      uint16 dest_port
 *                      utf8   dest_hostname (remaining bytes; no NUL)
 *     0x02 DATA      bidirectional: raw bytes
 *     0x03 CONTINUE  server→client (for a stream):
 *                      uint32 buffer_remaining (packets the client may send)
 *     0x04 CLOSE     bidirectional:
 *                      uint8  reason
 *
 *   Stream IDs are chosen by the client, starting at 1 and incrementing.
 *   stream_id = 0 is reserved for control (connection-wide CONTINUE / CLOSE).
 *
 *   Flow control: the server sends an initial CONTINUE on stream_id=0 with
 *   the per-stream buffer size. Each DATA packet sent by the client consumes
 *   one slot; when the slot count reaches zero the client must wait for a
 *   CONTINUE on the stream before sending more DATA. CONTINUE gives the new
 *   absolute remaining-buffer count, not a delta.
 *
 *   Framing: each Wisp packet is exactly one binary WebSocket message.
 *   No additional length prefix is needed — WebSocket provides message framing.
 */

import { Duplex } from './streams.js';

// ─── Packet types ─────────────────────────────────────────────────────

const PKT_CONNECT  = 0x01;
const PKT_DATA     = 0x02;
const PKT_CONTINUE = 0x03;
const PKT_CLOSE    = 0x04;

const STREAM_TYPE_TCP = 0x01;
const STREAM_TYPE_UDP = 0x02;

// Default buffer size if we never see a CONTINUE on stream 0 (defensive).
const DEFAULT_INITIAL_BUFFER = 128;

const _textEncoder = new TextEncoder();

// ─── Packet encoding ──────────────────────────────────────────────────

/**
 * Build a CONNECT packet.
 * @param {number} streamId
 * @param {string} host
 * @param {number} port
 * @param {number} [streamType=STREAM_TYPE_TCP]
 * @returns {Uint8Array}
 */
function buildConnect(streamId, host, port, streamType = STREAM_TYPE_TCP) {
  const hostBytes = _textEncoder.encode(host);
  const buf = new Uint8Array(1 + 4 + 1 + 2 + hostBytes.length);
  const dv = new DataView(buf.buffer);
  buf[0] = PKT_CONNECT;
  dv.setUint32(1, streamId, true);
  buf[5] = streamType;
  dv.setUint16(6, port, true);
  buf.set(hostBytes, 8);
  return buf;
}

/**
 * Build a DATA packet wrapping the given payload.
 * @param {number} streamId
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
function buildData(streamId, data) {
  const buf = new Uint8Array(1 + 4 + data.length);
  const dv = new DataView(buf.buffer);
  buf[0] = PKT_DATA;
  dv.setUint32(1, streamId, true);
  buf.set(data, 5);
  return buf;
}

/**
 * Build a CLOSE packet.
 * @param {number} streamId
 * @param {number} [reason=0x02] — 0x02 = voluntary close
 * @returns {Uint8Array}
 */
function buildClose(streamId, reason = 0x02) {
  const buf = new Uint8Array(1 + 4 + 1);
  const dv = new DataView(buf.buffer);
  buf[0] = PKT_CLOSE;
  dv.setUint32(1, streamId, true);
  buf[5] = reason;
  return buf;
}

/**
 * Parse a Wisp packet from a Uint8Array.
 * @param {Uint8Array} bytes
 * @returns {{type: number, streamId: number, payload: Uint8Array} | null}
 */
function parsePacket(bytes) {
  if (bytes.length < 5) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    type: bytes[0],
    streamId: dv.getUint32(1, true),
    payload: bytes.subarray(5),
  };
}

// ─── Connection state ─────────────────────────────────────────────────

/**
 * A single multiplexed Wisp connection to a server. One WebSocket,
 * many TCP streams over it.
 */
class WispConnection {
  /**
   * @param {string} url - wss://host/wisp/ URL
   */
  constructor(url) {
    this._url = url;
    /** @type {WebSocket | null} */
    this._ws = null;
    /** @type {Map<number, WispStream>} */
    this._streams = new Map();
    this._nextStreamId = 1;
    /** initial buffer size announced by server on stream 0 CONTINUE */
    this._initialBuffer = DEFAULT_INITIAL_BUFFER;
    this._openPromise = null;
    this._closed = false;
  }

  /**
   * Ensure the WebSocket is open. Returns a promise that resolves once the
   * control-stream CONTINUE has been seen (so we know _initialBuffer).
   * @returns {Promise<void>}
   */
  async open() {
    if (this._openPromise) return this._openPromise;
    this._openPromise = new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this._url);
        ws.binaryType = 'arraybuffer';
        this._ws = ws;

        let resolved = false;
        const onReady = () => {
          if (resolved) return;
          resolved = true;
          resolve();
        };
        const onFail = (err) => {
          if (resolved) return;
          resolved = true;
          reject(err instanceof Error ? err : new Error('Wisp WebSocket error'));
        };

        ws.addEventListener('open', () => {
          // Wait up to 2s for the initial CONTINUE on stream 0. If the server
          // never sends one, fall through with the default buffer.
          setTimeout(onReady, 2000);
        });
        ws.addEventListener('message', (e) => this._onMessage(e.data, onReady));
        ws.addEventListener('error', (e) => onFail(e));
        ws.addEventListener('close', () => {
          this._closed = true;
          for (const stream of this._streams.values()) {
            stream._onRemoteClose(0x03); // 0x03 = connection error
          }
          this._streams.clear();
        });
      } catch (err) {
        reject(err);
      }
    });
    return this._openPromise;
  }

  /**
   * Handle an incoming WebSocket binary message.
   * @param {ArrayBuffer} data
   * @param {function} onControlContinue - called when stream-0 CONTINUE arrives
   */
  _onMessage(data, onControlContinue) {
    if (!(data instanceof ArrayBuffer)) return;
    const bytes = new Uint8Array(data);
    const pkt = parsePacket(bytes);
    if (!pkt) return;

    // Control stream (id 0)
    if (pkt.streamId === 0) {
      if (pkt.type === PKT_CONTINUE && pkt.payload.length >= 4) {
        const dv = new DataView(pkt.payload.buffer, pkt.payload.byteOffset, pkt.payload.byteLength);
        this._initialBuffer = dv.getUint32(0, true);
        if (onControlContinue) onControlContinue();
      }
      // Control CLOSE is handled as WS close
      return;
    }

    // Per-stream packets
    const stream = this._streams.get(pkt.streamId);
    if (!stream) return;

    if (pkt.type === PKT_DATA) {
      stream._onRemoteData(pkt.payload);
    } else if (pkt.type === PKT_CONTINUE && pkt.payload.length >= 4) {
      const dv = new DataView(pkt.payload.buffer, pkt.payload.byteOffset, pkt.payload.byteLength);
      const remaining = dv.getUint32(0, true);
      stream._onCredit(remaining);
    } else if (pkt.type === PKT_CLOSE) {
      const reason = pkt.payload.length > 0 ? pkt.payload[0] : 0;
      stream._onRemoteClose(reason);
      this._streams.delete(pkt.streamId);
    }
  }

  /**
   * Send a raw packet on the underlying WebSocket.
   * @param {Uint8Array} packet
   */
  _send(packet) {
    if (!this._ws || this._ws.readyState !== 1) {
      throw new Error('Wisp connection not open');
    }
    this._ws.send(packet);
  }

  /**
   * Open a new TCP stream through this Wisp connection.
   * @param {string} host
   * @param {number} port
   * @returns {Promise<WispStream>}
   */
  async connectTcp(host, port) {
    await this.open();
    if (this._closed) throw new Error('Wisp connection closed');

    const streamId = this._nextStreamId++;
    const stream = new WispStream(this, streamId, this._initialBuffer);
    this._streams.set(streamId, stream);

    this._send(buildConnect(streamId, host, port, STREAM_TYPE_TCP));
    return stream;
  }

  close() {
    this._closed = true;
    if (this._ws) {
      try { this._ws.close(); } catch {}
    }
  }
}

// ─── WispStream: Duplex wrapping one TCP stream ───────────────────────

/**
 * A single multiplexed TCP stream. Exposes a Node-shaped Duplex interface
 * so it can plug into v9's net-stubs.js in place of a GvisorSocket.
 */
class WispStream extends Duplex {
  constructor(conn, streamId, initialBuffer) {
    super({ allowHalfOpen: false });
    this._conn = conn;
    this._streamId = streamId;
    /** remaining DATA packets we may send before the server sends CONTINUE */
    this._credit = initialBuffer;
    /** queue of pending chunks waiting on credit */
    this._sendQueue = [];
    /** callback waiting for drain */
    this._pendingWriteCallback = null;
    this._closed = false;

    // Node-net-ish properties
    this.connecting = false;  // Wisp treats CONNECT as fire-and-forget
    this.pending = false;
    this.bytesRead = 0;
    this.bytesWritten = 0;
    this._destroyed = false;
  }

  // ─── Duplex _read / _write ──────────────────────────────────────

  _read(_size) {
    // Incoming data is pushed via _onRemoteData
  }

  _write(chunk, encoding, callback) {
    if (this._closed || this._destroyed) {
      callback(new Error('Stream closed'));
      return;
    }
    if (typeof chunk === 'string') chunk = _textEncoder.encode(chunk);
    else if (!(chunk instanceof Uint8Array)) chunk = new Uint8Array(chunk.buffer || chunk);

    this.bytesWritten += chunk.length;
    this._sendQueue.push({ data: chunk, cb: callback });
    this._drainSendQueue();
  }

  _final(callback) {
    this._sendCloseAndCleanup(0x02);
    callback();
  }

  _destroy(err, callback) {
    this._destroyed = true;
    if (!this._closed) this._sendCloseAndCleanup(0x02);
    callback(err);
  }

  // ─── Credit-based flow control ──────────────────────────────────

  _drainSendQueue() {
    while (this._sendQueue.length > 0 && this._credit > 0) {
      const { data, cb } = this._sendQueue.shift();
      try {
        this._conn._send(buildData(this._streamId, data));
        this._credit--;
        cb();
      } catch (err) {
        cb(err);
      }
    }
  }

  /** Called by WispConnection when a CONTINUE packet arrives for this stream */
  _onCredit(remaining) {
    this._credit = remaining;
    this._drainSendQueue();
  }

  /** Called by WispConnection when a DATA packet arrives for this stream */
  _onRemoteData(data) {
    this.bytesRead += data.length;
    this.push(data);
  }

  /** Called by WispConnection when a CLOSE packet arrives for this stream */
  _onRemoteClose(reason) {
    if (this._closed) return;
    this._closed = true;
    this.push(null); // signal EOF to readers
    if (reason !== 0x02) {
      // Non-voluntary close: surface as an error
      this.emit('error', new Error(`Wisp stream closed (reason 0x${reason.toString(16)})`));
    }
  }

  _sendCloseAndCleanup(reason) {
    if (this._closed) return;
    this._closed = true;
    try {
      this._conn._send(buildClose(this._streamId, reason));
    } catch { /* WS already gone */ }
    this._conn._streams.delete(this._streamId);
  }

  // ─── Socket-ish accessors used by net-stubs.js ──────────────────

  get remoteAddress() { return this._remoteAddress || ''; }
  get remotePort() { return this._remotePort || 0; }
  get remoteFamily() { return 'IPv4'; }
  get localAddress() { return '0.0.0.0'; }
  get localPort() { return 0; }
  get readyState() {
    if (this._closed || this._destroyed) return 'closed';
    return 'open';
  }

  // Compat stubs for the Socket shim
  setKeepAlive() { return this; }
  setNoDelay() { return this; }
  setTimeout() { return this; }
  ref() { return this; }
  unref() { return this; }
  address() {
    return { address: this.localAddress, port: this.localPort, family: this.remoteFamily };
  }
}

// ─── Singleton + public API ───────────────────────────────────────────

const _env = () => (typeof globalThis.process !== 'undefined' && globalThis.process?.env) || {};

/** @type {WispConnection | null} */
let _sharedConn = null;

function _getWispUrl() {
  const url = _env().NODEJS_WISP_WS_URL || globalThis.__V9_WISP_WS_URL__;
  if (!url || url === '' || url === '0') return null;
  return String(url);
}

/**
 * True if an environment variable points at a Wisp server.
 * (The actual reachability was determined by the transport probe at boot.)
 */
export function isWispAvailable() {
  return _getWispUrl() !== null;
}

/**
 * Open a TCP stream to host:port via the configured Wisp server.
 *
 * @param {string} host
 * @param {number} port
 * @returns {Promise<WispStream>}
 */
export async function wispConnect(host, port) {
  const url = _getWispUrl();
  if (!url) throw new Error('NODEJS_WISP_WS_URL not set — no Wisp server configured');

  if (!_sharedConn || _sharedConn._closed) {
    _sharedConn = new WispConnection(url);
  }

  const stream = await _sharedConn.connectTcp(host, port);
  stream._remoteAddress = host;
  stream._remotePort = port;
  return stream;
}

// Exports for tests
export {
  WispConnection,
  WispStream,
  buildConnect,
  buildData,
  buildClose,
  parsePacket,
  PKT_CONNECT,
  PKT_DATA,
  PKT_CONTINUE,
  PKT_CLOSE,
  STREAM_TYPE_TCP,
};
