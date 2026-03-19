/**
 * crypto — ESM re-exports for browser import { createHash } from "node:crypto".
 *
 * Thin wrapper around cryptoBridge from browser-builtins.js.
 */
import { cryptoBridge } from './browser-builtins.js';

export const { createHash, createHmac, randomBytes, randomUUID } = cryptoBridge;

export default cryptoBridge;
