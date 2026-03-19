/**
 * CORS Proxy — Cloudflare Worker that proxies requests to api.anthropic.com.
 *
 * Anthropic's API does not send Access-Control-Allow-Origin for browser
 * requests. This minimal worker forwards requests and adds CORS headers.
 *
 * SECURITY (H3): Origin is validated against ALLOWED_ORIGINS.
 * Set the environment variable ALLOWED_ORIGINS as a comma-separated list
 * of allowed origins, or default to localhost for development.
 *
 * Deploy:
 *   npx wrangler deploy web/cors-proxy-worker.js --name edgejs-cors-proxy
 *
 * Configure allowed origins via wrangler.toml:
 *   [vars]
 *   ALLOWED_ORIGINS = "https://yourdomain.com,https://app.yourdomain.com"
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
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Validate origin for non-preflight requests
    if (!isOriginAllowed(origin, env)) {
      return new Response('Forbidden: origin not allowed', { status: 403 });
    }

    // Forward to Anthropic API
    const url = new URL(request.url);
    url.hostname = 'api.anthropic.com';
    url.port = '';
    url.protocol = 'https:';

    const proxyRequest = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow',
    });

    const response = await fetch(proxyRequest);

    // M12: Clone response to avoid consuming the body stream
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
