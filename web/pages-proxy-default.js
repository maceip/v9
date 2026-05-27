/**
 * Optional Anthropic API CORS proxy for the GitHub Pages demo
 * (browser cannot call api.anthropic.com directly).
 *
 * No URL is hard-coded here anymore. If you want a default proxy for the
 * Pages demo, set it via ONE of:
 *
 *   1. URL query param:                ?proxy=https://my-proxy.example.com
 *   2. Inline script BEFORE this file: <script>window.__V9_ANTHROPIC_FETCH_PROXY__ = 'https://my-proxy.example.com'</script>
 *   3. Meta tag in <head>:             <meta name="v9-anthropic-proxy" content="https://my-proxy.example.com">
 *
 * Without any of those, fetches to api.anthropic.com / platform.claude.com go
 * direct from the browser. That will fail with a CORS error in <1s — loud and
 * obvious — rather than hanging on a dead proxy host.
 *
 * (The previous hard-coded default `https://www.stare.network` had been pointing
 *  at a dead EC2 box; the boot would silently stall waiting for it to respond.)
 *
 * Deploy a proxy: web/cors-proxy-worker.js — allow your Origin in ALLOWED_ORIGINS.
 */
(function setPagesAnthropicProxyDefault() {
  var G = typeof globalThis !== 'undefined' ? globalThis : window;
  try {
    if (G.__V9_PAGES_ANTHROPIC_PROXY__ || G.__V9_ANTHROPIC_FETCH_PROXY__) return;
    var loc = G.location;
    if (!loc) return;
    // ?proxy= takes precedence in node-polyfills.js; respect it here too so we don't fight.
    try {
      var q = new URLSearchParams(loc.search || '').get('proxy');
      if (q) return;
    } catch (_) { /* ignore */ }
    // Optional <meta name="v9-anthropic-proxy" content="…"> escape hatch.
    try {
      var meta = (typeof document !== 'undefined') && document.querySelector('meta[name="v9-anthropic-proxy"]');
      var fromMeta = meta && meta.getAttribute('content');
      if (fromMeta) {
        G.__V9_PAGES_ANTHROPIC_PROXY__ = fromMeta;
        return;
      }
    } catch (_) { /* ignore */ }
    // No default — intentional. See header comment for how to configure one.
  } catch (_) { /* ignore */ }
})();
