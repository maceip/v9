// Auto-generated ESM wrapper for node:net
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 15 exports from Node.js net

import { net } from './net-stubs.js';
const _impl = net;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const BlockList = typeof _impl.BlockList !== 'undefined' ? _impl.BlockList : _notImplemented('net.BlockList');
export const Server = typeof _impl.Server !== 'undefined' ? _impl.Server : _notImplemented('net.Server');
export const Socket = typeof _impl.Socket !== 'undefined' ? _impl.Socket : _notImplemented('net.Socket');
export const SocketAddress = typeof _impl.SocketAddress !== 'undefined' ? _impl.SocketAddress : _notImplemented('net.SocketAddress');
export const Stream = typeof _impl.Stream !== 'undefined' ? _impl.Stream : _notImplemented('net.Stream');
export const connect = typeof _impl.connect !== 'undefined' ? _impl.connect : _notImplemented('net.connect');
export const createConnection = typeof _impl.createConnection !== 'undefined' ? _impl.createConnection : _notImplemented('net.createConnection');
export const createServer = typeof _impl.createServer !== 'undefined' ? _impl.createServer : _notImplemented('net.createServer');
export const getDefaultAutoSelectFamily = typeof _impl.getDefaultAutoSelectFamily !== 'undefined' ? _impl.getDefaultAutoSelectFamily : _notImplemented('net.getDefaultAutoSelectFamily');
export const getDefaultAutoSelectFamilyAttemptTimeout = typeof _impl.getDefaultAutoSelectFamilyAttemptTimeout !== 'undefined' ? _impl.getDefaultAutoSelectFamilyAttemptTimeout : _notImplemented('net.getDefaultAutoSelectFamilyAttemptTimeout');
export const isIP = typeof _impl.isIP !== 'undefined' ? _impl.isIP : _notImplemented('net.isIP');
export const isIPv4 = typeof _impl.isIPv4 !== 'undefined' ? _impl.isIPv4 : _notImplemented('net.isIPv4');
export const isIPv6 = typeof _impl.isIPv6 !== 'undefined' ? _impl.isIPv6 : _notImplemented('net.isIPv6');
export const setDefaultAutoSelectFamily = typeof _impl.setDefaultAutoSelectFamily !== 'undefined' ? _impl.setDefaultAutoSelectFamily : _notImplemented('net.setDefaultAutoSelectFamily');
export const setDefaultAutoSelectFamilyAttemptTimeout = typeof _impl.setDefaultAutoSelectFamilyAttemptTimeout !== 'undefined' ? _impl.setDefaultAutoSelectFamilyAttemptTimeout : _notImplemented('net.setDefaultAutoSelectFamilyAttemptTimeout');

const _module = { BlockList, Server, Socket, SocketAddress, Stream, connect, createConnection, createServer, getDefaultAutoSelectFamily, getDefaultAutoSelectFamilyAttemptTimeout, isIP, isIPv4, isIPv6, setDefaultAutoSelectFamily, setDefaultAutoSelectFamilyAttemptTimeout };
export default _module;
