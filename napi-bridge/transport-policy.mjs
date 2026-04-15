/**
 * Central transport policy for Node-shaped APIs in browser / Wasm bridge hosts.
 *
 * Four-tier transport chain, tried in order of preference:
 *
 *   [1] LOCAL v9-net       — NODEJS_GVISOR_WS_URL — raw TCP via local gvisor-tap-vsock
 *   [2] HOSTED WISP        — NODEJS_WISP_WS_URL   — raw TCP via remote Wisp tunnel
 *   [3] HOSTED FETCH PROXY — NODEJS_IN_TAB_FETCH_PROXY — HTTP(S) via JSON POST proxy
 *   [4] DIRECT BROWSER FETCH — native fetch(), CORS-restricted (works for npm etc.)
 *
 * Raw sockets (net.connect, net.createServer) need tier 1 or tier 2.
 * HTTP client (fetch, http.request) can use any tier, picked by preference order.
 *
 * ── Auto-fallback for fetch() ─────────────────────────────────────────
 * `browserHttpFetch()` implements the full chain: native fetch first, then
 * on failure walks down to tier-3 fetch-proxy, then tier-2 wisp (plaintext
 * HTTP only). Callers don't need to know which tier is active. `globalThis.fetch`
 * is patched in web/node-polyfills.js to route through this function so every
 * fetch() call in the host JS context gets the chain automatically.
 *
 * Tier 2 caveat: wispConnect gives a raw TCP socket. HTTPS would need a TLS
 * handshake on top of the stream, which doesn't exist in the browser host JS
 * (the wasm Node runtime has BoringSSL; the host JS doesn't). So the wisp
 * fallback only handles plaintext HTTP. For HTTPS targets the chain emits a
 * clear TypeError pointing at tier-3 as the HTTPS-capable fallback.
 *
 * Env (process.env on host; globalThis.process.env in tab):
 *   NODEJS_GVISOR_WS_URL        — tier 1: local v9-net WebSocket URL
 *   NODEJS_WISP_WS_URL          — tier 2: hosted Wisp v1 tunnel URL
 *   NODEJS_IN_TAB_FETCH_PROXY   — tier 3: POST JSON { url, init } → JSON { ok, status, headers, body64 }
 *   NODEJS_HTTP_TRANSPORT       — fetch | fetch-proxy | auto (default auto)
 */

const _env = () =>
  (typeof globalThis.process !== 'undefined' && globalThis.process?.env) || {};

/**
 * Baked-in hosted tier-3 fetch proxy. Same host as DEFAULT_WISP_URL —
 * wisp-server-node serves `/fetch` alongside `/wisp/` on the same origin
 * (see cmd/wisp-server-node/server.js). Used when NODEJS_IN_TAB_FETCH_PROXY
 * / __V9_FETCH_PROXY_URL__ aren't explicitly set, so the auto-fallback
 * chain has a working HTTPS-capable hop out of the box — no client config
 * needed for the hosted demo.
 *
 * Overrides (all take precedence over the default):
 *   - process.env.NODEJS_IN_TAB_FETCH_PROXY
 *   - globalThis.__V9_FETCH_PROXY_URL__
 *
 * Kill switches (any → default not used, tier-3 disabled unless env set):
 *   - globalThis.__V9_DISABLE_FETCH_PROXY__ === true
 *   - localStorage['v9NoFetchProxy'] === '1'
 *   - explicit off-value in the env var / global: '' | '0' | 'off' | 'no' | 'false'
 */
export const DEFAULT_FETCH_PROXY_URL = 'https://edge.stare.network/fetch';

function _isFetchProxyKillSwitched() {
  if (globalThis.__V9_DISABLE_FETCH_PROXY__ === true) return true;
  try {
    if (globalThis.localStorage && globalThis.localStorage.getItem('v9NoFetchProxy') === '1') {
      return true;
    }
  } catch { /* storage blocked */ }
  return false;
}

/**
 * Resolved tier-3 fetch proxy URL. Precedence: env var → global → default.
 * Explicit off-values and the kill switches collapse to null — tier-3 is
 * skipped entirely in that case.
 */
function _getFetchProxyUrl() {
  if (_isFetchProxyKillSwitched()) return null;
  const raw = _env().NODEJS_IN_TAB_FETCH_PROXY || globalThis.__V9_FETCH_PROXY_URL__;
  if (raw === '' || raw === '0' || raw === 'off' || raw === 'no' || raw === 'false') {
    return null;
  }
  if (raw) return String(raw).replace(/\/$/, '');
  return DEFAULT_FETCH_PROXY_URL;
}

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
 *   gvisor    — local v9-net (NODEJS_GVISOR_WS_URL is set)
 *   wisp      — hosted Wisp v1 tunnel (NODEJS_WISP_WS_URL is set)
 *   none      — no raw-socket transport available (HTTP-only)
 *
 * @returns {'none'|'embedder'|'gvisor'|'wisp'}
 */
export function getRawSocketTransportMode() {
  const e = _env();
  if (typeof globalThis.__NODE_TAB_WISP_TCP_CONNECT === 'function') return 'embedder';
  if (e.NODEJS_GVISOR_WS_URL && e.NODEJS_GVISOR_WS_URL !== '' && e.NODEJS_GVISOR_WS_URL !== '0') {
    return 'gvisor';
  }
  if (e.NODEJS_WISP_WS_URL && e.NODEJS_WISP_WS_URL !== '' && e.NODEJS_WISP_WS_URL !== '0') {
    return 'wisp';
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

/**
 * Normalize init.headers into a plain { [lowercase]: string } map. Used by
 * the tier-3 proxy body + tier-2 wisp request builder so header handling is
 * consistent across fallback tiers.
 */
function _headersToObject(headers) {
  const out = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((v, k) => { out[k] = v; });
    return out;
  }
  if (Array.isArray(headers)) {
    for (let i = 0; i < headers.length; i += 2) out[headers[i]] = headers[i + 1];
    return out;
  }
  return Object.assign(out, headers);
}

async function _initBodyToBytes(body) {
  if (body == null) return null;
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    const ab = await body.arrayBuffer();
    return new Uint8Array(ab);
  }
  throw new TypeError('fallback transport: unsupported body type (use string, Uint8Array, ArrayBuffer, Blob)');
}

/**
 * Tier-3: POST { url, init } to NODEJS_IN_TAB_FETCH_PROXY and unwrap the
 * JSON envelope back into a Response. Works for HTTPS targets because the
 * proxy runs server-side and is not CORS-gated.
 */
async function _fetchProxyFetch(url, init, proxyUrl) {
  const headersObj = _headersToObject(init.headers);

  let body64 = null;
  if (init.body != null) {
    const bytes = await _initBodyToBytes(init.body);
    if (typeof bytes === 'string') body64 = _utf8ToB64(bytes);
    else body64 = _bytesToB64(bytes);
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

  const r = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: init.signal,
  });

  if (!r.ok) throw new Error(`fetch proxy HTTP ${r.status}: ${r.statusText}`);

  const json = await r.json();
  if (!json || json.ok === false) throw new Error(json?.error || 'fetch proxy rejected request');

  const outHeaders = new Headers(json.headers || {});
  const buf =
    json.body64 != null && json.body64 !== '' ? _b64ToU8(json.body64) : new Uint8Array(0);

  return new Response(buf.byteLength ? buf : null, {
    status: json.status ?? 502,
    statusText: json.statusText ?? '',
    headers: outHeaders,
  });
}

/**
 * Tier-2: send an HTTP/1.1 request over a raw Wisp TCP stream, parse the
 * response bytes, return a Response. Plaintext HTTP only — HTTPS targets
 * throw because the host JS context has no TLS implementation.
 *
 * The wisp path lives in napi-bridge/wisp-client.js. We import it lazily
 * so environments that don't carry wisp (e.g. pure-Node test runners with
 * no WebSocket global) can still load this module.
 */
async function _wispHttpFetch(url, init) {
  const target = new URL(String(url));
  if (target.protocol !== 'http:') {
    throw new TypeError(
      `wisp fallback: only plaintext http:// is supported (got ${target.protocol}//${target.host}). ` +
      `For HTTPS targets, configure NODEJS_IN_TAB_FETCH_PROXY to route through the tier-3 hosted proxy.`
    );
  }

  const { wispConnect } = await import('./wisp-client.js');
  const hostname = target.hostname;
  const port = parseInt(target.port || '80', 10);
  const path = target.pathname + target.search;
  const method = (init.method || 'GET').toUpperCase();
  const headers = _headersToObject(init.headers);

  if (!headers['Host'] && !headers['host']) {
    headers['Host'] = port === 80 ? hostname : `${hostname}:${port}`;
  }

  const bodyBytes = init.body != null ? await _initBodyToBytes(init.body) : null;
  if (bodyBytes && !headers['Content-Length'] && !headers['content-length']) {
    headers['Content-Length'] = String(bodyBytes.byteLength);
  }

  let head = `${method} ${path || '/'} HTTP/1.1\r\n`;
  for (const [k, v] of Object.entries(headers)) head += `${k}: ${v}\r\n`;
  head += 'Connection: close\r\n\r\n';
  const headBytes = new TextEncoder().encode(head);

  const sock = await wispConnect(hostname, port);

  // Collect the entire response, then parse. For the use cases that hit
  // this path today (registry metadata, small tarballs bounded by wisp
  // server limits) this is fine. If we ever need streaming we can wrap
  // the incoming chunks in a ReadableStream instead.
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;

    if (init.signal) {
      const onAbort = () => {
        if (settled) return;
        settled = true;
        try { sock.destroy(); } catch { /* ignore */ }
        reject(new DOMException('The operation was aborted', 'AbortError'));
      };
      if (init.signal.aborted) return onAbort();
      init.signal.addEventListener('abort', onAbort, { once: true });
    }

    sock.on('data', (chunk) => {
      const c = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk.buffer || chunk);
      chunks.push(c);
      total += c.byteLength;
    });
    const finish = () => {
      if (settled) return;
      settled = true;
      const buf = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
      try { resolve(_parseHttpResponse(buf)); }
      catch (err) { reject(err); }
    };
    sock.on('end', finish);
    sock.on('close', finish);
    sock.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    try {
      sock.write(headBytes);
      if (bodyBytes && bodyBytes.byteLength) sock.write(bodyBytes);
    } catch (err) {
      if (!settled) { settled = true; reject(err); }
    }
  });
}

/**
 * Parse a raw HTTP/1.1 response buffer into a Response. The wisp tier reads
 * the whole response, so this is buffer-in → Response-out; no streaming.
 */
function _parseHttpResponse(buf) {
  // Find end of headers.
  let hdrEnd = -1;
  for (let i = 3; i < buf.byteLength; i++) {
    if (buf[i - 3] === 0x0d && buf[i - 2] === 0x0a && buf[i - 1] === 0x0d && buf[i] === 0x0a) {
      hdrEnd = i + 1;
      break;
    }
  }
  if (hdrEnd < 0) throw new TypeError('wisp fallback: malformed HTTP response (no header terminator)');

  const headerStr = new TextDecoder().decode(buf.subarray(0, hdrEnd - 4));
  const lines = headerStr.split('\r\n');
  const statusLine = lines[0].match(/^HTTP\/[\d.]+ (\d+)\s*(.*)$/);
  if (!statusLine) throw new TypeError('wisp fallback: malformed HTTP status line');
  const status = parseInt(statusLine[1], 10);
  const statusText = statusLine[2] || '';

  const headers = new Headers();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const k = line.slice(0, colon).trim();
    const v = line.slice(colon + 1).trim();
    // Skip headers that Response() forbids (e.g. set-cookie multi-value is
    // handled by Headers natively; hop-by-hop are fine to pass through).
    try { headers.append(k, v); } catch { /* ignore invalid header name */ }
  }

  const body = buf.subarray(hdrEnd);
  return new Response(body.byteLength ? body : null, { status, statusText, headers });
}

/**
 * True iff tier-2 wisp is available as an HTTP fallback. Imports wisp-client
 * lazily because this module must load in pure-Node test runners that lack
 * a global WebSocket.
 */
async function _wispFallbackAvailable() {
  try {
    const { isWispAvailable } = await import('./wisp-client.js');
    return isWispAvailable();
  } catch {
    return false;
  }
}

/**
 * Fetch with automatic fallback down the transport chain.
 *
 * Precedence when called from the browser host JS:
 *   1. Tier-3 fetch-proxy (if NODEJS_IN_TAB_FETCH_PROXY is set explicitly,
 *      it's preferred — the user opted into the proxy path).
 *   2. Native browser fetch. Fast path for anything CORS-enabled.
 *   3. On native failure (TypeError / abort / network error), walk the
 *      chain: tier-3 proxy if not already tried, then tier-2 wisp for
 *      plaintext HTTP targets.
 *   4. Re-throw the original native-fetch error if no fallback tier can
 *      handle the request — the caller sees the same error shape it would
 *      have seen without auto-fallback.
 */
export async function browserHttpFetch(url, init = {}) {
  const proxy = _getFetchProxyUrl();
  const mode = getHttpTransportMode();

  // Explicit tier-3 selection — caller set NODEJS_HTTP_TRANSPORT=fetch-proxy,
  // so go straight to the proxy. Skip native entirely because the caller
  // opted out of it.
  if (mode === 'fetch-proxy' && proxy) {
    return _fetchProxyFetch(url, init, proxy);
  }

  // Try native fetch first — fast path for CORS-enabled endpoints. On
  // AbortError propagate immediately; the caller cancelled on purpose.
  try {
    return await fetch(url, init);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    if (init.signal?.aborted) throw err;

    // Native fetch failed. Walk the fallback chain.
    if (proxy) {
      try { return await _fetchProxyFetch(url, init, proxy); }
      catch (proxyErr) {
        // Fall through to wisp. Keep the original native error for the
        // final re-throw — callers' existing catch blocks were written
        // against it.
      }
    }

    if (await _wispFallbackAvailable()) {
      try { return await _wispHttpFetch(url, init); }
      catch (wispErr) {
        // If wisp specifically rejected an HTTPS target, surface THAT
        // error — it's actionable and points at the tier-3 fix.
        if (wispErr instanceof TypeError && String(wispErr.message).includes('wisp fallback: only plaintext')) {
          throw wispErr;
        }
      }
    }

    throw err;
  }
}
