/**
 * stream/consumers — Node.js-compatible stream consumers for browser/Wasm.
 *
 * Provides text(), json(), arrayBuffer(), buffer(), blob() helpers
 * for consuming Readable streams.
 */

export async function text(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
  }
  return chunks.join('');
}

export async function json(stream) {
  return JSON.parse(await text(stream));
}

export async function arrayBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    if (typeof chunk === 'string') {
      chunks.push(new TextEncoder().encode(chunk));
    } else if (chunk instanceof Uint8Array) {
      chunks.push(chunk);
    } else {
      chunks.push(new Uint8Array(chunk));
    }
  }
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) { result.set(c, offset); offset += c.length; }
  return result.buffer;
}

export async function buffer(stream) {
  const ab = await arrayBuffer(stream);
  // Return Buffer if available, otherwise Uint8Array
  if (typeof globalThis.Buffer !== 'undefined') {
    return globalThis.Buffer.from(ab);
  }
  return new Uint8Array(ab);
}

export async function blob(stream) {
  const ab = await arrayBuffer(stream);
  return new Blob([ab]);
}

export default { text, json, arrayBuffer, buffer, blob };
