/**
 * transport-defaults-stare.js — Opts into the v9 demo hosted transport infra.
 *
 * Loaded ONLY by the GitHub Pages deploy (maceip.github.io/v9/), before
 * node-polyfills.js. Sets globals that the transport probe reads as
 * hosted-tier defaults, so tier-2 and tier-3 are probed against our
 * shared infra at fetch.stare.network.
 *
 * Self-hosters embedding v9 should NOT include this file. They get a clean
 * slate: only tier-1 (local v9-net) and tier-4 (direct fetch) by default.
 * To point at their own hosted infra they can:
 *   - set the same globals manually before loading node-polyfills.js,
 *   - pass ?wisp=... and ?fetchProxy=... query params, or
 *   - fork this file with their own URLs.
 *
 * The hostname guard below means this script is safe to load anywhere —
 * it only activates on .github.io pages. Local dev of /docs/ also
 * activates it via the DEV_HOSTNAMES allowlist below.
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
    if (!activate) {
      try {
        var params = new URLSearchParams(loc.search || '');
        if (params.get('enableStareTransport') === '1') activate = true;
      } catch (_) { /* ignore */ }
    }

    if (!activate) return;

    // Don't clobber anything a user has already set.
    if (!globalThis.__V9_WISP_WS_URL__) {
      globalThis.__V9_WISP_WS_URL__ = 'wss://fetch.stare.network/wisp/';
    }
    if (!globalThis.__V9_FETCH_PROXY_URL__) {
      globalThis.__V9_FETCH_PROXY_URL__ = 'https://fetch.stare.network/proxy';
    }
  } catch (_) { /* ignore */ }
})();
