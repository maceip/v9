/**
 * module — Node.js-compatible module shim for browser/Wasm.
 *
 * Provides createRequire, builtinModules, isBuiltin — needed by
 * Claude Code and Codex which call createRequire(import.meta.url).
 */

// Lazy-loaded builtin modules — populated on first require() call
let _builtinCache = null;
let _memfsRequire = null;

function _getBuiltins() {
  if (_builtinCache) return _builtinCache;
  // Build a sync lookup of all builtins we know about
  // These will be populated by _setRequire, but we provide fallbacks
  _builtinCache = {};
  return _builtinCache;
}

// Synchronous builtin resolver — checks the registered overrides
function _syncRequireBuiltin(name) {
  const clean = name.startsWith('node:') ? name.slice(5) : name;
  const builtins = _getBuiltins();
  if (builtins[clean]) return builtins[clean];
  if (builtins[name]) return builtins[name];
  // Try globalThis for things like 'process', 'console', 'buffer'
  if (clean === 'process') return globalThis.process;
  if (clean === 'console') return globalThis.console;
  if (clean === 'buffer') return { Buffer: globalThis.Buffer };
  return null;
}

export function _setBuiltinModule(name, mod) {
  if (!_builtinCache) _builtinCache = {};
  _builtinCache[name] = mod;
}
let _registeredModules = [];

export function _setRequire(requireFn) {
  _memfsRequire = requireFn;
}

export function _setBuiltinList(names) {
  _registeredModules = names;
}

export function createRequire(filename) {
  // Resolve the directory from the filename
  let dir = '/';
  if (typeof filename === 'string') {
    // Handle file:// URLs
    if (filename.startsWith('file://')) {
      filename = filename.replace('file://', '');
    }
    const lastSlash = filename.lastIndexOf('/');
    if (lastSlash > 0) dir = filename.substring(0, lastSlash);
  } else if (filename && typeof filename.href === 'string') {
    // URL object
    const href = filename.href.replace('file://', '');
    const lastSlash = href.lastIndexOf('/');
    if (lastSlash > 0) dir = href.substring(0, lastSlash);
  }

  function localRequire(id) {
    // Check builtins first (always available, even before _memfsRequire is set)
    const builtin = _syncRequireBuiltin(id);
    if (builtin) return builtin;
    // Then try the full MEMFS resolver
    if (_memfsRequire) {
      return _memfsRequire(id, dir);
    }
    throw new Error(`Cannot find module '${id}' from '${dir}'`);
  }

  localRequire.resolve = (id) => {
    // Strip node: prefix
    const name = id.startsWith('node:') ? id.slice(5) : id;
    if (_registeredModules.includes(name)) return name;
    return id;
  };

  localRequire.resolve.paths = () => [dir, '/node_modules'];

  localRequire.cache = {};
  localRequire.main = undefined;

  return localRequire;
}

export const builtinModules = new Proxy([], {
  get(target, prop) {
    if (prop === 'length') return _registeredModules.length;
    if (prop === Symbol.iterator) return function* () { yield* _registeredModules; };
    if (prop === 'includes') return (v) => _registeredModules.includes(v);
    if (prop === 'indexOf') return (v) => _registeredModules.indexOf(v);
    if (typeof prop === 'string' && /^\d+$/.test(prop)) return _registeredModules[Number(prop)];
    return Reflect.get(_registeredModules, prop);
  },
});

export function isBuiltin(name) {
  const stripped = name.startsWith('node:') ? name.slice(5) : name;
  return _registeredModules.includes(stripped);
}

// Module class stub
export class Module {
  constructor(id, parent) {
    this.id = id || '';
    this.parent = parent || null;
    this.filename = id || '';
    this.loaded = false;
    this.exports = {};
    this.children = [];
    this.paths = [];
  }
}

Module.createRequire = createRequire;
Module.builtinModules = builtinModules;
Module.isBuiltin = isBuiltin;
Module._resolveFilename = (request) => request;
Module._cache = {};

export default {
  createRequire,
  builtinModules,
  isBuiltin,
  Module,
  _setRequire,
  _setBuiltinList,
};
