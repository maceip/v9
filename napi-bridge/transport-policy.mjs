/**
 * Central HTTP transport policy for retained browser / Wasm helper code.
 *
 * The supported product surface now centers on sandbox + command_filter +
 * grpc_exec + mcpmux. The retained browser helper layer no longer exposes the
 * old generic transport selection system; browser HTTP simply uses native
 * fetch and any product-specific proxying is handled elsewhere.
 */

/**
 * True only for a real Node process (not an in-tab polyfill that mimics process.versions).
 */
export function isNodeHost() {
  if (typeof globalThis.document !== 'undefined') return false;
  return typeof globalThis.process?.versions?.node === 'string';
}

export async function browserHttpFetch(url, init = {}) {
  return fetch(url, init);
}
