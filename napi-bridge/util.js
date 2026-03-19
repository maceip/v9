/**
 * util — Node.js-compatible util module for browser/Wasm.
 *
 * Implements the util contract per the conformance catalog (CORE-08).
 * Covers: promisify, inherits, types.*, inspect (basic).
 */

/**
 * promisify(fn) — converts callback-style (err, result) function to Promise-returning.
 *
 * If fn has a [util.promisify.custom] symbol, that is used instead.
 */
export function promisify(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('The "original" argument must be of type Function. Received ' + typeof fn);
  }

  // Support custom promisify
  if (fn[promisify.custom]) {
    const custom = fn[promisify.custom];
    if (typeof custom !== 'function') {
      throw new TypeError('The "util.promisify.custom" property must be of type Function. Received ' + typeof custom);
    }
    Object.defineProperty(custom, promisify.custom, {
      value: custom,
      enumerable: false,
      writable: false,
      configurable: true,
    });
    return custom;
  }

  function promisified(...args) {
    return new Promise((resolve, reject) => {
      fn.call(this, ...args, (err, ...values) => {
        if (err) {
          reject(err);
        } else if (values.length <= 1) {
          resolve(values[0]);
        } else {
          resolve(values);
        }
      });
    });
  }

  Object.setPrototypeOf(promisified, Object.getPrototypeOf(fn));
  Object.defineProperty(promisified, promisify.custom, {
    value: promisified,
    enumerable: false,
    writable: false,
    configurable: true,
  });

  return promisified;
}

promisify.custom = Symbol.for('nodejs.util.promisify.custom');

/**
 * inherits(ctor, superCtor) — legacy prototype chain setup.
 *
 * Sets up ctor.prototype to inherit from superCtor.prototype.
 * Also sets ctor.super_ = superCtor.
 */
export function inherits(ctor, superCtor) {
  if (ctor === undefined || ctor === null) {
    throw new TypeError('The "ctor" argument must be a function. Received ' + ctor);
  }
  if (superCtor === undefined || superCtor === null) {
    throw new TypeError('The "superCtor" argument must be a function. Received ' + superCtor);
  }
  if (superCtor.prototype === undefined) {
    throw new TypeError('The "superCtor.prototype" property must be defined');
  }
  Object.defineProperty(ctor, 'super_', {
    value: superCtor,
    writable: true,
    configurable: true,
  });
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
}

/**
 * types — type-checking utilities.
 */
export const types = {
  isPromise(val) {
    return val instanceof Promise;
  },

  isDate(val) {
    try {
      Date.prototype.getTime.call(val);
      return true;
    } catch {
      return false;
    }
  },

  isRegExp(val) {
    try {
      RegExp.prototype.exec.call(val, '');
      // If it didn't throw, it's a RegExp (or has RegExp internal slots)
      return Object.prototype.toString.call(val) === '[object RegExp]';
    } catch {
      return false;
    }
  },

  isNativeError(val) {
    return val instanceof Error;
  },

  isArrayBufferView(val) {
    return ArrayBuffer.isView(val);
  },

  isUint8Array(val) {
    return val instanceof Uint8Array;
  },

  isSet(val) {
    try {
      Set.prototype.has.call(val, undefined);
      return true;
    } catch {
      return false;
    }
  },

  isMap(val) {
    try {
      Map.prototype.has.call(val, undefined);
      return true;
    } catch {
      return false;
    }
  },

  isTypedArray(val) {
    return ArrayBuffer.isView(val) && !(val instanceof DataView);
  },

  isArrayBuffer(val) {
    return val instanceof ArrayBuffer;
  },

  isSharedArrayBuffer(val) {
    return typeof SharedArrayBuffer !== 'undefined' && val instanceof SharedArrayBuffer;
  },

  isGeneratorFunction(val) {
    if (typeof val !== 'function') return false;
    return Object.getPrototypeOf(val) === Object.getPrototypeOf(function* () {});
  },

  isGeneratorObject(val) {
    if (!val || typeof val !== 'object') return false;
    const genProto = Object.getPrototypeOf(Object.getPrototypeOf((function* () {})()));
    return Object.getPrototypeOf(val) === genProto;
  },

  isAsyncFunction(val) {
    if (typeof val !== 'function') return false;
    return Object.getPrototypeOf(val) === Object.getPrototypeOf(async function () {});
  },
};

/**
 * inspect — basic string representation of an object.
 *
 * A simplified implementation. Handles primitives, objects, arrays, dates, regexps, etc.
 * Does not aim for 100% parity with Node.js inspect, but covers common cases.
 */
export function inspect(obj, opts) {
  if (opts === undefined) opts = {};
  if (typeof opts === 'boolean') opts = { showHidden: opts };

  const depth = opts.depth !== undefined ? opts.depth : 2;
  const colors = opts.colors || false;

  return _inspect(obj, depth, colors, new Set());
}

function _inspect(obj, depth, colors, seen) {
  // Primitives
  if (obj === null) return colorize('null', 'bold', colors);
  if (obj === undefined) return colorize('undefined', 'grey', colors);
  if (typeof obj === 'boolean') return colorize(String(obj), 'yellow', colors);
  if (typeof obj === 'number') return colorize(String(obj), 'yellow', colors);
  if (typeof obj === 'bigint') return colorize(String(obj) + 'n', 'yellow', colors);
  if (typeof obj === 'symbol') return colorize(String(obj), 'green', colors);

  if (typeof obj === 'string') {
    return colorize("'" + obj.replace(/'/g, "\\'") + "'", 'green', colors);
  }

  if (typeof obj === 'function') {
    const name = obj.name ? `: ${obj.name}` : '';
    return colorize(`[Function${name}]`, 'cyan', colors);
  }

  // Circular reference check
  if (seen.has(obj)) return colorize('[Circular]', 'cyan', colors);

  // Depth check
  if (depth < 0) {
    if (Array.isArray(obj)) return colorize(`[Array]`, 'cyan', colors);
    return colorize(`[Object]`, 'cyan', colors);
  }

  seen.add(obj);

  // Date
  if (obj instanceof Date) {
    return obj.toISOString();
  }

  // RegExp
  if (obj instanceof RegExp) {
    return colorize(String(obj), 'red', colors);
  }

  // Error
  if (obj instanceof Error) {
    return obj.stack || String(obj);
  }

  // Array
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    const items = obj.map(item => _inspect(item, depth - 1, colors, seen));
    const singleLine = '[ ' + items.join(', ') + ' ]';
    if (singleLine.length <= 72) return singleLine;
    return '[\n  ' + items.join(',\n  ') + '\n]';
  }

  // Map
  if (obj instanceof Map) {
    if (obj.size === 0) return 'Map(0) {}';
    const entries = [];
    for (const [k, v] of obj) {
      entries.push(`${_inspect(k, depth - 1, colors, seen)} => ${_inspect(v, depth - 1, colors, seen)}`);
    }
    return `Map(${obj.size}) { ${entries.join(', ')} }`;
  }

  // Set
  if (obj instanceof Set) {
    if (obj.size === 0) return 'Set(0) {}';
    const entries = [];
    for (const v of obj) {
      entries.push(_inspect(v, depth - 1, colors, seen));
    }
    return `Set(${obj.size}) { ${entries.join(', ')} }`;
  }

  // TypedArray
  if (ArrayBuffer.isView(obj) && !(obj instanceof DataView)) {
    const name = obj.constructor.name;
    const items = [];
    const len = Math.min(obj.length, 50);
    for (let i = 0; i < len; i++) items.push(String(obj[i]));
    if (obj.length > 50) items.push(`... ${obj.length - 50} more items`);
    return `${name}(${obj.length}) [ ${items.join(', ')} ]`;
  }

  // Plain object
  const keys = Object.keys(obj);
  if (keys.length === 0) return '{}';
  const items = keys.map(key => {
    const val = _inspect(obj[key], depth - 1, colors, seen);
    return `${key}: ${val}`;
  });
  const singleLine = '{ ' + items.join(', ') + ' }';
  if (singleLine.length <= 72) return singleLine;
  return '{\n  ' + items.join(',\n  ') + '\n}';
}

const ANSI = {
  bold: ['\x1b[1m', '\x1b[22m'],
  grey: ['\x1b[90m', '\x1b[39m'],
  yellow: ['\x1b[33m', '\x1b[39m'],
  green: ['\x1b[32m', '\x1b[39m'],
  cyan: ['\x1b[36m', '\x1b[39m'],
  red: ['\x1b[31m', '\x1b[39m'],
};

function colorize(str, color, enabled) {
  if (!enabled) return str;
  const codes = ANSI[color];
  return codes ? codes[0] + str + codes[1] : str;
}

// Attach inspect.custom symbol
inspect.custom = Symbol.for('nodejs.util.inspect.custom');

/**
 * isDeepStrictEqual — deep equality comparison.
 *
 * Handles: primitives, objects, arrays, Maps, Sets, Dates, RegExps,
 * TypedArrays, Errors. Compares by value, not identity.
 */
export function isDeepStrictEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return false;

  // Date
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  // RegExp
  if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags;
  // ArrayBuffer / TypedArray
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    if (a.byteLength !== b.byteLength) return false;
    const va = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const vb = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    for (let i = 0; i < va.length; i++) { if (va[i] !== vb[i]) return false; }
    return true;
  }
  // Map
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (!b.has(k) || !isDeepStrictEqual(v, b.get(k))) return false;
    }
    return true;
  }
  // Set
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) { if (!b.has(v)) return false; }
    return true;
  }
  // Array
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isDeepStrictEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  // Plain objects
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!isDeepStrictEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * format — Node.js-compatible string formatting.
 *
 * Supports %s, %d, %i, %f, %j, %o, %O, %%
 */
export function format(fmt, ...args) {
  if (typeof fmt !== 'string') {
    return [fmt, ...args].map(a => typeof a === 'string' ? a : inspect(a)).join(' ');
  }
  let i = 0;
  let str = fmt.replace(/%([sdifjoO%])/g, (match, type) => {
    if (type === '%') return '%';
    if (i >= args.length) return match;
    const arg = args[i++];
    switch (type) {
      case 's': return String(arg);
      case 'd': return Number(arg).toString();
      case 'i': return parseInt(arg, 10).toString();
      case 'f': return parseFloat(arg).toString();
      case 'j': try { return JSON.stringify(arg); } catch { return '[Circular]'; }
      case 'o': case 'O': return inspect(arg);
      default: return match;
    }
  });
  // Append remaining args
  while (i < args.length) {
    str += ' ' + (typeof args[i] === 'string' ? args[i] : inspect(args[i]));
    i++;
  }
  return str;
}

/**
 * debuglog — returns a conditional logging function.
 *
 * In browser, checks process.env.NODE_DEBUG for the section name.
 */
export function debuglog(section) {
  const key = section.toUpperCase();
  let enabled = false;
  if (typeof process !== 'undefined' && process.env && process.env.NODE_DEBUG) {
    enabled = process.env.NODE_DEBUG.toUpperCase().split(',').some(
      s => s.trim() === key || s.trim() === '*'
    );
  }
  return function(...args) {
    if (enabled) {
      console.error(`${key} ${process.pid}: ${format(...args)}`);
    }
  };
}

/**
 * deprecate — wraps a function to emit a deprecation warning on first call.
 */
export function deprecate(fn, msg, code) {
  let warned = false;
  function deprecated(...args) {
    if (!warned) {
      warned = true;
      if (typeof process !== 'undefined' && process.emitWarning) {
        process.emitWarning(msg, 'DeprecationWarning', code);
      } else {
        console.warn(`[DEP${code || ''}] DeprecationWarning: ${msg}`);
      }
    }
    return fn.apply(this, args);
  }
  Object.setPrototypeOf(deprecated, fn);
  return deprecated;
}

/**
 * callbackify — converts async/promise function to callback style.
 */
export function callbackify(fn) {
  return function(...args) {
    const callback = args.pop();
    fn.apply(this, args).then(
      (result) => callback(null, result),
      (err) => {
        if (!err) {
          const wrapped = new Error('Promise was rejected with a falsy value');
          wrapped.reason = err;
          callback(wrapped);
        } else {
          callback(err);
        }
      }
    );
  };
}

// Re-export TextEncoder/TextDecoder for convenience
export const _TextEncoder = globalThis.TextEncoder;
export const _TextDecoder = globalThis.TextDecoder;

// Default export: entire util namespace
const util = {
  promisify,
  inherits,
  types,
  inspect,
  isDeepStrictEqual,
  format,
  debuglog,
  deprecate,
  callbackify,
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
};

export default util;
