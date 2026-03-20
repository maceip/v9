/**
 * timers/promises — Node.js-compatible timers/promises for browser/Wasm.
 *
 * Provides setTimeout, setInterval, setImmediate as Promise-returning
 * functions with AbortSignal support.
 */

// ─── timers/promises ────────────────────────────────────────────────

export function setTimeout(delay, value, options) {
  const { signal } = options || {};
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException('The operation was aborted', 'AbortError'));
      return;
    }
    const id = globalThis.setTimeout(() => resolve(value), delay || 0);
    if (signal) {
      signal.addEventListener('abort', () => {
        globalThis.clearTimeout(id);
        reject(signal.reason || new DOMException('The operation was aborted', 'AbortError'));
      }, { once: true });
    }
  });
}

export function setImmediate(value, options) {
  return setTimeout(0, value, options);
}

export async function* setInterval(delay, value, options) {
  const { signal } = options || {};
  while (true) {
    if (signal?.aborted) return;
    await new Promise((resolve, reject) => {
      const id = globalThis.setTimeout(resolve, delay || 0);
      if (signal) {
        signal.addEventListener('abort', () => {
          globalThis.clearTimeout(id);
          reject(signal.reason || new DOMException('The operation was aborted', 'AbortError'));
        }, { once: true });
      }
    });
    if (signal?.aborted) return;
    yield value;
  }
}

export const scheduler = {
  wait(delay, options) {
    return setTimeout(delay, undefined, options);
  },
  yield(options) {
    return setTimeout(0, undefined, options);
  },
};

export default { setTimeout, setImmediate, setInterval, scheduler };

// ─── timers (non-promise) ───────────────────────────────────────────
// Re-export globalThis timers for the 'timers' module

export const timersModule = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis),
  setImmediate: (callback, ...args) => globalThis.setTimeout(callback, 0, ...args),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
  clearImmediate: globalThis.clearTimeout.bind(globalThis),
};
