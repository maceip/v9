/**
 * buffer — ESM re-exports for browser import { Buffer } from "node:buffer".
 *
 * Thin wrapper around bufferBridge from browser-builtins.js.
 */
import { bufferBridge } from './browser-builtins.js';

export const Buffer = bufferBridge;
export const kMaxLength = 2 ** 31 - 1;
export const constants = { MAX_LENGTH: 2 ** 31 - 1, MAX_STRING_LENGTH: 2 ** 28 - 16 };
export const SlowBuffer = bufferBridge;
export const Blob = globalThis.Blob;

export default { Buffer, kMaxLength, constants, SlowBuffer, Blob };
