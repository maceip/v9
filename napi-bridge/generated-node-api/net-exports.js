// Auto-generated ESM wrapper for node:net
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('net');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('net');
  _defaultExport = mod;
  BlockList = mod.BlockList;
  Server = mod.Server;
  Socket = mod.Socket;
  SocketAddress = mod.SocketAddress;
  Stream = mod.Stream;
  connect = mod.connect;
  createConnection = mod.createConnection;
  createServer = mod.createServer;
  getDefaultAutoSelectFamily = mod.getDefaultAutoSelectFamily;
  getDefaultAutoSelectFamilyAttemptTimeout = mod.getDefaultAutoSelectFamilyAttemptTimeout;
  isIP = mod.isIP;
  isIPv4 = mod.isIPv4;
  isIPv6 = mod.isIPv6;
  setDefaultAutoSelectFamily = mod.setDefaultAutoSelectFamily;
  setDefaultAutoSelectFamilyAttemptTimeout = mod.setDefaultAutoSelectFamilyAttemptTimeout;
}
export let BlockList;
export let Server;
export let Socket;
export let SocketAddress;
export let Stream;
export let connect;
export let createConnection;
export let createServer;
export let getDefaultAutoSelectFamily;
export let getDefaultAutoSelectFamilyAttemptTimeout;
export let isIP;
export let isIPv4;
export let isIPv6;
export let setDefaultAutoSelectFamily;
export let setDefaultAutoSelectFamilyAttemptTimeout;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('net', _syncNodeApiModuleBindings);
