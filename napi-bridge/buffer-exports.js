/**
 * buffer — ESM re-exports for browser import { Buffer } from "node:buffer".
 *
 * Thin wrapper around bufferBridge from browser-builtins.js.
 */
import { bufferBridge } from './browser-builtins.js';

export const Buffer = bufferBridge;
export const kMaxLength = 2 ** 31 - 1;

export default { Buffer, kMaxLength };
