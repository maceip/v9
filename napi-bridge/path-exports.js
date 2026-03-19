/**
 * path — ESM re-exports for browser import { join, dirname } from "node:path".
 *
 * Thin wrapper around pathBridge from browser-builtins.js.
 */
import { pathBridge } from './browser-builtins.js';

export const {
  sep, delimiter, join, normalize, resolve, dirname, basename,
  extname, isAbsolute, relative, parse, format,
} = pathBridge;

export const posix = pathBridge;
export const win32 = pathBridge;

export default pathBridge;
