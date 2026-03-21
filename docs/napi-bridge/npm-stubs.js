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

// open — open URLs/files
export default function open() { return Promise.resolve(); }

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
