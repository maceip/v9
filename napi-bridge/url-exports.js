// Auto-generated ESM wrapper for node:url
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 14 exports from Node.js url

import { urlBridge } from './browser-builtins.js';
const _impl = urlBridge;

function _notImplemented(name) {
  return class { constructor(...a) { /* url stub */ } };
}

export const URL = typeof _impl.URL !== 'undefined' ? _impl.URL : _notImplemented('url.URL');
export const URLPattern = typeof _impl.URLPattern !== 'undefined' ? _impl.URLPattern : _notImplemented('url.URLPattern');
export const URLSearchParams = typeof _impl.URLSearchParams !== 'undefined' ? _impl.URLSearchParams : _notImplemented('url.URLSearchParams');
export const Url = typeof _impl.Url !== 'undefined' ? _impl.Url : _notImplemented('url.Url');
export const domainToASCII = typeof _impl.domainToASCII !== 'undefined' ? _impl.domainToASCII : _notImplemented('url.domainToASCII');
export const domainToUnicode = typeof _impl.domainToUnicode !== 'undefined' ? _impl.domainToUnicode : _notImplemented('url.domainToUnicode');
export const fileURLToPath = typeof _impl.fileURLToPath !== 'undefined' ? _impl.fileURLToPath : _notImplemented('url.fileURLToPath');
export const fileURLToPathBuffer = typeof _impl.fileURLToPathBuffer !== 'undefined' ? _impl.fileURLToPathBuffer : _notImplemented('url.fileURLToPathBuffer');
export const format = typeof _impl.format !== 'undefined' ? _impl.format : _notImplemented('url.format');
export const parse = typeof _impl.parse !== 'undefined' ? _impl.parse : _notImplemented('url.parse');
export const pathToFileURL = typeof _impl.pathToFileURL !== 'undefined' ? _impl.pathToFileURL : _notImplemented('url.pathToFileURL');
export const resolve = typeof _impl.resolve !== 'undefined' ? _impl.resolve : _notImplemented('url.resolve');
export const resolveObject = typeof _impl.resolveObject !== 'undefined' ? _impl.resolveObject : _notImplemented('url.resolveObject');
export const urlToHttpOptions = typeof _impl.urlToHttpOptions !== 'undefined' ? _impl.urlToHttpOptions : _notImplemented('url.urlToHttpOptions');

const _module = { URL, URLPattern, URLSearchParams, Url, domainToASCII, domainToUnicode, fileURLToPath, fileURLToPathBuffer, format, parse, pathToFileURL, resolve, resolveObject, urlToHttpOptions };
export default _module;
