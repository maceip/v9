/**
 * fs — ESM re-exports for browser import { readFileSync } from "node:fs".
 *
 * Thin wrapper around the default fs module from fs.js.
 */
import fs from './fs.js';

export const {
  readFileSync, writeFileSync, readdirSync, statSync, mkdirSync,
  unlinkSync, renameSync, existsSync, accessSync, realpathSync,
  openSync, readSync, writeSync, closeSync, rmdirSync,
  readFile, writeFile, readdir, stat, mkdir, unlink, rename,
  access, realpath, open, close, rmdir,
  createReadStream, createWriteStream,
  constants,
} = fs;

export const promises = fs.promises;

export default fs;
