// ESM wrapper for node:stream/web
// These are browser globals — just re-export them
export const ReadableStream = globalThis.ReadableStream;
export const WritableStream = globalThis.WritableStream;
export const TransformStream = globalThis.TransformStream;
export const ReadableStreamDefaultReader = globalThis.ReadableStreamDefaultReader || class {};
export const ReadableStreamBYOBReader = globalThis.ReadableStreamBYOBReader || class {};
export const ReadableStreamDefaultController = globalThis.ReadableStreamDefaultController || class {};
export const WritableStreamDefaultWriter = globalThis.WritableStreamDefaultWriter || class {};
export const WritableStreamDefaultController = globalThis.WritableStreamDefaultController || class {};
export const TransformStreamDefaultController = globalThis.TransformStreamDefaultController || class {};
export const ByteLengthQueuingStrategy = globalThis.ByteLengthQueuingStrategy || class {};
export const CountQueuingStrategy = globalThis.CountQueuingStrategy || class {};
export default { ReadableStream, WritableStream, TransformStream, ReadableStreamDefaultReader, ReadableStreamBYOBReader, ByteLengthQueuingStrategy, CountQueuingStrategy };
