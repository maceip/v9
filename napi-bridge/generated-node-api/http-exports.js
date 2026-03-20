// Auto-generated ESM wrapper for node:http
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('http');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('http');
  _defaultExport = mod;
  Agent = mod.Agent;
  ClientRequest = mod.ClientRequest;
  CloseEvent = mod.CloseEvent;
  IncomingMessage = mod.IncomingMessage;
  METHODS = mod.METHODS;
  MessageEvent = mod.MessageEvent;
  OutgoingMessage = mod.OutgoingMessage;
  STATUS_CODES = mod.STATUS_CODES;
  Server = mod.Server;
  ServerResponse = mod.ServerResponse;
  WebSocket = mod.WebSocket;
  createServer = mod.createServer;
  get = mod.get;
  globalAgent = mod.globalAgent;
  maxHeaderSize = mod.maxHeaderSize;
  request = mod.request;
  setMaxIdleHTTPParsers = mod.setMaxIdleHTTPParsers;
  validateHeaderName = mod.validateHeaderName;
  validateHeaderValue = mod.validateHeaderValue;
}
export let Agent;
export let ClientRequest;
export let CloseEvent;
export let IncomingMessage;
export let METHODS;
export let MessageEvent;
export let OutgoingMessage;
export let STATUS_CODES;
export let Server;
export let ServerResponse;
export let WebSocket;
export let createServer;
export let get;
export let globalAgent;
export let maxHeaderSize;
export let request;
export let setMaxIdleHTTPParsers;
export let validateHeaderName;
export let validateHeaderValue;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('http', _syncNodeApiModuleBindings);
