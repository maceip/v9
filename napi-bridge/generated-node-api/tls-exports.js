// Auto-generated ESM wrapper for node:tls
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('tls');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('tls');
  _defaultExport = mod;
  CLIENT_RENEG_LIMIT = mod.CLIENT_RENEG_LIMIT;
  CLIENT_RENEG_WINDOW = mod.CLIENT_RENEG_WINDOW;
  DEFAULT_CIPHERS = mod.DEFAULT_CIPHERS;
  DEFAULT_ECDH_CURVE = mod.DEFAULT_ECDH_CURVE;
  DEFAULT_MAX_VERSION = mod.DEFAULT_MAX_VERSION;
  DEFAULT_MIN_VERSION = mod.DEFAULT_MIN_VERSION;
  SecureContext = mod.SecureContext;
  Server = mod.Server;
  TLSSocket = mod.TLSSocket;
  checkServerIdentity = mod.checkServerIdentity;
  connect = mod.connect;
  convertALPNProtocols = mod.convertALPNProtocols;
  createSecureContext = mod.createSecureContext;
  createSecurePair = mod.createSecurePair;
  createServer = mod.createServer;
  getCACertificates = mod.getCACertificates;
  getCiphers = mod.getCiphers;
  rootCertificates = mod.rootCertificates;
  setDefaultCACertificates = mod.setDefaultCACertificates;
}
export let CLIENT_RENEG_LIMIT;
export let CLIENT_RENEG_WINDOW;
export let DEFAULT_CIPHERS;
export let DEFAULT_ECDH_CURVE;
export let DEFAULT_MAX_VERSION;
export let DEFAULT_MIN_VERSION;
export let SecureContext;
export let Server;
export let TLSSocket;
export let checkServerIdentity;
export let connect;
export let convertALPNProtocols;
export let createSecureContext;
export let createSecurePair;
export let createServer;
export let getCACertificates;
export let getCiphers;
export let rootCertificates;
export let setDefaultCACertificates;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('tls', _syncNodeApiModuleBindings);
