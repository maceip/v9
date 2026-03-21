// Auto-generated ESM wrapper for node:http
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 19 exports from Node.js http

import { http } from './http.js';
const _impl = http;

function _notImplemented(name) {
  return class { constructor(...a) { /* http stub */ } };
}

export const Agent = typeof _impl.Agent !== 'undefined' ? _impl.Agent : _notImplemented('http.Agent');
export const ClientRequest = typeof _impl.ClientRequest !== 'undefined' ? _impl.ClientRequest : _notImplemented('http.ClientRequest');
export const CloseEvent = typeof _impl.CloseEvent !== 'undefined' ? _impl.CloseEvent : _notImplemented('http.CloseEvent');
export const IncomingMessage = typeof _impl.IncomingMessage !== 'undefined' ? _impl.IncomingMessage : _notImplemented('http.IncomingMessage');
export const METHODS = typeof _impl.METHODS !== 'undefined' ? _impl.METHODS : _notImplemented('http.METHODS');
export const MessageEvent = typeof _impl.MessageEvent !== 'undefined' ? _impl.MessageEvent : _notImplemented('http.MessageEvent');
export const OutgoingMessage = typeof _impl.OutgoingMessage !== 'undefined' ? _impl.OutgoingMessage : _notImplemented('http.OutgoingMessage');
export const STATUS_CODES = typeof _impl.STATUS_CODES !== 'undefined' ? _impl.STATUS_CODES : _notImplemented('http.STATUS_CODES');
export const Server = typeof _impl.Server !== 'undefined' ? _impl.Server : _notImplemented('http.Server');
export const ServerResponse = typeof _impl.ServerResponse !== 'undefined' ? _impl.ServerResponse : _notImplemented('http.ServerResponse');
export const WebSocket = typeof _impl.WebSocket !== 'undefined' ? _impl.WebSocket : _notImplemented('http.WebSocket');
export const createServer = typeof _impl.createServer !== 'undefined' ? _impl.createServer : _notImplemented('http.createServer');
export const get = typeof _impl.get !== 'undefined' ? _impl.get : _notImplemented('http.get');
export const globalAgent = typeof _impl.globalAgent !== 'undefined' ? _impl.globalAgent : _notImplemented('http.globalAgent');
export const maxHeaderSize = typeof _impl.maxHeaderSize !== 'undefined' ? _impl.maxHeaderSize : _notImplemented('http.maxHeaderSize');
export const request = typeof _impl.request !== 'undefined' ? _impl.request : _notImplemented('http.request');
export const setMaxIdleHTTPParsers = typeof _impl.setMaxIdleHTTPParsers !== 'undefined' ? _impl.setMaxIdleHTTPParsers : _notImplemented('http.setMaxIdleHTTPParsers');
export const validateHeaderName = typeof _impl.validateHeaderName !== 'undefined' ? _impl.validateHeaderName : _notImplemented('http.validateHeaderName');
export const validateHeaderValue = typeof _impl.validateHeaderValue !== 'undefined' ? _impl.validateHeaderValue : _notImplemented('http.validateHeaderValue');

const _module = { Agent, ClientRequest, CloseEvent, IncomingMessage, METHODS, MessageEvent, OutgoingMessage, STATUS_CODES, Server, ServerResponse, WebSocket, createServer, get, globalAgent, maxHeaderSize, request, setMaxIdleHTTPParsers, validateHeaderName, validateHeaderValue };
export default _module;
