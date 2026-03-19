/**
 * http — ESM re-exports for browser import { request, createServer } from "node:http".
 *
 * Thin wrapper around http from http.js.
 */
import { http } from './http.js';

export const {
  request, get, createServer, Agent, globalAgent,
  ClientRequest, IncomingMessage, ServerResponse,
  METHODS, STATUS_CODES,
} = http;

export default http;
