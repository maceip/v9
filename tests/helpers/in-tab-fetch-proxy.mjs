/**
 * Local JSON POST relay implementing the contract in `docs/TRANSPORT.md`
 * (`NODEJS_IN_TAB_FETCH_PROXY`). Binds 127.0.0.1 only — for tests / dev.
 */
import { createServer } from 'node:http';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * @param {{ port?: number }} [opts] — port 0 = OS-assigned
 * @returns {Promise<{ baseUrl: string, proxyUrl: string, close: () => Promise<void> }>}
 */
export async function startInTabFetchProxy(opts = {}) {
  const server = createServer(async (req, res) => {
    for (const [k, v] of Object.entries(CORS)) {
      res.setHeader(k, v);
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const path = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    if (req.method !== 'POST' || (path !== '/' && path !== '/__in-tab-fetch')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    let raw;
    try {
      raw = await collectBody(req);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
      return;
    }

    let json;
    try {
      json = JSON.parse(raw.toString('utf8'));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({ ok: false, error: 'invalid JSON body' }));
      return;
    }

    const targetUrl = json.url;
    const init = json.init || {};
    if (!targetUrl || typeof targetUrl !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({ ok: false, error: 'missing or invalid url' }));
      return;
    }

    try {
      /** @type {RequestInit} */
      const fetchInit = {
        method: init.method || 'GET',
        headers: init.headers || {},
      };
      if (init.body64) {
        fetchInit.body = Buffer.from(String(init.body64), 'base64');
        if (init.duplex) fetchInit.duplex = init.duplex;
      }

      const upstream = await fetch(targetUrl, fetchInit);
      const buf = Buffer.from(await upstream.arrayBuffer());
      /** @type {Record<string, string>} */
      const outHeaders = {};
      upstream.headers.forEach((v, k) => {
        outHeaders[k] = v;
      });

      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({
        ok: true,
        status: upstream.status,
        statusText: upstream.statusText,
        headers: outHeaders,
        body64: buf.length ? buf.toString('base64') : '',
      }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
      res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 0, '127.0.0.1', resolve);
  });

  const addr = server.address();
  if (!addr || typeof addr !== 'object') {
    throw new Error('in-tab-fetch-proxy: listen failed');
  }

  const baseUrl = `http://127.0.0.1:${addr.port}`;
  return {
    baseUrl,
    proxyUrl: `${baseUrl}/__in-tab-fetch`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
