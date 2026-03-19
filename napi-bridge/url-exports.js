/**
 * url — ESM re-exports for browser import { fileURLToPath } from "node:url".
 *
 * Thin wrapper around urlBridge from browser-builtins.js.
 */
import { urlBridge } from './browser-builtins.js';

export const { URL, URLSearchParams, parse, format, fileURLToPath, pathToFileURL } = urlBridge;

export default urlBridge;
