// Auto-generated ESM wrapper for node:http2
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 11 exports from Node.js http2

import { http } from './http.js';
const _impl = http;

function _notImplemented(name) {
  return class { constructor(...a) { /* http2 stub */ } };
}

export const Http2ServerRequest = typeof _impl.Http2ServerRequest !== 'undefined' ? _impl.Http2ServerRequest : _notImplemented('http2.Http2ServerRequest');
export const Http2ServerResponse = typeof _impl.Http2ServerResponse !== 'undefined' ? _impl.Http2ServerResponse : _notImplemented('http2.Http2ServerResponse');
export const connect = typeof _impl.connect !== 'undefined' ? _impl.connect : _notImplemented('http2.connect');
export const constants = typeof _impl.constants !== 'undefined' ? _impl.constants : _notImplemented('http2.constants');
export const createSecureServer = typeof _impl.createSecureServer !== 'undefined' ? _impl.createSecureServer : _notImplemented('http2.createSecureServer');
export const createServer = typeof _impl.createServer !== 'undefined' ? _impl.createServer : _notImplemented('http2.createServer');
export const getDefaultSettings = typeof _impl.getDefaultSettings !== 'undefined' ? _impl.getDefaultSettings : _notImplemented('http2.getDefaultSettings');
export const getPackedSettings = typeof _impl.getPackedSettings !== 'undefined' ? _impl.getPackedSettings : _notImplemented('http2.getPackedSettings');
export const getUnpackedSettings = typeof _impl.getUnpackedSettings !== 'undefined' ? _impl.getUnpackedSettings : _notImplemented('http2.getUnpackedSettings');
export const performServerHandshake = typeof _impl.performServerHandshake !== 'undefined' ? _impl.performServerHandshake : _notImplemented('http2.performServerHandshake');
export const sensitiveHeaders = typeof _impl.sensitiveHeaders !== 'undefined' ? _impl.sensitiveHeaders : _notImplemented('http2.sensitiveHeaders');

const _module = { Http2ServerRequest, Http2ServerResponse, connect, constants, createSecureServer, createServer, getDefaultSettings, getPackedSettings, getUnpackedSettings, performServerHandshake, sensitiveHeaders };
export default _module;
