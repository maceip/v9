// ESM wrapper for node:stream
// Default export MUST be a constructor (Readable) because Node.js code does:
// import Stream from 'stream'; class Foo extends Stream {}

import { Readable, Writable, Duplex, Transform, PassThrough, pipeline, finished, getDefaultHighWaterMark, setDefaultHighWaterMark, promises } from './streams.js';

export { Readable, Writable, Duplex, Transform, PassThrough, pipeline, finished, getDefaultHighWaterMark, setDefaultHighWaterMark, promises };

export const Stream = Readable;
export function addAbortSignal() {}
export function compose() { throw new Error('stream.compose not implemented'); }
export function destroy() {}
export function isDestroyed() { return false; }
export function isDisturbed() { return false; }
export function isErrored() { return false; }
export function isReadable() { return true; }
export function isWritable() { return true; }
export function duplexPair() { return [new Duplex(), new Duplex()]; }

// Default is Readable constructor with all stream classes attached
Object.assign(Readable, { Stream: Readable, Readable, Writable, Duplex, Transform, PassThrough, pipeline, finished, getDefaultHighWaterMark, setDefaultHighWaterMark, promises, addAbortSignal, compose, destroy, isDestroyed, isDisturbed, isErrored, isReadable, isWritable, duplexPair });
export default Readable;
