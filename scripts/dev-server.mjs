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
  let filePath = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (filePath.endsWith('/') || filePath === ROOT) filePath = path.join(ROOT, 'web', 'index.html');

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

// ── CORS proxy (8081) ───────────────────────────────────────────────
const PROXY_TARGETS = {
  'api.anthropic.com': true,
  'platform.claude.com': true,
  'api.openai.com': true,
  'generativelanguage.googleapis.com': true,
};

const proxy = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Determine target from X-Proxy-Host header or default to Anthropic
  const targetHost = req.headers['x-proxy-host'] || 'api.anthropic.com';
  if (!PROXY_TARGETS[targetHost]) {
    res.writeHead(403); res.end('Proxy target not allowed: ' + targetHost); return;
  }

  const url = new URL(req.url, `https://${targetHost}`);
  const headers = { ...req.headers, host: targetHost };
  delete headers['x-proxy-host'];

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

fileServer.listen(8080, () => console.log('File server: http://localhost:8080/web/'));
proxy.listen(8081, () => console.log('CORS proxy:  http://localhost:8081/'));
console.log('\nOpen: http://localhost:8080/web/index.html?bundle=/dist/claude-code-cli.js');
