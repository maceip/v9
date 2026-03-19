// Auto-generated ESM wrapper for node:tty
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 3 exports from Node.js tty

import * as _mod from './tty.js';
const _impl = _mod.default || _mod;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const ReadStream = typeof _impl.ReadStream !== 'undefined' ? _impl.ReadStream : _notImplemented('tty.ReadStream');
export const WriteStream = typeof _impl.WriteStream !== 'undefined' ? _impl.WriteStream : _notImplemented('tty.WriteStream');
export const isatty = typeof _impl.isatty !== 'undefined' ? _impl.isatty : _notImplemented('tty.isatty');

const _module = { ReadStream, WriteStream, isatty };
export default _module;
