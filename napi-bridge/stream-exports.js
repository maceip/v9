// Auto-generated ESM wrapper for node:stream
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 20 exports from Node.js stream

import * as _mod from './streams.js';
const _impl = _mod.default || _mod;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const Duplex = typeof _impl.Duplex !== 'undefined' ? _impl.Duplex : _notImplemented('stream.Duplex');
export const PassThrough = typeof _impl.PassThrough !== 'undefined' ? _impl.PassThrough : _notImplemented('stream.PassThrough');
export const Readable = typeof _impl.Readable !== 'undefined' ? _impl.Readable : _notImplemented('stream.Readable');
export const Stream = typeof _impl.Stream !== 'undefined' ? _impl.Stream : _notImplemented('stream.Stream');
export const Transform = typeof _impl.Transform !== 'undefined' ? _impl.Transform : _notImplemented('stream.Transform');
export const Writable = typeof _impl.Writable !== 'undefined' ? _impl.Writable : _notImplemented('stream.Writable');
export const addAbortSignal = typeof _impl.addAbortSignal !== 'undefined' ? _impl.addAbortSignal : _notImplemented('stream.addAbortSignal');
export const compose = typeof _impl.compose !== 'undefined' ? _impl.compose : _notImplemented('stream.compose');
export const destroy = typeof _impl.destroy !== 'undefined' ? _impl.destroy : _notImplemented('stream.destroy');
export const duplexPair = typeof _impl.duplexPair !== 'undefined' ? _impl.duplexPair : _notImplemented('stream.duplexPair');
export const finished = typeof _impl.finished !== 'undefined' ? _impl.finished : _notImplemented('stream.finished');
export const getDefaultHighWaterMark = typeof _impl.getDefaultHighWaterMark !== 'undefined' ? _impl.getDefaultHighWaterMark : _notImplemented('stream.getDefaultHighWaterMark');
export const isDestroyed = typeof _impl.isDestroyed !== 'undefined' ? _impl.isDestroyed : _notImplemented('stream.isDestroyed');
export const isDisturbed = typeof _impl.isDisturbed !== 'undefined' ? _impl.isDisturbed : _notImplemented('stream.isDisturbed');
export const isErrored = typeof _impl.isErrored !== 'undefined' ? _impl.isErrored : _notImplemented('stream.isErrored');
export const isReadable = typeof _impl.isReadable !== 'undefined' ? _impl.isReadable : _notImplemented('stream.isReadable');
export const isWritable = typeof _impl.isWritable !== 'undefined' ? _impl.isWritable : _notImplemented('stream.isWritable');
export const pipeline = typeof _impl.pipeline !== 'undefined' ? _impl.pipeline : _notImplemented('stream.pipeline');
export const promises = typeof _impl.promises !== 'undefined' ? _impl.promises : _notImplemented('stream.promises');
export const setDefaultHighWaterMark = typeof _impl.setDefaultHighWaterMark !== 'undefined' ? _impl.setDefaultHighWaterMark : _notImplemented('stream.setDefaultHighWaterMark');

const _module = { Duplex, PassThrough, Readable, Stream, Transform, Writable, addAbortSignal, compose, destroy, duplexPair, finished, getDefaultHighWaterMark, isDestroyed, isDisturbed, isErrored, isReadable, isWritable, pipeline, promises, setDefaultHighWaterMark };
export default _module;
