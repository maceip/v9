/**
 * https — ESM re-exports for browser import { request } from "node:https".
 *
 * Thin wrapper around https from http.js.
 */
import { https } from './http.js';

export const {
  request, get, createServer, Agent, globalAgent,
  ClientRequest, IncomingMessage, ServerResponse,
} = https;

export default https;
