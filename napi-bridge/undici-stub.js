/**
 * undici — Browser stub that delegates to native fetch().
 *
 * Gemini CLI imports undici for HTTP requests and proxy support.
 * In the browser, we delegate to native fetch() and stub proxy agents
 * as no-ops (browser handles proxies at the network layer).
 */

import { EventEmitter } from './eventemitter.js';

// ─── Agent stubs ────────────────────────────────────────────────────
// Gemini CLI imports Agent, ProxyAgent, EnvHttpProxyAgent from undici.
// In browser, we don't need proxy agents — native fetch handles it.

export class Agent extends EventEmitter {
  constructor(opts) {
    super();
    this.opts = opts || {};
  }
  dispatch() {}
  close() { return Promise.resolve(); }
  destroy() { return Promise.resolve(); }
}

export class ProxyAgent extends Agent {
  constructor(opts) {
    super(typeof opts === 'string' ? { uri: opts } : opts);
  }
}

export class EnvHttpProxyAgent extends Agent {
  constructor(opts) {
    super(opts);
  }
}

export function setGlobalDispatcher(agent) {
  // No-op in browser
}

export function getGlobalDispatcher() {
  return new Agent();
}

// ─── fetch / Request / Response pass-through ────────────────────────
// Use native browser implementations directly.

export const fetch = globalThis.fetch.bind(globalThis);
export const Request = globalThis.Request;
export const Response = globalThis.Response;
export const Headers = globalThis.Headers;
export const FormData = globalThis.FormData;

export default {
  Agent,
  ProxyAgent,
  EnvHttpProxyAgent,
  setGlobalDispatcher,
  getGlobalDispatcher,
  fetch,
  Request,
  Response,
  Headers,
  FormData,
};
