const targetMode = (process.env.CONFORMANCE_TARGET || 'bridge').toLowerCase();

function modeDescription() {
  return targetMode === 'node' ? 'node builtins' : 'napi-bridge modules';
}

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

async function importWithContext(modulePath) {
  try {
    return await import(modulePath);
  } catch (error) {
    throw new Error(`Failed to import ${modulePath} in ${targetMode} mode: ${error.message}`);
  }
}

export function getConformanceTargetMode() {
  return targetMode;
}

export function printConformanceTarget(suiteName) {
  console.log(`Target (${suiteName}): ${modeDescription()} [CONFORMANCE_TARGET=${targetMode}]`);
}

export async function loadEventEmitterModule() {
  if (targetMode === 'node') {
    const mod = await import('node:events');
    return { EventEmitter: mod.EventEmitter };
  }

  const mod = await importWithContext('../../napi-bridge/eventemitter.js');
  const EventEmitter = pickFirst(mod.EventEmitter, mod.default?.EventEmitter, mod.default);
  if (typeof EventEmitter !== 'function') {
    throw new Error('Bridge EventEmitter export not found');
  }
  return { EventEmitter };
}

export async function loadPathModule() {
  if (targetMode === 'node') {
    const mod = await import('node:path');
    return { path: pickFirst(mod.default, mod) };
  }

  const mod = await importWithContext('../../napi-bridge/browser-builtins.js');
  if (!mod.pathBridge) {
    throw new Error('Bridge pathBridge export not found');
  }
  return { path: mod.pathBridge };
}

export async function loadBufferModule() {
  if (targetMode === 'node') {
    const mod = await import('node:buffer');
    return { Buffer: mod.Buffer };
  }

  const mod = await importWithContext('../../napi-bridge/browser-builtins.js');
  const Buffer = pickFirst(mod.bufferBridge?.Buffer, mod.bufferBridge);
  if (!Buffer) {
    throw new Error('Bridge buffer export not found');
  }
  return { Buffer };
}

export async function loadUtilModule() {
  if (targetMode === 'node') {
    const mod = await import('node:util');
    return { util: pickFirst(mod.default, mod) };
  }

  const mod = await importWithContext('../../napi-bridge/util.js');
  const util = pickFirst(mod.default, mod.util, mod);
  if (!util) {
    throw new Error('Bridge util export not found');
  }
  return { util };
}

export async function loadUrlModule() {
  if (targetMode === 'node') {
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

  const mod = await importWithContext('../../napi-bridge/browser-builtins.js');
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
  if (targetMode === 'node') {
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

  const mod = await importWithContext('../../napi-bridge/streams.js');
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

export async function loadProcessModule() {
  if (targetMode === 'node') {
    return { processObject: process };
  }

  const mod = await importWithContext('../../napi-bridge/browser-builtins.js');
  const processObject = mod.processBridge;
  if (!processObject) {
    throw new Error('Bridge processBridge export not found');
  }
  return { processObject };
}
