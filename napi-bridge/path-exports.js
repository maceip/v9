// Auto-generated ESM wrapper for node:path
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 16 exports from Node.js path

import { pathBridge } from './browser-builtins.js';
const _impl = pathBridge;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const basename = typeof _impl.basename !== 'undefined' ? _impl.basename : _notImplemented('path.basename');
export const delimiter = typeof _impl.delimiter !== 'undefined' ? _impl.delimiter : _notImplemented('path.delimiter');
export const dirname = typeof _impl.dirname !== 'undefined' ? _impl.dirname : _notImplemented('path.dirname');
export const extname = typeof _impl.extname !== 'undefined' ? _impl.extname : _notImplemented('path.extname');
export const format = typeof _impl.format !== 'undefined' ? _impl.format : _notImplemented('path.format');
export const isAbsolute = typeof _impl.isAbsolute !== 'undefined' ? _impl.isAbsolute : _notImplemented('path.isAbsolute');
export const join = typeof _impl.join !== 'undefined' ? _impl.join : _notImplemented('path.join');
export const matchesGlob = typeof _impl.matchesGlob !== 'undefined' ? _impl.matchesGlob : _notImplemented('path.matchesGlob');
export const normalize = typeof _impl.normalize !== 'undefined' ? _impl.normalize : _notImplemented('path.normalize');
export const parse = typeof _impl.parse !== 'undefined' ? _impl.parse : _notImplemented('path.parse');
export const posix = typeof _impl.posix !== 'undefined' ? _impl.posix : _notImplemented('path.posix');
export const relative = typeof _impl.relative !== 'undefined' ? _impl.relative : _notImplemented('path.relative');
export const resolve = typeof _impl.resolve !== 'undefined' ? _impl.resolve : _notImplemented('path.resolve');
export const sep = typeof _impl.sep !== 'undefined' ? _impl.sep : _notImplemented('path.sep');
export const toNamespacedPath = typeof _impl.toNamespacedPath !== 'undefined' ? _impl.toNamespacedPath : _notImplemented('path.toNamespacedPath');
export const win32 = typeof _impl.win32 !== 'undefined' ? _impl.win32 : _notImplemented('path.win32');

const _module = { basename, delimiter, dirname, extname, format, isAbsolute, join, matchesGlob, normalize, parse, posix, relative, resolve, sep, toNamespacedPath, win32 };
export default _module;
