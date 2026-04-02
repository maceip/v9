/** Read at call time so MEMFS / initEdgeJS injected `process.env` is visible (wasm JS bridge). */
function conformanceTargetMode() {
  return (process.env.CONFORMANCE_TARGET || 'bridge').toLowerCase();
}

function modeDescription() {
  return conformanceTargetMode() === 'node' ? 'node builtins' : 'napi-bridge modules';
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

export function getConformanceTargetMode() {
  return conformanceTargetMode();
}

export function printConformanceTarget(suiteName) {
  const m = conformanceTargetMode();
  console.log(`Target (${suiteName}): ${modeDescription()} [CONFORMANCE_TARGET=${m}]`);
}

export async function loadEventEmitterModule() {
  if (conformanceTargetMode() === 'node') {
    const mod = await import('node:events');
    return { EventEmitter: mod.EventEmitter };
  }

  const mod = await import('../../napi-bridge/eventemitter.js');
  const EventEmitter = pickFirst(mod.EventEmitter, mod.default?.EventEmitter, mod.default);
  if (typeof EventEmitter !== 'function') {
    throw new Error('Bridge EventEmitter export not found');
  }
  return { EventEmitter };
}

export async function loadPathModule() {
  if (conformanceTargetMode() === 'node') {
    const mod = await import('node:path');
    return { path: pickFirst(mod.default, mod) };
  }

  const mod = await import('../../napi-bridge/browser-builtins.js');
  if (!mod.pathBridge) {
    throw new Error('Bridge pathBridge export not found');
  }
  return { path: mod.pathBridge };
}

export async function loadBufferModule() {
  if (conformanceTargetMode() === 'node') {
    const mod = await import('node:buffer');
    return { Buffer: mod.Buffer };
  }

  const mod = await import('../../napi-bridge/browser-builtins.js');
  const Buffer = pickFirst(mod.bufferBridge?.Buffer, mod.bufferBridge);
  if (!Buffer) {
    throw new Error('Bridge buffer export not found');
  }
  return { Buffer };
}

export async function loadUtilModule() {
  if (conformanceTargetMode() === 'node') {
    const mod = await import('node:util');
    return { util: pickFirst(mod.default, mod) };
  }

  const mod = await import('../../napi-bridge/util.js');
  const util = pickFirst(mod.default, mod.util, mod);
  if (!util) {
    throw new Error('Bridge util export not found');
  }
  return { util };
}

export async function loadUrlModule() {
  if (conformanceTargetMode() === 'node') {
    const mod = await import('node:url');
    return {
      url: {
        parse: mod.parse,
        URL: mod.URL,
        fileURLToPath: mod.fileURLToPath,
        pathToFileURL: mod.pathToFileURL,
      },
    };
  }

  const mod = await import('../../napi-bridge/browser-builtins.js');
  if (!mod.urlBridge) {
    throw new Error('Bridge urlBridge export not found');
  }
  return {
    url: {
      parse: mod.urlBridge.parse,
      URL: pickFirst(mod.urlBridge.URL, globalThis.URL),
      fileURLToPath: mod.urlBridge.fileURLToPath,
      pathToFileURL: mod.urlBridge.pathToFileURL,
    },
  };
}

export async function loadStreamsModule() {
  if (conformanceTargetMode() === 'node') {
    const mod = await import('node:stream');
    return {
      Readable: mod.Readable,
      Writable: mod.Writable,
      Transform: mod.Transform,
      Duplex: mod.Duplex,
      PassThrough: mod.PassThrough,
      pipeline: mod.pipeline,
      finished: mod.finished,
    };
  }

  const mod = await import('../../napi-bridge/streams.js');
  return {
    Readable: pickFirst(mod.Readable, mod.default?.Readable),
    Writable: pickFirst(mod.Writable, mod.default?.Writable),
    Transform: pickFirst(mod.Transform, mod.default?.Transform),
    Duplex: pickFirst(mod.Duplex, mod.default?.Duplex),
    PassThrough: pickFirst(mod.PassThrough, mod.default?.PassThrough),
    pipeline: pickFirst(mod.pipeline, mod.default?.pipeline),
    finished: pickFirst(mod.finished, mod.default?.finished),
  };
}

export async function loadFsModule() {
  if (conformanceTargetMode() === 'node') {
    const mod = await import('node:fs');
    return { fs: mod.default || mod };
  }

  const mod = await import('../../napi-bridge/fs.js');
  const fs = pickFirst(mod.default, mod.fs, mod);
  if (!fs) {
    throw new Error('Bridge fs export not found');
  }
  return { fs };
}

export async function loadProcessModule() {
  if (conformanceTargetMode() === 'node') {
    return { processObject: process };
  }

  const mod = await import('../../napi-bridge/browser-builtins.js');
  const processObject = mod.processBridge;
  if (!processObject) {
    throw new Error('Bridge processBridge export not found');
  }
  return { processObject };
}
