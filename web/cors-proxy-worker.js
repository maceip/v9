/**
 * CORS Proxy — Cloudflare Worker that proxies requests to api.anthropic.com.
 *
 * Anthropic's API does not send Access-Control-Allow-Origin for browser
 * requests. This minimal worker forwards requests and adds CORS headers.
 *
 * Security layers:
 *   1. Origin validation: only ALLOWED_ORIGINS can use the proxy
 *   2. Rate limiting: per-IP sliding window (configurable via env)
 *   3. Shared secret: optional PROXY_SECRET header validation
 *
 * Deploy:
 *   npx wrangler deploy web/cors-proxy-worker.js --name edgejs-cors-proxy
 *
 * Configure via wrangler.toml [vars]:
 *   ALLOWED_ORIGINS = "https://yourdomain.com,https://app.yourdomain.com"
 *   PROXY_SECRET = "your-shared-secret"  # optional — if set, clients must send x-proxy-secret header
 *   RATE_LIMIT_RPM = "60"                # requests per minute per IP (default: 60)
 */

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
];

function getAllowedOrigins(env) {
  if (env?.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

function isOriginAllowed(origin, env) {
  if (!origin) return false;
  const allowed = getAllowedOrigins(env);
  return allowed.includes(origin) || allowed.includes('*');
}

// ─── Rate limiting (per-IP sliding window) ──────────────────────────
// Uses in-memory Map — resets on worker restart, which is acceptable
// for a lightweight proxy. For durable rate limiting, use Cloudflare KV
// or Durable Objects.

const _rateLimitMap = new Map();  // ip → { count, windowStart }
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip, env) {
  const maxRpm = parseInt(env?.RATE_LIMIT_RPM || '60', 10) || 60;
  const now = Date.now();
  let entry = _rateLimitMap.get(ip);

  if (!entry || (now - entry.windowStart) > RATE_LIMIT_WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    _rateLimitMap.set(ip, entry);
  }

  entry.count++;

  if (entry.count > maxRpm) {
    return true;
  }

  // Periodic cleanup: remove stale entries every 1000 requests
  if (_rateLimitMap.size > 10000) {
    for (const [k, v] of _rateLimitMap) {
      if (now - v.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
        _rateLimitMap.delete(k);
      }
    }
  }

  return false;
}

function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Real-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '0.0.0.0';
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      if (!isOriginAllowed(origin, env)) {
        return new Response('Forbidden', { status: 403 });
      }
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access, x-proxy-secret',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // ── Security: Origin validation ──
    if (!isOriginAllowed(origin, env)) {
      return new Response('Forbidden: origin not allowed', { status: 403 });
    }

    // ── Security: Shared secret validation ──
    if (env?.PROXY_SECRET) {
      const clientSecret = request.headers.get('x-proxy-secret') || '';
      if (clientSecret !== env.PROXY_SECRET) {
        return new Response('Forbidden: invalid proxy secret', { status: 403 });
      }
    }

    // ── Security: Rate limiting ──
    const clientIP = getClientIP(request);
    if (isRateLimited(clientIP, env)) {
      return new Response('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': '60',
          'Access-Control-Allow-Origin': origin,
        },
      });
    }

    // Forward to Anthropic API
    const url = new URL(request.url);
    url.hostname = 'api.anthropic.com';
    url.port = '';
    url.protocol = 'https:';

    // Strip proxy-specific headers before forwarding
    const forwardHeaders = new Headers(request.headers);
    forwardHeaders.delete('x-proxy-secret');

    const proxyRequest = new Request(url.toString(), {
      method: request.method,
      headers: forwardHeaders,
      body: request.body,
      redirect: 'follow',
    });

    const response = await fetch(proxyRequest);

    const corsHeaders = new Headers(response.headers);
    corsHeaders.set('Access-Control-Allow-Origin', origin);
    corsHeaders.set('Access-Control-Expose-Headers', 'x-request-id');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: corsHeaders,
    });
  },
};
