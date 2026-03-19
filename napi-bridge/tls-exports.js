// Auto-generated ESM wrapper for node:tls
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 18 exports from Node.js tls

import { tls } from './net-stubs.js';
const _impl = tls;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const CLIENT_RENEG_LIMIT = typeof _impl.CLIENT_RENEG_LIMIT !== 'undefined' ? _impl.CLIENT_RENEG_LIMIT : _notImplemented('tls.CLIENT_RENEG_LIMIT');
export const CLIENT_RENEG_WINDOW = typeof _impl.CLIENT_RENEG_WINDOW !== 'undefined' ? _impl.CLIENT_RENEG_WINDOW : _notImplemented('tls.CLIENT_RENEG_WINDOW');
export const DEFAULT_CIPHERS = typeof _impl.DEFAULT_CIPHERS !== 'undefined' ? _impl.DEFAULT_CIPHERS : _notImplemented('tls.DEFAULT_CIPHERS');
export const DEFAULT_ECDH_CURVE = typeof _impl.DEFAULT_ECDH_CURVE !== 'undefined' ? _impl.DEFAULT_ECDH_CURVE : _notImplemented('tls.DEFAULT_ECDH_CURVE');
export const DEFAULT_MAX_VERSION = typeof _impl.DEFAULT_MAX_VERSION !== 'undefined' ? _impl.DEFAULT_MAX_VERSION : _notImplemented('tls.DEFAULT_MAX_VERSION');
export const DEFAULT_MIN_VERSION = typeof _impl.DEFAULT_MIN_VERSION !== 'undefined' ? _impl.DEFAULT_MIN_VERSION : _notImplemented('tls.DEFAULT_MIN_VERSION');
export const SecureContext = typeof _impl.SecureContext !== 'undefined' ? _impl.SecureContext : _notImplemented('tls.SecureContext');
export const Server = typeof _impl.Server !== 'undefined' ? _impl.Server : _notImplemented('tls.Server');
export const TLSSocket = typeof _impl.TLSSocket !== 'undefined' ? _impl.TLSSocket : _notImplemented('tls.TLSSocket');
export const checkServerIdentity = typeof _impl.checkServerIdentity !== 'undefined' ? _impl.checkServerIdentity : _notImplemented('tls.checkServerIdentity');
export const connect = typeof _impl.connect !== 'undefined' ? _impl.connect : _notImplemented('tls.connect');
export const convertALPNProtocols = typeof _impl.convertALPNProtocols !== 'undefined' ? _impl.convertALPNProtocols : _notImplemented('tls.convertALPNProtocols');
export const createSecureContext = typeof _impl.createSecureContext !== 'undefined' ? _impl.createSecureContext : _notImplemented('tls.createSecureContext');
export const createServer = typeof _impl.createServer !== 'undefined' ? _impl.createServer : _notImplemented('tls.createServer');
export const getCACertificates = typeof _impl.getCACertificates !== 'undefined' ? _impl.getCACertificates : _notImplemented('tls.getCACertificates');
export const getCiphers = typeof _impl.getCiphers !== 'undefined' ? _impl.getCiphers : _notImplemented('tls.getCiphers');
export const rootCertificates = typeof _impl.rootCertificates !== 'undefined' ? _impl.rootCertificates : _notImplemented('tls.rootCertificates');
export const setDefaultCACertificates = typeof _impl.setDefaultCACertificates !== 'undefined' ? _impl.setDefaultCACertificates : _notImplemented('tls.setDefaultCACertificates');

const _module = { CLIENT_RENEG_LIMIT, CLIENT_RENEG_WINDOW, DEFAULT_CIPHERS, DEFAULT_ECDH_CURVE, DEFAULT_MAX_VERSION, DEFAULT_MIN_VERSION, SecureContext, Server, TLSSocket, checkServerIdentity, connect, convertALPNProtocols, createSecureContext, createServer, getCACertificates, getCiphers, rootCertificates, setDefaultCACertificates };
export default _module;
