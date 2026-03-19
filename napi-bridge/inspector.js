/**
 * inspector — Node.js-compatible inspector stub for browser/Wasm.
 *
 * Claude Code imports but doesn't actively use inspector.
 */

export function open() {}
export function close() {}
export function url() { return undefined; }
export function waitForDebugger() {}

export class Session {
  constructor() {
    throw new Error('inspector.Session is not available in browser');
  }
}

export const console = { ...globalThis.console };

export default { open, close, url, waitForDebugger, Session, console };
