/**
 * net/tls/dns — ESM re-exports for browser import { Socket } from "node:net".
 *
 * The import map points node:net, node:tls, and node:dns all here.
 * Re-exports everything from net-stubs.js as named exports.
 */
import { net, tls, dns } from './net-stubs.js';

// net exports
export const {
  Socket, Server, createServer, createConnection, connect,
  isIP, isIPv4, isIPv6,
} = net;

// tls exports (prefixed to avoid collision with net.connect)
export const TLSSocket = tls.TLSSocket;
export const createSecureContext = tls.createSecureContext;
export const DEFAULT_MIN_VERSION = tls.DEFAULT_MIN_VERSION;
export const DEFAULT_MAX_VERSION = tls.DEFAULT_MAX_VERSION;

// dns exports
export const lookup = dns.lookup;
export const resolve = dns.resolve;
export const resolve4 = dns.resolve4;
export const resolve6 = dns.resolve6;
export const reverse = dns.reverse;

export { net, tls, dns };
export default { net, tls, dns };
