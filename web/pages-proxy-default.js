/**
 * Sets a default Anthropic API CORS proxy for the official GitHub Pages demo only
 * (browser cannot call api.anthropic.com directly). Parent page or iframe runs this
 * before node-polyfills.js so fetch/XHR rewriting sees __V9_PAGES_ANTHROPIC_PROXY__.
 *
 * Deploy: web/cors-proxy-worker.js — allow Origin https://maceip.github.io in ALLOWED_ORIGINS.
 * Override: ?proxy=… on the URL, or window.__V9_ANTHROPIC_FETCH_PROXY__ (takes precedence in polyfills).
 */
(function setPagesAnthropicProxyDefault() {
  var G = typeof globalThis !== 'undefined' ? globalThis : window;
  try {
    if (G.__V9_PAGES_ANTHROPIC_PROXY__ || G.__V9_ANTHROPIC_FETCH_PROXY__) return;
    var loc = G.location;
    if (!loc || !/\.github\.io$/i.test(loc.hostname || '')) return;
    var path = loc.pathname || '';
    if (!/^\/v9(\/|$)/.test(path)) return;
    var q = new URLSearchParams(loc.search || '').get('proxy');
    if (q) return;
    // Dedicated fetch-proxy service (systemd, auto-restarts on reboot).
    G.__V9_PAGES_ANTHROPIC_PROXY__ = 'http://3.120.153.36:8082';
  } catch (_) { /* ignore */ }
})();
