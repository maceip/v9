import { NODE_API_SURFACE_EXPORTS, NODE_API_SURFACE_MODULES } from './node-api-surface.generated.js';

const SURFACE_MODULE_SET = new Set(NODE_API_SURFACE_MODULES);
const _surfaceRegistry = new Map();
const _surfaceListeners = new Map();

const SURFACE_ALIASES = {
  'assert/strict': 'assert',
  'dns/promises': 'dns',
  'inspector/promises': 'inspector',
  'path/posix': 'path',
  'path/win32': 'path',
  'stream/promises': 'stream',
  'stream/web': 'stream',
};

function createNotImplementedError(moduleName, exportName) {
  const error = new Error(`Node API not implemented in browser runtime: ${moduleName}.${exportName}`);
  error.code = 'ERR_EDGEJS_NOT_IMPLEMENTED';
  return error;
}

function createStubExport(moduleName, exportName) {
  if (exportName === 'default') return undefined;

  if (exportName === 'constants') {
    return Object.freeze({});
  }

  if (exportName === 'promises') {
    return Object.freeze({});
  }

  if (/^[A-Z]/.test(exportName)) {
    return class NotImplementedNodeApiClass {
      constructor() {
        throw createNotImplementedError(moduleName, exportName);
      }
    };
  }

  return function notImplementedNodeApiExport() {
    throw createNotImplementedError(moduleName, exportName);
  };
}

function cloneModuleExports(moduleExports) {
  if (!moduleExports) return {};
  if (typeof moduleExports === 'function') {
    return Object.assign(moduleExports, moduleExports);
  }
  if (typeof moduleExports === 'object') {
    // Preserve prototype-provided methods (e.g., processBridge class methods)
    // while still allowing us to attach missing stub exports as own props.
    const clone = Object.create(moduleExports);
    return Object.assign(clone, moduleExports);
  }
  return {};
}

function materializeModule(moduleName, moduleExports) {
  const materialized = cloneModuleExports(moduleExports);
  const exportNames = NODE_API_SURFACE_EXPORTS[moduleName] || [];

  for (const exportName of exportNames) {
    if (exportName in materialized) continue;
    const stub = createStubExport(moduleName, exportName);
    if (stub !== undefined) materialized[exportName] = stub;
  }

  if (!('default' in materialized)) {
    materialized.default = materialized;
  }

  return materialized;
}

function _notifySurfaceListeners(moduleName, moduleExports) {
  const listeners = _surfaceListeners.get(moduleName);
  if (!listeners || listeners.size === 0) return;
  for (const listener of listeners) {
    try {
      listener(moduleExports);
    } catch {
      // Listener failures should not break registry updates.
    }
  }
}

export function isNodeApiSurfaceModule(moduleName) {
  const clean = moduleName.startsWith('node:') ? moduleName.slice(5) : moduleName;
  return SURFACE_MODULE_SET.has(clean);
}

export function expandBuiltinsToNodeApiSurface(initialBuiltins) {
  const expandedBuiltins = { ...initialBuiltins };

  for (const moduleName of NODE_API_SURFACE_MODULES) {
    if (!Object.prototype.hasOwnProperty.call(expandedBuiltins, moduleName)) {
      const alias = SURFACE_ALIASES[moduleName];
      if (alias && Object.prototype.hasOwnProperty.call(expandedBuiltins, alias)) {
        expandedBuiltins[moduleName] = expandedBuiltins[alias];
      }
    }
    expandedBuiltins[moduleName] = materializeModule(moduleName, expandedBuiltins[moduleName]);
    _surfaceRegistry.set(moduleName, expandedBuiltins[moduleName]);
    _notifySurfaceListeners(moduleName, expandedBuiltins[moduleName]);
  }

  for (const [moduleName, moduleExports] of Object.entries(expandedBuiltins)) {
    _surfaceRegistry.set(moduleName, moduleExports);
    _notifySurfaceListeners(moduleName, moduleExports);
  }

  return expandedBuiltins;
}

export function getNodeApiModule(moduleName) {
  const cleanName = moduleName.startsWith('node:') ? moduleName.slice(5) : moduleName;
  if (_surfaceRegistry.has(cleanName)) return _surfaceRegistry.get(cleanName);
  return materializeModule(cleanName, {});
}

export function subscribeNodeApiModule(moduleName, listener) {
  const cleanName = moduleName.startsWith('node:') ? moduleName.slice(5) : moduleName;
  if (typeof listener !== 'function') {
    throw new TypeError('subscribeNodeApiModule listener must be a function');
  }
  if (!_surfaceListeners.has(cleanName)) {
    _surfaceListeners.set(cleanName, new Set());
  }
  const listeners = _surfaceListeners.get(cleanName);
  listeners.add(listener);

  const initial = _surfaceRegistry.has(cleanName)
    ? _surfaceRegistry.get(cleanName)
    : materializeModule(cleanName, {});
  listener(initial);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      _surfaceListeners.delete(cleanName);
    }
  };
}

export function getNodeApiSurfaceModules() {
  return [...NODE_API_SURFACE_MODULES];
}

