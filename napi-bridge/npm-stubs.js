// Stubs for npm packages that get externalized from CLI bundles.
// These provide enough exports to not crash at import time.
// The actual functionality they provide isn't needed in the browser runtime.

// execa — shell execution (we use our child_process shim instead)
export function execa() { throw new Error('execa not available in browser — use child_process'); }
export function execaSync() { throw new Error('execaSync not available in browser'); }
export function execaCommand() { throw new Error('execaCommand not available in browser'); }
export function execaCommandSync() { throw new Error('execaCommandSync not available in browser'); }
export const $ = execa;

// read-pkg
export function readPackage() { return Promise.resolve({}); }
export function readPackageSync() { return {}; }

// npm-run-path
export function npmRunPath() { return process.env.PATH || ''; }
export function npmRunPathEnv() { return { ...process.env }; }

// unicorn-magic
export function conditionGuard() { return true; }

// @vscode/ripgrep — path to rg binary
export const rgPath = '/usr/bin/rg';

// aws4fetch
export class AwsClient { constructor() {} sign() { return {}; } fetch() { return globalThis.fetch(...arguments); } }
export class AwsV4Signer { constructor() {} sign() { return Promise.resolve({}); } }

// open — open URLs/files in a popup; intercept OAuth localhost redirects
export default function open(url) {
  if (typeof url !== 'string') return Promise.resolve();

  // Check if this URL has a redirect_uri pointing to a localhost fake server
  const fakeServers = globalThis.__fakeServers || {};
  const ports = Object.keys(fakeServers);

  // Open in a popup
  const popup = window.open(url, '_blank', 'width=600,height=700,popup=yes');
  if (!popup) {
    console.warn('[open] Popup blocked — user may need to allow popups');
    return Promise.resolve();
  }

  // If we have fake servers, poll the popup URL for a localhost redirect
  if (ports.length > 0) {
    const pollInterval = setInterval(() => {
      try {
        if (popup.closed) { clearInterval(pollInterval); return; }
        // Try reading the popup location — works when it redirects to localhost
        // (which fails to load, but the URL is readable in some contexts)
        const loc = popup.location.href;
        if (!loc) return;

        // Check if it redirected to one of our fake server ports
        for (const port of ports) {
          if (loc.includes(`localhost:${port}`) || loc.includes(`127.0.0.1:${port}`)) {
            clearInterval(pollInterval);
            popup.close();
            fakeServers[port]._handleRedirect(loc);
            return;
          }
        }
      } catch {
        // Cross-origin — popup is on a different domain (expected during auth).
        // We'll keep polling until it redirects to localhost.
      }
    }, 500);

    // Give up after 5 minutes
    setTimeout(() => clearInterval(pollInterval), 300000);
  }

  return Promise.resolve();
}

// pino — logger
export function pino() {
  const noop = () => {};
  const logger = { trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop, child: () => logger, level: 'silent', isLevelEnabled: () => false, bindings: () => ({}), flush: noop, silent: noop };
  return logger;
}
pino.destination = () => ({ write: () => true });
pino.transport = () => ({ write: () => true });

// require-in-the-middle / import-in-the-middle (OpenTelemetry hooks)
export class Hook { constructor() {} unhook() {} }

// stack-utils
export class StackUtils { constructor() {} clean() { return ''; } parse() { return []; } parseLine() { return null; } static nodeInternals() { return [/node:/]; } }

// bufferutil / utf-8-validate — WebSocket native addons (browser WebSocket handles this)
export const BufferUtil = { mask() {}, unmask() {} };

// supports-color
export const supportsColor = { stdout: { level: 3, hasBasic: true, has256: true, has16m: true }, stderr: { level: 3, hasBasic: true, has256: true, has16m: true } };
export function createSupportsColor() { return supportsColor; }

// domain (deprecated Node.js module)
export function create() { return { run(fn) { fn(); }, on() {}, add() {}, remove() {}, bind(fn) { return fn; }, intercept(fn) { return fn; }, enter() {}, exit() {} }; }
export const active = null;

export const __esModule = true;
