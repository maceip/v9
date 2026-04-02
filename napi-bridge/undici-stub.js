/**
 * undici — Browser stub that delegates through transport-policy (fetch / optional proxy).
 *
 * Gemini CLI imports undici for HTTP requests and proxy support.
 * In the browser, HTTP goes to browserHttpFetch() so NODEJS_IN_TAB_FETCH_PROXY
 * applies consistently with node:http bridge — see transport-policy.mjs.
 */

import { EventEmitter } from './eventemitter.js';
import { browserHttpFetch, isNodeHost } from './transport-policy.mjs';

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

let _globalDispatcher = null;

export function setGlobalDispatcher(agent) {
  _globalDispatcher = agent;
}

export function getGlobalDispatcher() {
  if (!_globalDispatcher) _globalDispatcher = new Agent();
  return _globalDispatcher;
}

// ─── fetch / Request / Response ─────────────────────────────────────
export function fetch(input, init) {
  if (isNodeHost()) return globalThis.fetch(input, init);
  return browserHttpFetch(input, init);
}
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
