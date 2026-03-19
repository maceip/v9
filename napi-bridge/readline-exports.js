// Auto-generated ESM wrapper for node:readline
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 8 exports from Node.js readline

import * as _mod from './readline.js';
const _impl = _mod.default || _mod;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const Interface = typeof _impl.Interface !== 'undefined' ? _impl.Interface : _notImplemented('readline.Interface');
export const clearLine = typeof _impl.clearLine !== 'undefined' ? _impl.clearLine : _notImplemented('readline.clearLine');
export const clearScreenDown = typeof _impl.clearScreenDown !== 'undefined' ? _impl.clearScreenDown : _notImplemented('readline.clearScreenDown');
export const createInterface = typeof _impl.createInterface !== 'undefined' ? _impl.createInterface : _notImplemented('readline.createInterface');
export const cursorTo = typeof _impl.cursorTo !== 'undefined' ? _impl.cursorTo : _notImplemented('readline.cursorTo');
export const emitKeypressEvents = typeof _impl.emitKeypressEvents !== 'undefined' ? _impl.emitKeypressEvents : _notImplemented('readline.emitKeypressEvents');
export const moveCursor = typeof _impl.moveCursor !== 'undefined' ? _impl.moveCursor : _notImplemented('readline.moveCursor');
export const promises = typeof _impl.promises !== 'undefined' ? _impl.promises : _notImplemented('readline.promises');

const _module = { Interface, clearLine, clearScreenDown, createInterface, cursorTo, emitKeypressEvents, moveCursor, promises };
export default _module;
