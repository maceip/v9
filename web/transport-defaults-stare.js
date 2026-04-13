/**
 * transport-defaults-stare.js — Opts into the v9 demo hosted transport infra.
 *
 * Loaded ONLY by the GitHub Pages deploy (maceip.github.io/v9/), before
 * node-polyfills.js. Sets globals that the transport probe reads as
 * hosted-tier defaults.
 *
 * Current topology (tier-2 Wisp):
 *   wss://edge.stare.network/wisp/
 *     → DO Global Load Balancer (CDN caching enabled, anycast via
 *       162.159.140.164 / 172.66.0.162 and 2606:4700:7::a2 /
 *       2a06:98c1:58::a2)
 *     → 4 droplets in fra1 / nyc3 / sgp1 / syd1, each running
 *       wisp-server-node via systemd, self-updating via cron git pull
 *
 * Self-hosters embedding v9 should NOT include this file. They get a clean
 * slate: only tier-1 (local v9-net) and tier-4 (direct fetch) by default.
 * To point at their own hosted infra they can:
 *   - set __V9_WISP_WS_URL__ manually before loading node-polyfills.js,
 *   - pass ?wisp=<url> as a query param, or
 *   - fork this file with their own URLs.
 *
 * ── Kill switch ─────────────────────────────────────────────────────────
 * Hosted Wisp can be turned off entirely without editing code:
 *
 *   1. URL:          ?wisp=0  (or ?wisp=off, ?wisp=false)
 *   2. localStorage: localStorage.setItem('v9NoWisp', '1')
 *   3. Global:       globalThis.__V9_DISABLE_WISP__ = true
 *
 * Any of these causes the hosted Wisp URL to not be set, tier-2 probing
 * is skipped, and the transport chain falls through to tier-1 (local
 * v9-net if running) and tier-4 (direct fetch, CORS-restricted).
 *
 * The hostname guard below means this script is safe to load anywhere —
 * it only activates on .github.io pages. Local dev of /docs/ also
 * activates it via ?enableStareTransport=1.
 */
(function setV9TransportDefaults() {
  try {
    var loc = typeof globalThis !== 'undefined' ? globalThis.location : null;
    if (!loc) return;
    var host = String(loc.hostname || '');

    // Only activate on known demo hostnames.
    var activate = /\.github\.io$/i.test(host);

    // Local dev: allow ?enableStareTransport=1 as an explicit opt-in for
    // testing the hosted-infra path against a local server.
    var params;
    try { params = new URLSearchParams(loc.search || ''); }
    catch (_) { params = null; }
    if (!activate && params && params.get('enableStareTransport') === '1') {
      activate = true;
    }

    if (!activate) return;

    // ── Kill switch: user has explicitly disabled hosted Wisp ─────────
    var killed = false;
    if (globalThis.__V9_DISABLE_WISP__ === true) killed = true;
    if (params) {
      var q = params.get('wisp');
      if (q === '0' || q === 'off' || q === 'false' || q === 'no') killed = true;
    }
    try {
      if (globalThis.localStorage && globalThis.localStorage.getItem('v9NoWisp') === '1') {
        killed = true;
      }
    } catch (_) { /* storage might be blocked */ }

    if (killed) {
      // Make the "off" state visible in devtools so people can tell why
      // they're not seeing tier-2 — it's intentional, not a breakage.
      try { console.log('[v9-net] hosted Wisp disabled by kill switch (edge.stare.network)'); }
      catch (_) {}
      return;
    }

    // Don't clobber anything a user has already set (e.g. via ?wisp=...
    // or a pre-set global).
    if (!globalThis.__V9_WISP_WS_URL__) {
      globalThis.__V9_WISP_WS_URL__ = 'wss://edge.stare.network/wisp/';
    }
    // Tier-3 fetch proxy: not currently hosted. Self-hosters can still
    // point it at their own endpoint.
  } catch (_) { /* ignore — transport probe will just see no default */ }
})();
