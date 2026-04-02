#!/usr/bin/env node
/**
 * Dev server: HTTP file server (8080) + CORS proxy (8081)
 * Usage: node scripts/dev-server.mjs
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

// ── File server (8080) ──────────────────────────────────────────────
const fileServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, 'http://x');
  let pathname = decodeURIComponent(url.pathname);
  let filePath;
  
  if (pathname === '/') {
    filePath = path.join(ROOT, 'web', 'index.html');
  } else {
    filePath = path.join(ROOT, pathname);
  }

  console.log(`[fileServer] ${req.method} ${req.url} -> ${filePath}`);

  const serveFile = (pathPtr) => {
    fs.stat(pathPtr, (err, stat) => {
      if (err || !stat.isFile()) {
        // Fallback to docs directory if not found in root
        if (pathPtr.startsWith(ROOT) && !pathPtr.includes(path.join(ROOT, 'docs'))) {
          const docsPath = path.join(ROOT, 'docs', pathname);
          if (docsPath !== pathPtr) {
            console.log(`[fileServer] FALLBACK: ${pathname} -> ${docsPath}`);
            serveFile(docsPath);
            return;
          }
        }
        console.warn(`[fileServer] NOT FOUND: ${pathPtr}`, err?.message);
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(pathPtr);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      });
      fs.createReadStream(pathPtr).pipe(res);
    });
  };

  serveFile(filePath);
});

// ── CORS proxy (8081) ───────────────────────────────────────────────
const PROXY_TARGETS = {
  'api.anthropic.com': true,
  'platform.claude.com': true,
  'api.openai.com': true,
  'generativelanguage.googleapis.com': true,
};

const STRIP_REQUEST_HEADERS = new Set([
  'connection',
  'cookie',
  'cookie2',
  'host',
  'origin',
  'proxy-authorization',
  'referer',
  'transfer-encoding',
  'via',
]);

function sanitizeProxyRequestHeaders(headers, targetHost) {
  const out = {};
  for (const [rawKey, value] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    if (value == null) continue;
    if (key === 'x-proxy-host') continue;
    if (STRIP_REQUEST_HEADERS.has(key)) continue;
    if (key.startsWith('sec-')) continue;
    if (key.startsWith('proxy-')) continue;
    out[key] = value;
  }
  out.host = targetHost;
  return out;
}

function decodeProxyHeaders(encoded) {
  if (!encoded) return {};
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

const proxy = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  
  if (req.method === 'HEAD' && (req.url === '/' || req.url === '')) {
    res.writeHead(200); res.end(); return;
  }

  const targetHost = req.headers['x-proxy-host'] || 'api.anthropic.com';
  if (!PROXY_TARGETS[targetHost]) {
    res.writeHead(403); res.end('Proxy target not allowed: ' + targetHost); return;
  }

  const url = new URL(req.url, `https://${targetHost}`);
  const headers = sanitizeProxyRequestHeaders(req.headers, targetHost);

  const proxyReq = https.request({
    hostname: targetHost, path: url.pathname + url.search,
    method: req.method, headers,
  }, (proxyRes) => {
    const h = { ...proxyRes.headers, 'access-control-allow-origin': '*' };
    res.writeHead(proxyRes.statusCode, h);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (e) => {
    res.writeHead(502); res.end('Proxy error: ' + e.message);
  });

  req.pipe(proxyReq);
});

const wsServer = new WebSocketServer({
  noServer: true,
  handleProtocols(protocols, request) {
    const requested = request.__edgeRequestedProtocols || [];
    for (const protocol of requested) {
      if (protocols.has(protocol)) return protocol;
    }
    return protocols.values().next().value;
  },
});

proxy.on('upgrade', (req, socket, head) => {
  let parsed;
  try {
    parsed = new URL(req.url, 'http://localhost:8081');
  } catch {
    socket.destroy();
    return;
  }

  if (parsed.pathname !== '/__ws') {
    socket.destroy();
    return;
  }

  const targetUrl = parsed.searchParams.get('url');
  if (!targetUrl) {
    socket.destroy();
    return;
  }

  let upstreamUrl;
  try {
    upstreamUrl = new URL(targetUrl);
  } catch {
    socket.destroy();
    return;
  }

  if (!PROXY_TARGETS[upstreamUrl.hostname]) {
    socket.destroy();
    return;
  }

  const requestedProtocols = parsed.searchParams
    .getAll('protocol')
    .filter(Boolean);
  const forwardedHeaders = sanitizeProxyRequestHeaders(
    decodeProxyHeaders(parsed.searchParams.get('headers')),
    upstreamUrl.host,
  );

  req.__edgeRequestedProtocols = requestedProtocols;
  wsServer.handleUpgrade(req, socket, head, (clientWs) => {
    const pendingClientMessages = [];
    let upstreamOpen = false;
    const upstreamWs = new WebSocket(upstreamUrl, requestedProtocols, {
      headers: forwardedHeaders,
    });

    const flushPending = () => {
      while (pendingClientMessages.length > 0 && upstreamWs.readyState === upstreamWs.OPEN) {
        const { data, isBinary } = pendingClientMessages.shift();
        upstreamWs.send(data, { binary: isBinary });
      }
    };

    const closeBoth = () => {
      try { clientWs.close(); } catch {}
      try { upstreamWs.close(); } catch {}
    };

    upstreamWs.on('open', () => {
      upstreamOpen = true;
      flushPending();
    });
    upstreamWs.on('message', (data, isBinary) => {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });
    upstreamWs.on('close', (code, reason) => {
      if (clientWs.readyState === clientWs.OPEN || clientWs.readyState === clientWs.CONNECTING) {
        const safeReason = Buffer.isBuffer(reason) ? reason.toString('utf8').slice(0, 123) : String(reason || '').slice(0, 123);
        clientWs.close(code || 1000, safeReason);
      }
    });
    upstreamWs.on('error', () => {
      closeBoth();
    });

    clientWs.on('message', (data, isBinary) => {
      if (upstreamWs.readyState === upstreamWs.OPEN) {
        upstreamWs.send(data, { binary: isBinary });
      } else if (!upstreamOpen && pendingClientMessages.length < 128) {
        pendingClientMessages.push({ data, isBinary });
      }
    });
    clientWs.on('close', () => {
      try { upstreamWs.close(); } catch {}
    });
    clientWs.on('error', () => {
      try { upstreamWs.close(); } catch {}
    });
  });
});

fileServer.listen(8080, () => console.log('File server: http://localhost:8080/'));
proxy.listen(8081, () => console.log('CORS proxy:  http://localhost:8081/'));
console.log('\nOpen: http://localhost:8080/web/index.html?bundle=/dist/app-bundle.js');
