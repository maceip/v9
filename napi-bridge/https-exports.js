// Auto-generated ESM wrapper for node:https
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 6 exports from Node.js https

import { https } from './http.js';
const _impl = https;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const Agent = typeof _impl.Agent !== 'undefined' ? _impl.Agent : _notImplemented('https.Agent');
export const Server = typeof _impl.Server !== 'undefined' ? _impl.Server : _notImplemented('https.Server');
export const createServer = typeof _impl.createServer !== 'undefined' ? _impl.createServer : _notImplemented('https.createServer');
export const get = typeof _impl.get !== 'undefined' ? _impl.get : _notImplemented('https.get');
export const globalAgent = typeof _impl.globalAgent !== 'undefined' ? _impl.globalAgent : _notImplemented('https.globalAgent');
export const request = typeof _impl.request !== 'undefined' ? _impl.request : _notImplemented('https.request');

const _module = { Agent, Server, createServer, get, globalAgent, request };
export default _module;
