// Auto-generated ESM wrapper for node:http2
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('http2');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('http2');
  _defaultExport = mod;
  Http2ServerRequest = mod.Http2ServerRequest;
  Http2ServerResponse = mod.Http2ServerResponse;
  connect = mod.connect;
  constants = mod.constants;
  createSecureServer = mod.createSecureServer;
  createServer = mod.createServer;
  getDefaultSettings = mod.getDefaultSettings;
  getPackedSettings = mod.getPackedSettings;
  getUnpackedSettings = mod.getUnpackedSettings;
  performServerHandshake = mod.performServerHandshake;
  sensitiveHeaders = mod.sensitiveHeaders;
}
export let Http2ServerRequest;
export let Http2ServerResponse;
export let connect;
export let constants;
export let createSecureServer;
export let createServer;
export let getDefaultSettings;
export let getPackedSettings;
export let getUnpackedSettings;
export let performServerHandshake;
export let sensitiveHeaders;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('http2', _syncNodeApiModuleBindings);
