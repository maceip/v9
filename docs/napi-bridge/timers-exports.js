// Auto-generated ESM wrapper for node:timers
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 7 exports from Node.js timers

import timersModule from './timers-promises.js';

function _notImplemented(name) {
  return class { constructor(...a) { /* timers stub */ } };
}

export const clearImmediate = typeof timersModule.clearImmediate !== 'undefined' ? timersModule.clearImmediate : _notImplemented('timers.clearImmediate');
export const clearInterval = typeof timersModule.clearInterval !== 'undefined' ? timersModule.clearInterval : _notImplemented('timers.clearInterval');
export const clearTimeout = typeof timersModule.clearTimeout !== 'undefined' ? timersModule.clearTimeout : _notImplemented('timers.clearTimeout');
export const promises = typeof timersModule.promises !== 'undefined' ? timersModule.promises : _notImplemented('timers.promises');
export const setImmediate = typeof timersModule.setImmediate !== 'undefined' ? timersModule.setImmediate : _notImplemented('timers.setImmediate');
export const setInterval = typeof timersModule.setInterval !== 'undefined' ? timersModule.setInterval : _notImplemented('timers.setInterval');
export const setTimeout = typeof timersModule.setTimeout !== 'undefined' ? timersModule.setTimeout : _notImplemented('timers.setTimeout');

const _module = { clearImmediate, clearInterval, clearTimeout, promises, setImmediate, setInterval, setTimeout };
export default _module;
