// ESM wrapper for node:buffer
import { bufferBridge } from './browser-builtins.js';

export const Buffer = bufferBridge;
export const constants = { MAX_LENGTH: 2 ** 31 - 1, MAX_STRING_LENGTH: 2 ** 28 - 16 };
export const kMaxLength = 2 ** 31 - 1;
export const kStringMaxLength = 2 ** 28 - 16;
export const SlowBuffer = bufferBridge;
export const Blob = globalThis.Blob || class Blob {};
export const File = globalThis.File || class File {};
export const atob = globalThis.atob || function() { throw new Error('atob not available'); };
export const btoa = globalThis.btoa || function() { throw new Error('btoa not available'); };
export function isAscii() { return false; }
export function isUtf8() { return true; }
export function transcode() { throw new Error('transcode not implemented in browser runtime'); }
export function resolveObjectURL() { throw new Error('resolveObjectURL not implemented'); }

const _module = { Buffer, constants, kMaxLength, kStringMaxLength, SlowBuffer, Blob, File, atob, btoa, isAscii, isUtf8, transcode, resolveObjectURL };
export default _module;
