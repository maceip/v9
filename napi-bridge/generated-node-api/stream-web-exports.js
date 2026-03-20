// Auto-generated ESM wrapper for node:stream/web
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('stream/web');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('stream/web');
  _defaultExport = mod;
  ByteLengthQueuingStrategy = mod.ByteLengthQueuingStrategy;
  CompressionStream = mod.CompressionStream;
  CountQueuingStrategy = mod.CountQueuingStrategy;
  DecompressionStream = mod.DecompressionStream;
  ReadableByteStreamController = mod.ReadableByteStreamController;
  ReadableStream = mod.ReadableStream;
  ReadableStreamBYOBReader = mod.ReadableStreamBYOBReader;
  ReadableStreamBYOBRequest = mod.ReadableStreamBYOBRequest;
  ReadableStreamDefaultController = mod.ReadableStreamDefaultController;
  ReadableStreamDefaultReader = mod.ReadableStreamDefaultReader;
  TextDecoderStream = mod.TextDecoderStream;
  TextEncoderStream = mod.TextEncoderStream;
  TransformStream = mod.TransformStream;
  TransformStreamDefaultController = mod.TransformStreamDefaultController;
  WritableStream = mod.WritableStream;
  WritableStreamDefaultController = mod.WritableStreamDefaultController;
  WritableStreamDefaultWriter = mod.WritableStreamDefaultWriter;
}
export let ByteLengthQueuingStrategy;
export let CompressionStream;
export let CountQueuingStrategy;
export let DecompressionStream;
export let ReadableByteStreamController;
export let ReadableStream;
export let ReadableStreamBYOBReader;
export let ReadableStreamBYOBRequest;
export let ReadableStreamDefaultController;
export let ReadableStreamDefaultReader;
export let TextDecoderStream;
export let TextEncoderStream;
export let TransformStream;
export let TransformStreamDefaultController;
export let WritableStream;
export let WritableStreamDefaultController;
export let WritableStreamDefaultWriter;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('stream/web', _syncNodeApiModuleBindings);
