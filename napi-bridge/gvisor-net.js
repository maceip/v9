/**
 * gvisor-net.js — Lightweight userspace TCP/IP over gvisor-tap-vsock WebSocket.
 *
 * Connects to a locally-running gvisor-tap-vsock binary (with -listen-ws) and
 * implements enough Ethernet/ARP/IPv4/TCP to support net.connect() and
 * server.listen() from the browser.
 *
 * Binary provides virtual network 192.168.127.0/24:
 *   Gateway  192.168.127.1   (MAC 5a:94:ef:e4:0c:dd, DNS)
 *   VM       192.168.127.3   (MAC 02:00:00:00:00:01)
 *   NAT      192.168.127.254 → 127.0.0.1
 *
 * Env: NODEJS_GVISOR_WS_URL (e.g. ws://localhost:8765)
 */

import { EventEmitter } from './eventemitter.js';

// ─── Constants ──────────────────────────────────────────────────────

const VM_IP  = [192, 168, 127, 3];
const VM_MAC = [0x02, 0x00, 0x00, 0x00, 0x00, 0x01];
const GW_IP  = [192, 168, 127, 1];
const GW_MAC = [0x5a, 0x94, 0xef, 0xe4, 0x0c, 0xdd];
const BCAST  = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

const ETH_IP4 = 0x0800;
const ETH_ARP = 0x0806;
const ARP_REQ = 1;
const ARP_REP = 2;
const PROTO_TCP = 6;

const FIN = 0x01, SYN = 0x02, RST = 0x04, PSH = 0x08, ACK = 0x10;
const WIN = 65535;
const MSS_VAL = 1460;

const S_CLOSED = 0, S_LISTEN = 1, S_SYN_SENT = 2, S_SYN_RCVD = 3,
      S_ESTABLISHED = 4, S_FIN_WAIT1 = 5, S_FIN_WAIT2 = 6,
      S_CLOSING = 7, S_TIME_WAIT = 8, S_CLOSE_WAIT = 9, S_LAST_ACK = 10;

// ─── Helpers ────────────────────────────────────────────────────────

const _env = () => (typeof globalThis.process !== 'undefined' && globalThis.process?.env) || {};
const ip2a = s => s.split('.').map(Number);
const a2ip = a => `${a[0]}.${a[1]}.${a[2]}.${a[3]}`;
const ip2u32 = a => ((a[0] << 24) | (a[1] << 16) | (a[2] << 8) | a[3]) >>> 0;

function cksum(data, off, len) {
  off = off || 0;
  len = len != null ? len : data.length - off;
  let sum = 0;
  const end = off + len;
  for (let i = off; i < end - 1; i += 2) sum += (data[i] << 8) | data[i + 1];
  if (len & 1) sum += data[end - 1] << 8;
  while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  return (~sum) & 0xffff;
}

function tcpCk(sip, dip, seg) {
  const n = 12 + seg.length;
  const b = new Uint8Array(n + (n & 1));
  b.set(sip, 0); b.set(dip, 4);
  b[9] = PROTO_TCP;
  b[10] = (seg.length >>> 8) & 0xff; b[11] = seg.length & 0xff;
  b.set(seg, 12);
  return cksum(b, 0, b.length);
}

function macEq(a, b) {
  for (let i = 0; i < 6; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ─── Packet builders ────────────────────────────────────────────────

function ethFrame(dst, src, type, payload) {
  const f = new Uint8Array(14 + payload.length);
  f.set(dst, 0); f.set(src, 6);
  f[12] = (type >>> 8) & 0xff; f[13] = type & 0xff;
  f.set(payload, 14);
  return f;
}

function arpPkt(op, sMac, sIp, tMac, tIp) {
  const p = new Uint8Array(28);
  const d = new DataView(p.buffer);
  d.setUint16(0, 1); d.setUint16(2, 0x0800);
  p[4] = 6; p[5] = 4; d.setUint16(6, op);
  p.set(sMac, 8); p.set(sIp, 14);
  p.set(tMac, 18); p.set(tIp, 24);
  return p;
}

function ipPkt(sIp, dIp, proto, payload) {
  const len = 20 + payload.length;
  const p = new Uint8Array(len);
  p[0] = 0x45; // v4, IHL=5
  p[2] = (len >>> 8) & 0xff; p[3] = len & 0xff;
  const id = (Math.random() * 0xffff) >>> 0;
  p[4] = (id >>> 8) & 0xff; p[5] = id & 0xff;
  p[6] = 0x40; // DF
  p[8] = 64; // TTL
  p[9] = proto;
  p.set(sIp, 12); p.set(dIp, 16);
  const hc = cksum(p, 0, 20);
  p[10] = (hc >>> 8) & 0xff; p[11] = hc & 0xff;
  p.set(payload, 20);
  return p;
}

function tcpSeg(sPort, dPort, seq, ackN, flags, win, payload, opts) {
  const optLen = opts ? opts.length : 0;
  const padded = Math.ceil(optLen / 4) * 4;
  const dataOff = 5 + padded / 4;
  const hdrLen = dataOff * 4;
  const seg = new Uint8Array(hdrLen + payload.length);
  const d = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
  d.setUint16(0, sPort); d.setUint16(2, dPort);
  d.setUint32(4, seq); d.setUint32(8, ackN);
  seg[12] = dataOff << 4;
  seg[13] = flags;
  d.setUint16(14, win);
  if (opts) seg.set(opts, 20);
  if (payload.length) seg.set(payload, hdrLen);
  return seg;
}

function mssOpt(v) { return new Uint8Array([2, 4, (v >>> 8) & 0xff, v & 0xff]); }

// ─── Packet parsers ─────────────────────────────────────────────────

function parseEth(f) {
  if (f.length < 14) return null;
  return { dst: f.slice(0, 6), src: f.slice(6, 12),
    type: (f[12] << 8) | f[13], payload: f.slice(14) };
}

function parseArp(d) {
  if (d.length < 28) return null;
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  return { op: v.getUint16(6), sMac: d.slice(8, 14), sIp: d.slice(14, 18),
    tMac: d.slice(18, 24), tIp: d.slice(24, 28) };
}

function parseIp(d) {
  if (d.length < 20) return null;
  const ihl = (d[0] & 0x0f) * 4;
  return { ihl, proto: d[9], src: d.slice(12, 16), dst: d.slice(16, 20),
    payload: d.slice(ihl) };
}

function parseTcp(d) {
  if (d.length < 20) return null;
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const off = (d[12] >>> 4) * 4;
  return { sPort: v.getUint16(0), dPort: v.getUint16(2),
    seq: v.getUint32(4), ack: v.getUint32(8), off, flags: d[13],
    win: v.getUint16(14), payload: d.slice(off) };
}

// ─── DNS via DoH ────────────────────────────────────────────────────

const _dnsCache = new Map();

export async function resolveDns(hostname) {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return hostname;
  const c = _dnsCache.get(hostname);
  if (c && c.exp > Date.now()) return c.ip;
  const r = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
    { headers: { Accept: 'application/dns-json' } },
  );
  const j = await r.json();
  const ans = j.Answer?.find(a => a.type === 1);
  if (!ans?.data) throw new Error(`DNS failed: ${hostname}`);
  _dnsCache.set(hostname, { ip: ans.data, exp: Date.now() + (ans.TTL || 300) * 1000 });
  return ans.data;
}


// ─── NetworkStack ───────────────────────────────────────────────────

let _stack = null;

class NetworkStack {
  constructor(wsUrl) {
    this._wsUrl = wsUrl;
    this._ws = null;
    this._ready = false;
    this._readyCbs = [];
    this._conns = new Map();     // "lPort:rIp:rPort" → TcpConn
    this._listeners = new Map(); // port → GvisorServer
    this._nextPort = 49152;
    this._arp = new Map();
    this._recvBuf = new Uint8Array(0);
    this._recvState = 'len';
    this._recvFrameLen = 0;

    this._arp.set(a2ip(GW_IP), new Uint8Array(GW_MAC));
    this._connect();
  }

  _connect() {
    const WS = globalThis.__browserRuntimeNativeWebSocket || globalThis.WebSocket;
    const ws = new WS(this._wsUrl);
    ws.binaryType = 'arraybuffer';
    this._ws = ws;

    ws.onopen = () => {
      this._ready = true;
      this._sendGratuitousArp();
      for (const cb of this._readyCbs) cb();
      this._readyCbs = [];
    };
    ws.onmessage = (ev) => {
      this._onWsData(new Uint8Array(ev.data));
    };
    ws.onclose = () => {
      this._ready = false;
      for (const c of this._conns.values()) c._onError(new Error('gvisor WS closed'));
    };
    ws.onerror = () => { this._ready = false; };
  }

  _whenReady(cb) {
    if (this._ready) { cb(); return; }
    this._readyCbs.push(cb);
  }

  _allocPort() {
    for (let i = 0; i < 16384; i++) {
      const p = this._nextPort++;
      if (this._nextPort > 65535) this._nextPort = 49152;
      if (!this._conns.has(p) && !this._listeners.has(p)) return p;
    }
    throw new Error('No ephemeral ports');
  }

  _connKey(lp, rip, rp) { return `${lp}:${rip}:${rp}`; }

  _sendFrame(ef) {
    if (!this._ready || !this._ws) return;
    const buf = new Uint8Array(4 + ef.length);
    new DataView(buf.buffer).setUint32(0, ef.length);
    buf.set(ef, 4);
    this._ws.send(buf.buffer);
  }

  _sendGratuitousArp() {
    const p = arpPkt(ARP_REQ, new Uint8Array(VM_MAC), new Uint8Array(VM_IP),
      new Uint8Array([0, 0, 0, 0, 0, 0]), new Uint8Array(VM_IP));
    this._sendFrame(ethFrame(new Uint8Array(BCAST), new Uint8Array(VM_MAC), ETH_ARP, p));
  }

  // Buffer incoming WS data and parse QEMU frames
  _onWsData(data) {
    const nb = new Uint8Array(this._recvBuf.length + data.length);
    nb.set(this._recvBuf); nb.set(data, this._recvBuf.length);
    this._recvBuf = nb;
    this._parseFrames();
  }

  _parseFrames() {
    while (true) {
      if (this._recvState === 'len') {
        if (this._recvBuf.length < 4) return;
        this._recvFrameLen = new DataView(
          this._recvBuf.buffer, this._recvBuf.byteOffset, 4).getUint32(0);
        this._recvBuf = this._recvBuf.slice(4);
        this._recvState = 'data';
      }
      if (this._recvState === 'data') {
        if (this._recvBuf.length < this._recvFrameLen) return;
        const frame = this._recvBuf.slice(0, this._recvFrameLen);
        this._recvBuf = this._recvBuf.slice(this._recvFrameLen);
        this._recvState = 'len';
        this._handleEth(frame);
      }
    }
  }

  _handleEth(frame) {
    const e = parseEth(frame);
    if (!e) return;
    if (!macEq(e.dst, VM_MAC) && !macEq(e.dst, BCAST)) return;
    if (e.type === ETH_ARP) this._handleArp(e.payload);
    else if (e.type === ETH_IP4) this._handleIp(e.payload);
  }

  _handleArp(data) {
    const a = parseArp(data);
    if (!a) return;
    this._arp.set(a2ip(Array.from(a.sIp)), new Uint8Array(a.sMac));
    if (a.op === ARP_REQ && a2ip(Array.from(a.tIp)) === a2ip(VM_IP)) {
      const rep = arpPkt(ARP_REP, new Uint8Array(VM_MAC), new Uint8Array(VM_IP), a.sMac, a.sIp);
      this._sendFrame(ethFrame(a.sMac, new Uint8Array(VM_MAC), ETH_ARP, rep));
    }
  }

  _handleIp(data) {
    const ip = parseIp(data);
    if (!ip || a2ip(Array.from(ip.dst)) !== a2ip(VM_IP)) return;
    if (ip.proto === PROTO_TCP) this._handleTcp(ip);
  }

  _handleTcp(ip) {
    const t = parseTcp(ip.payload);
    if (!t) return;
    const rip = a2ip(Array.from(ip.src));
    const key = this._connKey(t.dPort, rip, t.sPort);

    // Existing connection
    const conn = this._conns.get(key);
    if (conn) { conn._handleSeg(t, ip.src); return; }

    // New SYN → listener
    if ((t.flags & SYN) && !(t.flags & ACK)) {
      const srv = this._listeners.get(t.dPort);
      if (srv) {
        const nc = new TcpConn(this, t.dPort, rip, t.sPort);
        nc._state = S_SYN_RCVD;
        nc._recvNxt = (t.seq + 1) >>> 0;
        nc._sendNxt = (Math.random() * 0xffffffff) >>> 0;
        nc._sendUna = nc._sendNxt;
        this._conns.set(key, nc);
        nc._sendSynAck();
        return;
      }
    }

    // RST for unmatched
    if (!(t.flags & RST)) this._sendRst(ip.src, t.sPort, t.dPort, t.seq, t.ack, t.flags);
  }

  _sendRst(rIpArr, rPort, lPort, theirSeq, theirAck, theirFlags) {
    let seq, ackN, flags;
    if (theirFlags & ACK) { seq = theirAck; ackN = 0; flags = RST; }
    else { seq = 0; ackN = (theirSeq + 1) >>> 0; flags = RST | ACK; }
    const seg = tcpSeg(lPort, rPort, seq, ackN, flags, 0, new Uint8Array(0));
    const cs = tcpCk(new Uint8Array(VM_IP), new Uint8Array(rIpArr), seg);
    seg[16] = (cs >>> 8) & 0xff; seg[17] = cs & 0xff;
    const ip = ipPkt(new Uint8Array(VM_IP), new Uint8Array(rIpArr), PROTO_TCP, seg);
    const dm = this._arp.get(a2ip(Array.from(rIpArr))) || new Uint8Array(GW_MAC);
    this._sendFrame(ethFrame(dm, new Uint8Array(VM_MAC), ETH_IP4, ip));
  }

  _dstMac(rIp) {
    const ru = ip2u32(ip2a(rIp));
    const vu = ip2u32(VM_IP);
    if ((ru & 0xffffff00) === (vu & 0xffffff00)) {
      const c = this._arp.get(rIp);
      if (c) return c;
    }
    return new Uint8Array(GW_MAC);
  }
}


// ─── TcpConn ────────────────────────────────────────────────────────

class TcpConn {
  constructor(stack, lPort, rIp, rPort) {
    this._stack = stack;
    this._lPort = lPort;
    this._rIp = rIp;
    this._rPort = rPort;
    this._rIpArr = ip2a(rIp);
    this._state = S_CLOSED;
    this._sendNxt = 0;
    this._sendUna = 0;
    this._recvNxt = 0;
    this._sendBuf = [];
    this._socket = null;
    this._rtxTimer = null;
    this._rtxCount = 0;
    this._rtxSeg = null;
  }

  _handleSeg(t, srcArr) {
    switch (this._state) {
      case S_SYN_SENT:
        if ((t.flags & SYN) && (t.flags & ACK)) {
          if (t.ack !== this._sendNxt) { this._sendRstSeg(); return; }
          this._recvNxt = (t.seq + 1) >>> 0;
          this._sendUna = t.ack;
          this._state = S_ESTABLISHED;
          this._clearRtx();
          this._txAck();
          this._socket?._onConnect();
          this._flush();
        } else if (t.flags & RST) {
          this._state = S_CLOSED;
          this._socket?._onError(new Error('Connection refused'));
          this._cleanup();
        }
        break;

      case S_SYN_RCVD:
        if (t.flags & ACK) {
          this._sendUna = t.ack;
          this._state = S_ESTABLISHED;
          this._clearRtx();
          const srv = this._stack._listeners.get(this._lPort);
          if (srv) srv._onConnection(this);
        } else if (t.flags & RST) {
          this._state = S_CLOSED; this._cleanup();
        }
        break;

      case S_ESTABLISHED:
        if (t.flags & RST) {
          this._state = S_CLOSED;
          this._socket?._onError(new Error('Connection reset'));
          this._cleanup(); return;
        }
        if (t.flags & ACK) this._sendUna = t.ack;
        if (t.payload.length > 0 && t.seq === this._recvNxt) {
          this._recvNxt = (this._recvNxt + t.payload.length) >>> 0;
          this._txAck();
          this._socket?._onData(t.payload);
        }
        if (t.flags & FIN) {
          this._recvNxt = (this._recvNxt + 1) >>> 0;
          this._state = S_CLOSE_WAIT;
          this._txAck();
          this._socket?._onEnd();
        }
        break;

      case S_FIN_WAIT1:
        if (t.flags & ACK) {
          this._sendUna = t.ack;
          if (t.flags & FIN) {
            this._recvNxt = (t.seq + 1) >>> 0;
            this._state = S_TIME_WAIT;
            this._txAck();
            this._socket?._onEnd();
            this._startTW();
          } else {
            this._state = S_FIN_WAIT2;
            this._clearRtx();
          }
        }
        if (t.payload.length > 0 && t.seq === this._recvNxt) {
          this._recvNxt = (this._recvNxt + t.payload.length) >>> 0;
          this._socket?._onData(t.payload);
          this._txAck();
        }
        break;

      case S_FIN_WAIT2:
        if (t.payload.length > 0 && t.seq === this._recvNxt) {
          this._recvNxt = (this._recvNxt + t.payload.length) >>> 0;
          this._socket?._onData(t.payload);
          this._txAck();
        }
        if (t.flags & FIN) {
          this._recvNxt = (t.seq + (t.payload.length || 0) + 1) >>> 0;
          this._state = S_TIME_WAIT;
          this._txAck();
          this._socket?._onEnd();
          this._startTW();
        }
        break;

      case S_CLOSE_WAIT:
        if (t.flags & ACK) this._sendUna = t.ack;
        break;

      case S_LAST_ACK:
        if (t.flags & ACK) { this._state = S_CLOSED; this._cleanup(); }
        break;

      case S_TIME_WAIT:
        if (t.flags & FIN) this._txAck();
        break;
    }
  }

  _txSeg(seg) {
    seg[16] = 0; seg[17] = 0; // zero checksum before compute
    const cs = tcpCk(new Uint8Array(VM_IP), new Uint8Array(this._rIpArr), seg);
    seg[16] = (cs >>> 8) & 0xff; seg[17] = cs & 0xff;
    const ip = ipPkt(new Uint8Array(VM_IP), new Uint8Array(this._rIpArr), PROTO_TCP, seg);
    const dm = this._stack._dstMac(this._rIp);
    this._stack._sendFrame(ethFrame(dm, new Uint8Array(VM_MAC), ETH_IP4, ip));
  }

  _sendSyn() {
    this._sendNxt = (Math.random() * 0xffffffff) >>> 0;
    this._sendUna = this._sendNxt;
    const seg = tcpSeg(this._lPort, this._rPort, this._sendNxt, 0, SYN, WIN,
      new Uint8Array(0), mssOpt(MSS_VAL));
    this._sendNxt = (this._sendNxt + 1) >>> 0;
    this._txSeg(seg);
    this._state = S_SYN_SENT;
    this._startRtx(seg);
  }

  _sendSynAck() {
    const seg = tcpSeg(this._lPort, this._rPort, this._sendNxt, this._recvNxt,
      SYN | ACK, WIN, new Uint8Array(0), mssOpt(MSS_VAL));
    this._sendNxt = (this._sendNxt + 1) >>> 0;
    this._txSeg(seg);
    this._startRtx(seg);
  }

  _txAck() {
    const seg = tcpSeg(this._lPort, this._rPort, this._sendNxt, this._recvNxt,
      ACK, WIN, new Uint8Array(0));
    this._txSeg(seg);
  }

  _txData(data) {
    if (this._state !== S_ESTABLISHED) return;
    for (let off = 0; off < data.length; off += MSS_VAL) {
      const chunk = data.slice(off, Math.min(off + MSS_VAL, data.length));
      const last = off + MSS_VAL >= data.length;
      const seg = tcpSeg(this._lPort, this._rPort, this._sendNxt, this._recvNxt,
        ACK | (last ? PSH : 0), WIN, chunk);
      this._sendNxt = (this._sendNxt + chunk.length) >>> 0;
      this._txSeg(seg);
    }
  }

  _txFin() {
    const seg = tcpSeg(this._lPort, this._rPort, this._sendNxt, this._recvNxt,
      FIN | ACK, WIN, new Uint8Array(0));
    this._sendNxt = (this._sendNxt + 1) >>> 0;
    this._txSeg(seg);
    this._startRtx(seg);
  }

  _sendRstSeg() {
    const seg = tcpSeg(this._lPort, this._rPort, this._sendNxt, this._recvNxt,
      RST | ACK, 0, new Uint8Array(0));
    this._txSeg(seg);
    this._state = S_CLOSED;
    this._cleanup();
  }

  _startRtx(seg) {
    this._clearRtx();
    this._rtxSeg = new Uint8Array(seg);
    this._rtxCount = 0;
    this._rtxTimer = setTimeout(() => this._retransmit(), 1000);
  }

  _retransmit() {
    if (this._rtxCount >= 5) {
      this._socket?._onError(new Error('Connection timed out'));
      this._state = S_CLOSED; this._cleanup(); return;
    }
    if (this._rtxSeg) {
      this._txSeg(new Uint8Array(this._rtxSeg));
      this._rtxCount++;
      this._rtxTimer = setTimeout(() => this._retransmit(),
        1000 * Math.pow(2, this._rtxCount));
    }
  }

  _clearRtx() {
    if (this._rtxTimer) { clearTimeout(this._rtxTimer); this._rtxTimer = null; }
    this._rtxSeg = null; this._rtxCount = 0;
  }

  _startTW() {
    setTimeout(() => { this._state = S_CLOSED; this._cleanup(); }, 2000);
  }

  _cleanup() {
    this._clearRtx();
    const key = this._stack._connKey(this._lPort, this._rIp, this._rPort);
    this._stack._conns.delete(key);
  }

  _flush() {
    while (this._sendBuf.length && this._state === S_ESTABLISHED) {
      this._txData(this._sendBuf.shift());
    }
  }

  _onError(err) { this._socket?._onError(err); }

  write(data) {
    if (this._state === S_ESTABLISHED) this._txData(data);
    else if (this._state === S_SYN_SENT || this._state === S_SYN_RCVD)
      this._sendBuf.push(data);
    else throw new Error('Not writable');
  }

  close() {
    if (this._state === S_ESTABLISHED) { this._txFin(); this._state = S_FIN_WAIT1; }
    else if (this._state === S_CLOSE_WAIT) { this._txFin(); this._state = S_LAST_ACK; }
  }

  destroy() {
    if (this._state !== S_CLOSED) {
      this._sendRstSeg();
    }
  }
}


// ─── GvisorSocket ───────────────────────────────────────────────────

export class GvisorSocket extends EventEmitter {
  constructor(conn) {
    super();
    this._conn = conn;
    this._encoding = null;
    this._destroyed = false;
    this.readable = true;
    this.writable = true;
    this.connecting = true;
    if (conn) conn._socket = this;
  }

  get remoteAddress() { return this._conn?._rIp; }
  get remotePort() { return this._conn?._rPort; }
  get localAddress() { return a2ip(VM_IP); }
  get localPort() { return this._conn?._lPort; }

  connect(portOrOpts, hostOrCb, cb) {
    let port, host, callback;
    if (typeof portOrOpts === 'object') {
      port = portOrOpts.port;
      host = portOrOpts.host || portOrOpts.hostname || '127.0.0.1';
      callback = typeof hostOrCb === 'function' ? hostOrCb : cb;
    } else {
      port = portOrOpts;
      host = typeof hostOrCb === 'string' ? hostOrCb : '127.0.0.1';
      callback = typeof hostOrCb === 'function' ? hostOrCb : cb;
    }
    if (callback) this.once('connect', callback);

    resolveDns(host).then(resolved => {
      const stack = getGvisorStack();
      const lPort = stack._allocPort();
      // Remap localhost → NAT loopback (192.168.127.254 → host 127.0.0.1)
      const rIp = (resolved === '127.0.0.1' || resolved === '::1')
        ? '192.168.127.254' : resolved;
      this._conn = new TcpConn(stack, lPort, rIp, port);
      this._conn._socket = this;
      const key = stack._connKey(lPort, rIp, port);
      stack._conns.set(key, this._conn);
      stack._whenReady(() => this._conn._sendSyn());
    }).catch(err => {
      this.emit('error', err);
      queueMicrotask(() => this.emit('close', true));
    });
    return this;
  }

  write(data, encoding, cb) {
    if (typeof encoding === 'function') { cb = encoding; encoding = null; }
    if (typeof data === 'string') data = new TextEncoder().encode(data);
    else if (data instanceof ArrayBuffer) data = new Uint8Array(data);
    else if (!(data instanceof Uint8Array)) data = new Uint8Array(data.buffer || data);
    try {
      this._conn.write(data);
      if (cb) queueMicrotask(cb);
      return true;
    } catch (err) {
      this.emit('error', err);
      return false;
    }
  }

  end(data, encoding, cb) {
    if (typeof data === 'function') { cb = data; data = null; }
    if (typeof encoding === 'function') { cb = encoding; encoding = null; }
    if (data) this.write(data, encoding);
    this.writable = false;
    this._conn?.close();
    if (cb) this.once('close', cb);
    return this;
  }

  destroy(err) {
    if (this._destroyed) return this;
    this._destroyed = true;
    this.readable = false;
    this.writable = false;
    this._conn?.destroy();
    if (err) this.emit('error', err);
    queueMicrotask(() => this.emit('close', !!err));
    return this;
  }

  setEncoding(enc) { this._encoding = enc; return this; }
  setKeepAlive() { return this; }
  setNoDelay() { return this; }
  setTimeout(ms, cb) { if (cb) this.once('timeout', cb); return this; }
  ref() { return this; }
  unref() { return this; }
  pause() { return this; }
  resume() { return this; }
  address() { return { address: this.localAddress, port: this.localPort, family: 'IPv4' }; }

  _onConnect() {
    this.connecting = false;
    this.emit('connect');
    this.emit('ready');
  }
  _onData(data) {
    if (this._encoding) this.emit('data', new TextDecoder().decode(data));
    else this.emit('data', data);
  }
  _onEnd() {
    this.readable = false;
    this.emit('end');
    queueMicrotask(() => this.emit('close', false));
  }
  _onError(err) {
    this.readable = false;
    this.writable = false;
    this.emit('error', err);
    queueMicrotask(() => this.emit('close', true));
  }
}

// ─── GvisorServer ───────────────────────────────────────────────────

export class GvisorServer extends EventEmitter {
  constructor(handler) {
    super();
    this._handler = handler;
    this._port = 0;
    this._listening = false;
    if (handler) this.on('connection', handler);
  }

  listen(port, host, cb) {
    if (typeof host === 'function') { cb = host; host = undefined; }
    if (typeof port === 'function') { cb = port; port = 0; }
    if (port && typeof port === 'object') {
      const o = port; cb = typeof host === 'function' ? host : cb;
      port = o.port; host = o.host;
    }
    this._port = port || 0;
    const stack = getGvisorStack();
    if (!this._port) this._port = stack._allocPort();
    stack._listeners.set(this._port, this);
    this._listening = true;
    queueMicrotask(() => {
      this.emit('listening');
      if (cb) cb();
    });
    return this;
  }

  close(cb) {
    this._listening = false;
    try { getGvisorStack()._listeners.delete(this._port); } catch {}
    if (cb) queueMicrotask(cb);
    queueMicrotask(() => this.emit('close'));
    return this;
  }

  address() { return { address: a2ip(VM_IP), family: 'IPv4', port: this._port }; }
  ref() { return this; }
  unref() { return this; }

  _onConnection(tcpConn) {
    const sock = new GvisorSocket(tcpConn);
    sock.connecting = false;
    this.emit('connection', sock);
  }
}

// ─── Public API ─────────────────────────────────────────────────────

export function isGvisorAvailable() {
  const e = _env();
  return !!(e.NODEJS_GVISOR_WS_URL && e.NODEJS_GVISOR_WS_URL !== '' && e.NODEJS_GVISOR_WS_URL !== '0');
}

export function getGvisorStack() {
  if (_stack) return _stack;
  const url = _env().NODEJS_GVISOR_WS_URL;
  if (!url) throw new Error('NODEJS_GVISOR_WS_URL not set (see docs/TRANSPORT.md)');
  _stack = new NetworkStack(url);
  return _stack;
}
