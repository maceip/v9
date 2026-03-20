// ESM wrapper for node:stream
// Wraps classes with Proxy so they can be called without 'new' (CJS compat)
import { Readable as _R, Writable as _W, Duplex as _D, Transform as _T, PassThrough as _PT, pipeline, finished, getDefaultHighWaterMark, setDefaultHighWaterMark, promises } from './streams.js';

function _wrap(Cls) { return new Proxy(Cls, { apply(t, _, a) { return new t(...a); } }); }

export const Readable = _wrap(_R);
export const Writable = _wrap(_W);
export const Duplex = _wrap(_D);
export const Transform = _wrap(_T);
export const PassThrough = _wrap(_PT);
export const Stream = Readable;

export { pipeline, finished, getDefaultHighWaterMark, setDefaultHighWaterMark, promises };

export function addAbortSignal() {}
export function compose() { throw new Error('stream.compose not implemented'); }
export function destroy() {}
export function isDestroyed() { return false; }
export function isDisturbed() { return false; }
export function isErrored() { return false; }
export function isReadable() { return true; }
export function isWritable() { return true; }
export function duplexPair() { return [new Duplex(), new Duplex()]; }

Object.assign(Readable, { Stream: Readable, Readable, Writable, Duplex, Transform, PassThrough, pipeline, finished, getDefaultHighWaterMark, setDefaultHighWaterMark, promises, addAbortSignal, compose, destroy, isDestroyed, isDisturbed, isErrored, isReadable, isWritable, duplexPair });
export default Readable;
