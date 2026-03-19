// Auto-generated ESM wrapper for node:events
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 15 exports from Node.js events

import * as _mod from './eventemitter.js';
const _impl = _mod.default || _mod;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const EventEmitter = typeof _impl.EventEmitter !== 'undefined' ? _impl.EventEmitter : _notImplemented('events.EventEmitter');
export const EventEmitterAsyncResource = typeof _impl.EventEmitterAsyncResource !== 'undefined' ? _impl.EventEmitterAsyncResource : _notImplemented('events.EventEmitterAsyncResource');
export const addAbortListener = typeof _impl.addAbortListener !== 'undefined' ? _impl.addAbortListener : _notImplemented('events.addAbortListener');
export const captureRejectionSymbol = typeof _impl.captureRejectionSymbol !== 'undefined' ? _impl.captureRejectionSymbol : _notImplemented('events.captureRejectionSymbol');
export const captureRejections = typeof _impl.captureRejections !== 'undefined' ? _impl.captureRejections : _notImplemented('events.captureRejections');
export const defaultMaxListeners = typeof _impl.defaultMaxListeners !== 'undefined' ? _impl.defaultMaxListeners : _notImplemented('events.defaultMaxListeners');
export const errorMonitor = typeof _impl.errorMonitor !== 'undefined' ? _impl.errorMonitor : _notImplemented('events.errorMonitor');
export const getEventListeners = typeof _impl.getEventListeners !== 'undefined' ? _impl.getEventListeners : _notImplemented('events.getEventListeners');
export const getMaxListeners = typeof _impl.getMaxListeners !== 'undefined' ? _impl.getMaxListeners : _notImplemented('events.getMaxListeners');
export const init = typeof _impl.init !== 'undefined' ? _impl.init : _notImplemented('events.init');
export const listenerCount = typeof _impl.listenerCount !== 'undefined' ? _impl.listenerCount : _notImplemented('events.listenerCount');
export const on = typeof _impl.on !== 'undefined' ? _impl.on : _notImplemented('events.on');
export const once = typeof _impl.once !== 'undefined' ? _impl.once : _notImplemented('events.once');
export const setMaxListeners = typeof _impl.setMaxListeners !== 'undefined' ? _impl.setMaxListeners : _notImplemented('events.setMaxListeners');
export const usingDomains = typeof _impl.usingDomains !== 'undefined' ? _impl.usingDomains : _notImplemented('events.usingDomains');

const _module = { EventEmitter, EventEmitterAsyncResource, addAbortListener, captureRejectionSymbol, captureRejections, defaultMaxListeners, errorMonitor, getEventListeners, getMaxListeners, init, listenerCount, on, once, setMaxListeners, usingDomains };
export default _module;
