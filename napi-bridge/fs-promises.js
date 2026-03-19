/**
 * fs/promises — ESM re-exports for browser import { readFile } from "node:fs/promises".
 *
 * Thin wrapper around fs.promises from fs.js.
 */
import fs from './fs.js';

const promises = fs.promises;

export const {
  readFile, writeFile, readdir, stat, lstat, mkdir, unlink, rename,
  access, realpath, rmdir, chmod, copyFile, rm,
} = promises;

export default promises;
