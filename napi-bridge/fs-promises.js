/**
 * fs/promises — ESM re-exports for browser import { readFile } from "node:fs/promises".
 *
 * Thin wrapper around fs.promises from fs.js.
 */
import fs from './fs.js';

const promises = fs.promises || {};

function _stub(name) {
  return async function() { throw new Error(`fs.promises.${name} is not implemented in the browser runtime`); };
}

export const readFile = promises.readFile || _stub('readFile');
export const writeFile = promises.writeFile || _stub('writeFile');
export const readdir = promises.readdir || _stub('readdir');
export const stat = promises.stat || _stub('stat');
export const lstat = promises.lstat || _stub('lstat');
export const mkdir = promises.mkdir || _stub('mkdir');
export const unlink = promises.unlink || _stub('unlink');
export const rename = promises.rename || _stub('rename');
export const access = promises.access || _stub('access');
export const realpath = promises.realpath || _stub('realpath');
export const rmdir = promises.rmdir || _stub('rmdir');
export const chmod = promises.chmod || _stub('chmod');
export const copyFile = promises.copyFile || _stub('copyFile');
export const rm = promises.rm || _stub('rm');
export const appendFile = promises.appendFile || _stub('appendFile');
export const symlink = promises.symlink || _stub('symlink');
export const link = promises.link || _stub('link');
export const mkdtemp = promises.mkdtemp || _stub('mkdtemp');
export const open = promises.open || _stub('open');
export const readlink = promises.readlink || _stub('readlink');
export const truncate = promises.truncate || _stub('truncate');
export const utimes = promises.utimes || _stub('utimes');
export const watch = promises.watch || _stub('watch');
export const cp = promises.cp || _stub('cp');
export const glob = promises.glob || _stub('glob');
export const opendir = promises.opendir || _stub('opendir');
export const chown = promises.chown || _stub('chown');
export const lchmod = promises.lchmod || _stub('lchmod');
export const lchown = promises.lchown || _stub('lchown');
export const lutimes = promises.lutimes || _stub('lutimes');
export const statfs = promises.statfs || _stub('statfs');
export const constants = fs.constants || {};

const _module = {
  readFile, writeFile, readdir, stat, lstat, mkdir, unlink, rename,
  access, realpath, rmdir, chmod, copyFile, rm, appendFile, symlink,
  link, mkdtemp, open, opendir, readlink, truncate, utimes, watch,
  cp, glob, chown, lchmod, lchown, lutimes, statfs, constants,
};
export default _module;
