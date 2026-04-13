/**
 * Central transport policy for Node-shaped APIs in browser / Wasm bridge hosts.
 *
 * Four-tier transport chain, tried in order of preference:
 *
 *   [1] LOCAL v9-net       — NODEJS_GVISOR_WS_URL — raw TCP via local gvisor-tap-vsock
 *   [2] HOSTED CHISEL      — NODEJS_CHISEL_WS_URL — raw TCP via remote tunnel
 *   [3] HOSTED FETCH PROXY — NODEJS_IN_TAB_FETCH_PROXY — HTTP(S) via JSON POST proxy
 *   [4] DIRECT BROWSER FETCH — native fetch(), CORS-restricted (works for npm etc.)
 *
 * Raw sockets (net.connect, net.createServer) need tier 1 or tier 2.
 * HTTP client (fetch, http.request) can use any tier, picked by preference order.
 *
 * Env (process.env on host; globalThis.process.env in tab):
 *   NODEJS_GVISOR_WS_URL        — tier 1: local v9-net WebSocket URL
 *   NODEJS_CHISEL_WS_URL        — tier 2: hosted chisel TCP tunnel URL
 *   NODEJS_IN_TAB_FETCH_PROXY   — tier 3: POST JSON { url, init } → JSON { ok, status, headers, body64 }
 *   NODEJS_HTTP_TRANSPORT       — fetch | fetch-proxy | auto (default auto)
 *   NODEJS_WISP_WS_URL          — reserved: Wisp relay expectation
 */

const _env = () =>
  (typeof globalThis.process !== 'undefined' && globalThis.process?.env) || {};

/**
 * True only for a real Node process (not an in-tab polyfill that mimics process.versions).
 */
export function isNodeHost() {
  if (typeof globalThis.document !== 'undefined') return false;
  return typeof globalThis.process?.versions?.node === 'string';
}

/**
 * HTTP(S) request strategy for the current host.
 * @returns {'fetch'|'fetch-proxy'|'node-native'}
 */
export function getHttpTransportMode() {
  const e = _env();
  if (isNodeHost()) {
    if (e.NODEJS_HTTP_TRANSPORT === 'fetch') return 'fetch';
    return 'node-native';
  }
  if (e.NODEJS_HTTP_TRANSPORT === 'fetch-proxy') return 'fetch-proxy';
  if (e.NODEJS_IN_TAB_FETCH_PROXY && e.NODEJS_IN_TAB_FETCH_PROXY !== '0' && e.NODEJS_IN_TAB_FETCH_PROXY !== '') {
    return 'fetch-proxy';
  }
  return 'fetch';
}

/**
 * Raw TCP/TLS transport mode.
 *
 *   embedder  — host provided a __NODE_TAB_WISP_TCP_CONNECT hook
 *   gvisor    — local v9-net (NODEJS_GVISOR_WS_URL is set; probe may or may not have succeeded)
 *   chisel    — hosted chisel tunnel (NODEJS_CHISEL_WS_URL is set)
 *   wisp-expected — caller expects Wisp but client isn't bundled
 *   none      — no raw-socket transport available (HTTP-only)
 *
 * @returns {'none'|'wisp-expected'|'embedder'|'gvisor'|'chisel'}
 */
export function getRawSocketTransportMode() {
  const e = _env();
  if (typeof globalThis.__NODE_TAB_WISP_TCP_CONNECT === 'function') return 'embedder';
  if (e.NODEJS_GVISOR_WS_URL && e.NODEJS_GVISOR_WS_URL !== '' && e.NODEJS_GVISOR_WS_URL !== '0') {
    return 'gvisor';
  }
  if (e.NODEJS_CHISEL_WS_URL && e.NODEJS_CHISEL_WS_URL !== '' && e.NODEJS_CHISEL_WS_URL !== '0') {
    return 'chisel';
  }
  if (e.NODEJS_WISP_WS_URL && e.NODEJS_WISP_WS_URL !== '' && e.NODEJS_WISP_WS_URL !== '0') {
    return 'wisp-expected';
  }
  return 'none';
}

/**
 * Browser path: native fetch or JSON proxy.
 * @param {string} url
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
function _utf8ToB64(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
  return btoa(str);
}

function _bytesToB64(u8) {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}

function _b64ToU8(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(String(b64), 'base64'));
  const bin = atob(String(b64));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function browserHttpFetch(url, init = {}) {
  const mode = getHttpTransportMode();
  if (mode !== 'fetch-proxy') {
    return fetch(url, init);
  }

  const proxy = String(_env().NODEJS_IN_TAB_FETCH_PROXY || '').replace(/\/$/, '');
  if (!proxy) {
    return fetch(url, init);
  }

  const headersObj = {};
  if (init.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => {
        headersObj[k] = v;
      });
    } else if (Array.isArray(init.headers)) {
      for (let i = 0; i < init.headers.length; i += 2) {
        headersObj[init.headers[i]] = init.headers[i + 1];
      }
    } else {
      Object.assign(headersObj, init.headers);
    }
  }

  let body64 = null;
  if (init.body != null) {
    if (typeof init.body === 'string') {
      body64 = _utf8ToB64(init.body);
    } else if (init.body instanceof ArrayBuffer) {
      body64 = _bytesToB64(new Uint8Array(init.body));
    } else if (init.body instanceof Uint8Array) {
      body64 = _bytesToB64(init.body);
    } else if (typeof Blob !== 'undefined' && init.body instanceof Blob) {
      const ab = await init.body.arrayBuffer();
      body64 = _bytesToB64(new Uint8Array(ab));
    } else {
      throw new TypeError('NODEJS_IN_TAB_FETCH_PROXY: unsupported body type (use string, Uint8Array, ArrayBuffer, Blob)');
    }
  }

  const payload = {
    url: String(url),
    init: {
      method: init.method || 'GET',
      headers: headersObj,
      body64,
      duplex: init.duplex,
    },
  };

  const r = await fetch(proxy, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: init.signal,
  });

  if (!r.ok) {
    throw new Error(`fetch proxy HTTP ${r.status}: ${r.statusText}`);
  }

  const json = await r.json();
  if (!json || json.ok === false) {
    throw new Error(json?.error || 'fetch proxy rejected request');
  }

  const outHeaders = new Headers(json.headers || {});
  const buf =
    json.body64 != null && json.body64 !== '' ? _b64ToU8(json.body64) : new Uint8Array(0);

  return new Response(buf.byteLength ? buf : null, {
    status: json.status ?? 502,
    statusText: json.statusText ?? '',
    headers: outHeaders,
  });
}
