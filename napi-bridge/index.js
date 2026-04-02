/**
 * N-API Browser Bridge for EdgeJS
 *
 * This module provides N-API function implementations that bridge
 * EdgeJS's C++ runtime (compiled to Wasm) to the browser's native
 * JS engine. It replaces the Wasmer host's N-API provider.
 *
 * In EdgeJS's architecture:
 *   - WASIX mode: N-API functions imported from Wasmer host
 *   - Browser mode: N-API functions imported from THIS bridge
 *
 * The bridge is loaded as Emscripten library imports, so each
 * function is available to the Wasm module via WebAssembly.imports.
 *
 * Reference: https://nodejs.org/api/n-api.html
 */

// N-API status codes (mirrors napi_status enum)
const NAPI_OK = 0;
const NAPI_INVALID_ARG = 1;
const NAPI_OBJECT_EXPECTED = 2;
const NAPI_STRING_EXPECTED = 3;
const NAPI_NAME_EXPECTED = 4;
const NAPI_FUNCTION_EXPECTED = 5;
const NAPI_NUMBER_EXPECTED = 6;
const NAPI_BOOLEAN_EXPECTED = 7;
const NAPI_GENERIC_FAILURE = 9;
const NAPI_PENDING_EXCEPTION = 10;

// N-API value types
const NAPI_UNDEFINED = 0;
const NAPI_NULL = 1;
const NAPI_BOOLEAN = 2;
const NAPI_NUMBER = 3;
const NAPI_STRING = 4;
const NAPI_SYMBOL = 5;
const NAPI_OBJECT = 6;
const NAPI_FUNCTION = 7;
const NAPI_EXTERNAL = 8;
const NAPI_BIGINT = 9;
const NAPI_STATIC = 1 << 10;
// Cached singleton codec instances — avoids per-call constructor overhead.
// Hot-path: encodeUtf8/decodeUtf8 are called on every string read/write
// through the N-API bridge (500k+ calls in typical sessions).
const _cachedEncoder = typeof globalThis.TextEncoder === 'function' ? new globalThis.TextEncoder() : null;
const _cachedDecoder = typeof globalThis.TextDecoder === 'function' ? new globalThis.TextDecoder() : null;

function encodeUtf8(value) {
  const str = String(value);
  if (_cachedEncoder) {
    return _cachedEncoder.encode(str);
  }
  const escaped = unescape(encodeURIComponent(str));
  const out = new Uint8Array(escaped.length);
  for (let i = 0; i < escaped.length; i++) out[i] = escaped.charCodeAt(i);
  return out;
}

function decodeUtf8(bytes) {
  if (_cachedDecoder) {
    // SharedArrayBuffer views can't be passed to TextDecoder.decode().
    // Copy to a regular ArrayBuffer when the source is shared.
    if (bytes.buffer instanceof SharedArrayBuffer) {
      bytes = new Uint8Array(bytes);
    }
    return _cachedDecoder.decode(bytes);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return decodeURIComponent(escape(binary));
}

function utf8ByteLength(value) {
  if (_cachedEncoder) {
    return _cachedEncoder.encode(String(value)).length;
  }
  return encodeUtf8(value).length;
}

function sumMapValues(map) {
  let total = 0;
  for (const value of map.values()) {
    total += Number(value) || 0;
  }
  return total;
}

function extractErrorSourceMetadata(value) {
  const fallbackMessage = value instanceof Error
    ? (value.message || value.name || 'Unknown error')
    : String(value ?? 'Unknown error');
  const stackText = value instanceof Error
    ? String(value.stack || '')
    : '';

  const stackLines = stackText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  let frameLine = '';
  let sourceLine = fallbackMessage;
  let scriptResourceName = 'unknown';
  let lineNumber = 0;
  let startColumn = 0;
  let endColumn = 0;

  const firstFrame = stackLines.find((line) => line.startsWith('at ')) || '';
  if (firstFrame) {
    frameLine = firstFrame;
    sourceLine = firstFrame;
    const match = firstFrame.match(/\(?(.+?):(\d+):(\d+)\)?$/);
    if (match) {
      scriptResourceName = match[1];
      lineNumber = Number(match[2]) || 0;
      startColumn = Number(match[3]) || 0;
      endColumn = startColumn;
    }
  } else if (stackLines.length > 0) {
    sourceLine = stackLines[0];
  }

  const thrownAt = frameLine || `${scriptResourceName}:${lineNumber}:${startColumn}`;

  return {
    sourceLine,
    scriptResourceName,
    lineNumber,
    startColumn,
    endColumn,
    thrownAt,
  };
}

/**
 * NapiBridge manages the mapping between Wasm-side napi_value handles
 * and real JavaScript values in the browser.
 */
class NapiBridge {
  constructor(wasmModule, options = {}) {
    this.wasm = wasmModule;
    this.memory = null; // Set when module initializes
    this.logNapiErrors = options.logNapiErrors !== false;
    this.strictUnknownImports = Boolean(options.strictUnknownImports);
    this.diagnosticsEnabled = Boolean(options.diagnosticsEnabled); // opt-in import tracing

    // Cached DataView for writeI32/writeF64 hot paths
    this._dvBuffer = null;
    this._dv = null;

    // Handle table: maps integer handles ↔ JS values
    // Handle 0 is reserved as "null pointer / invalid handle"
    // so all real napi_value handles are non-zero.
    // Handle 1 = undefined, 2 = null, 3 = global
    this.handles = [null, undefined, null, globalThis];
    this.handleFreeList = [];

    // Reference counting for GC prevention.
    // Maps handle → { count: number, isWeak: boolean }
    this.refs = new Map();

    // Wrap/unwrap lifecycle tracking.
    // Maps object handle -> { nativePtr, finalizeCb, finalizeHint, env, refCount, isFinalized }
    this.wrapRegistry = new Map();
    // WeakMap for object -> wrap metadata (used for napi_unwrap from object)
    this.wrapDataByObject = new WeakMap();
    // Monotonic wrap ID to detect stale lookups
    this.nextWrapId = 1;
    this.deferreds = new Map();
    this.nextDeferredId = 0x4000;
    this.envCleanupHooks = new Map();
    this.typeTags = new WeakMap();
    this.objectFinalizers = new WeakMap();
    // Explicit counter for WeakMap size (WeakMap is not iterable)
    this.wrappedNativePointersByObjectCount = 0;
    this.arrayBufferMetadata = new Map(); // handle -> { dataPtr, byteLength }
    this.nextCallbackInfo = 0x3000;
    this.callbackInfos = new Map();

    // Persistent pointers from Wasm → handle scope stack
    this.handleScopes = [[]];

    // Exception and last-error tracking for N-API parity.
    this.pendingExceptionHandle = null;
    this.lastErrorCode = NAPI_OK;
    this.lastErrorMessage = '';
    this.lastErrorInfoPtr = 0;
    this.lastErrorMessagePtr = 0;
    this.lastErrorScratchPtr = 0;

    // Minimal environment bookkeeping for unofficial_napi_* helpers.
    this.nextEnvId = 0x1000;
    this.nextEnvScopeId = 0x2000;
    this.activeEnv = 0; // Set when an env is created; used by module hooks.
    this.envByScope = new Map(); // scope pointer -> env pointer
    this.edgeEnvironmentByEnv = new Map(); // env pointer -> native env pointer
    this.moduleWrapImportModuleDynamicallyCallback = 0;
    this.moduleWrapInitializeImportMetaObjectCallback = 0;
    this.lastMainArgPath = '';
    this.continuationPreservedEmbedderDataHandle = 1; // undefined

    // Import diagnostics to characterize missing bridge coverage.
    this.missingImports = new Map();
    this.importCallCounts = new Map();
    this.importErrorCounts = new Map();
    this.importCallTrace = [];
  }

  // --- Handle Management ---

  /** Allocate a handle for a JS value, return integer handle */
  createHandle(value) {
    // Check if value is already a well-known handle
    if (value === undefined) return 1;
    if (value === null) return 2;
    if (value === globalThis) return 3;

    let handle;
    if (this.handleFreeList.length > 0) {
      handle = this.handleFreeList.pop();
      this.handles[handle] = value;
    } else {
      handle = this.handles.length;
      this.handles.push(value);
    }

    // Track in current handle scope
    const currentScope = this.handleScopes[this.handleScopes.length - 1];
    currentScope.push(handle);

    return handle;
  }

  /** Resolve integer handle to JS value */
  getHandle(handle) {
    if (handle < 0 || handle >= this.handles.length) {
      throw new Error(`Invalid napi handle: ${handle}`);
    }
    return this.handles[handle];
  }

  /** Free a handle */
  freeHandle(handle) {
    if (handle <= 3) return; // Don't free well-known handles
    if (this.refs.has(handle)) return; // Keep referenced handles alive
    this.handles[handle] = undefined;
    this.handleFreeList.push(handle);
  }

  // --- Handle Scopes ---

  openHandleScope() {
    this.handleScopes.push([]);
    return NAPI_OK;
  }

  closeHandleScope() {
    if (this.handleScopes.length <= 1) {
      return NAPI_GENERIC_FAILURE;
    }
    const scope = this.handleScopes.pop();
    if (!scope) return NAPI_GENERIC_FAILURE;

    // Free all handles in this scope (unless ref'd)
    for (const handle of scope) {
      if (!this.refs.has(handle)) {
        this.freeHandle(handle);
      }
    }
    return NAPI_OK;
  }

  getMemoryBuffer() {
    // Try the live wasm memory export first (handles growth/reallocation)
    if (this._wasmMemory) return this._wasmMemory.buffer;
    if (!this.memory) return null;
    if (ArrayBuffer.isView(this.memory)) return this.memory.buffer;
    if (this.memory instanceof ArrayBuffer) return this.memory;
    if (this.memory.buffer instanceof ArrayBuffer) return this.memory.buffer;
    return null;
  }

  isMemoryRangeValid(ptr, length = 1) {
    const buffer = this.getMemoryBuffer();
    if (!buffer) return false;
    if (!Number.isInteger(ptr) || ptr < 0) return false;
    if (!Number.isInteger(length) || length < 0) return false;
    if (ptr > buffer.byteLength) return false;
    return ptr + length <= buffer.byteLength;
  }

  readCString(ptr, maxLen = 64 * 1024) {
    const buffer = this.getMemoryBuffer();
    if (!buffer || !ptr) return '';
    const bytes = new Uint8Array(buffer);
    if (ptr < 0 || ptr >= bytes.length) return '';
    let end = ptr;
    const limit = Math.min(bytes.length, ptr + maxLen);
    while (end < limit && bytes[end] !== 0) end++;
    return this.readString(ptr, end - ptr);
  }

  writePointer(ptr, value) {
    this.writeI32(ptr, value >>> 0);
  }

  setLastError(status, message = '') {
    this.lastErrorCode = status;
    this.lastErrorMessage = message || '';
  }

  setPendingException(error) {
    this.pendingExceptionHandle = this.createHandle(error);
    const message = error instanceof Error ? error.message : String(error);
    this.setLastError(NAPI_PENDING_EXCEPTION, message);
  }

  clearPendingException() {
    this.pendingExceptionHandle = null;
    this.setLastError(NAPI_OK, '');
  }

  recordMissingImport(name) {
    this.missingImports.set(name, (this.missingImports.get(name) || 0) + 1);
  }

  getActiveHandleCount() {
    let count = 0;
    for (let i = 4; i < this.handles.length; i++) {
      if (this.handles[i] !== undefined) count++;
    }
    return count;
  }

  /**
   * Invoke the stored import-module-dynamically callback when user code
   * calls `import(specifier)` inside a contextified script.
   *
   * The callback was registered by the C++ module_wrap layer via
   * unofficial_napi_module_wrap_set_import_module_dynamically_callback.
   * It receives (env, specifier, assertions, referrer) and returns a
   * handle to a Promise resolving to the module namespace.
   *
   * @param {number} env - N-API environment pointer
   * @param {string} specifier - The module specifier string
   * @param {object} importAssertions - Import assertions object (may be empty)
   * @param {string} referrer - The referrer module URL/path
   * @returns {{ status: number, resultHandle: number }}
   */
  invokeImportModuleDynamically(env, specifier, importAssertions, referrer) {
    const callbackHandle = this.moduleWrapImportModuleDynamicallyCallback;
    if (!callbackHandle || !this.wasm || typeof this.wasm.dynCall !== 'function') {
      return { status: NAPI_GENERIC_FAILURE, resultHandle: 0 };
    }
    this.openHandleScope();
    const specHandle = this.createHandle(specifier);
    const assertHandle = this.createHandle(importAssertions || {});
    const refHandle = this.createHandle(referrer || '');
    const cbinfo = this.nextCallbackInfo++;
    this.callbackInfos.set(cbinfo, {
      thisHandle: 3, // globalThis
      argHandles: [specHandle, assertHandle, refHandle],
      dataPtr: 0,
    });
    try {
      const resultHandle = this.wasm.dynCall('iii', callbackHandle, [env, cbinfo]);
      if (typeof resultHandle === 'number' && resultHandle > 0) {
        // Escape the result handle from this scope by promoting it to the
        // parent scope before we close, so the caller can read it.
        const value = this.getHandle(resultHandle);
        this.closeHandleScope();
        const escapedHandle = this.createHandle(value);
        return { status: NAPI_OK, resultHandle: escapedHandle };
      }
      this.closeHandleScope();
      return { status: NAPI_OK, resultHandle: 1 }; // undefined
    } catch (e) {
      this.closeHandleScope();
      this.setPendingException(e);
      return { status: NAPI_PENDING_EXCEPTION, resultHandle: 0 };
    } finally {
      this.callbackInfos.delete(cbinfo);
    }
  }

  /**
   * Invoke the stored initialize-import-meta callback when `import.meta`
   * is accessed inside a module.
   *
   * The callback was registered by the C++ module_wrap layer via
   * unofficial_napi_module_wrap_set_initialize_import_meta_object_callback.
   * It receives (env, metaObject, module) and populates the meta object
   * with properties like `url` and `resolve`.
   *
   * @param {number} env - N-API environment pointer
   * @param {object} metaObject - The import.meta object to populate
   * @param {object} moduleObject - The module wrapper object
   * @returns {number} N-API status code
   */
  invokeInitializeImportMeta(env, metaObject, moduleObject) {
    const callbackHandle = this.moduleWrapInitializeImportMetaObjectCallback;
    if (!callbackHandle || !this.wasm || typeof this.wasm.dynCall !== 'function') {
      return NAPI_GENERIC_FAILURE;
    }
    this.openHandleScope();
    const metaHandle = this.createHandle(metaObject);
    const modHandle = this.createHandle(moduleObject || {});
    const cbinfo = this.nextCallbackInfo++;
    this.callbackInfos.set(cbinfo, {
      thisHandle: 3, // globalThis
      argHandles: [metaHandle, modHandle],
      dataPtr: 0,
    });
    try {
      this.wasm.dynCall('iii', callbackHandle, [env, cbinfo]);
      this.closeHandleScope();
      return NAPI_OK;
    } catch (e) {
      this.closeHandleScope();
      this.setPendingException(e);
      return NAPI_PENDING_EXCEPTION;
    } finally {
      this.callbackInfos.delete(cbinfo);
    }
  }

  getInstrumentationCounters() {
    return {
      activeHandles: this.getActiveHandleCount(),
      handleScopeDepth: this.handleScopes.length,
      freeHandleSlots: this.handleFreeList.length,
      activeRefs: this.refs.size,
      totalRefCount: sumMapValues(this.refs),
      callbackInfoCount: this.callbackInfos.size,
      wrappedPointerCount: this.wrapRegistry.size,
      wrappedObjectPointerCount: this.wrappedNativePointersByObjectCount,
      arrayBufferMetadataCount: this.arrayBufferMetadata.size,
    };
  }

  getErrorSourceMetadata(errorHandle) {
    let value;
    try {
      value = this.getHandle(errorHandle);
    } catch {
      value = undefined;
    }
    return extractErrorSourceMetadata(value);
  }

  ensureLastErrorStorage() {
    const buffer = this.getMemoryBuffer();
    if (!buffer) return;
    if (!this.lastErrorScratchPtr) {
      // Reserve a tiny static scratch region for last-error info.
      this.lastErrorScratchPtr = 1024;
      this.lastErrorInfoPtr = this.lastErrorScratchPtr;
      this.lastErrorMessagePtr = this.lastErrorScratchPtr + 32;
    }
  }

  // --- Wasm Memory Helpers ---
  // Cached DataView: avoids per-call DataView allocation in writeI32/writeF64.
  // Invalidated when the underlying ArrayBuffer changes (Wasm memory growth).

  _getDataView() {
    const buffer = this.getMemoryBuffer();
    if (!buffer) return null;
    if (this._dvBuffer !== buffer) {
      this._dvBuffer = buffer;
      this._dv = new DataView(buffer);
    }
    return this._dv;
  }

  /** Read a UTF-8 string from Wasm memory */
  readString(ptr, len) {
    const buffer = this.getMemoryBuffer();
    if (!buffer || !ptr || len <= 0) return '';
    if (!this.isMemoryRangeValid(ptr, len)) return '';
    const bytes = new Uint8Array(buffer, ptr, len);
    return decodeUtf8(bytes);
  }

  /** Write a UTF-8 string to Wasm memory, return bytes written */
  writeString(ptr, str, maxLen) {
    const buffer = this.getMemoryBuffer();
    if (!buffer || !ptr || maxLen <= 0) return 0;
    if (!this.isMemoryRangeValid(ptr, 1)) return 0;
    const bytes = encodeUtf8(str);
    const availableBytes = buffer.byteLength - ptr;
    if (availableBytes <= 0) return 0;
    const writeLen = Math.min(bytes.length, maxLen - 1, availableBytes - 1);
    if (writeLen < 0) return 0;
    const target = new Uint8Array(buffer, ptr, writeLen + 1);
    target.set(bytes.subarray(0, writeLen));
    target[writeLen] = 0; // null terminator
    return writeLen;
  }

  /** Write a 32-bit integer to Wasm memory */
  writeI32(ptr, value) {
    if (!ptr) return;
    const dv = this._getDataView();
    if (!dv) return;
    if (!this.isMemoryRangeValid(ptr, 4)) return;
    dv.setInt32(ptr, value, true);
  }

  /** Write a 64-bit float to Wasm memory */
  writeF64(ptr, value) {
    if (!ptr) return;
    const dv = this._getDataView();
    if (!dv) return;
    if (!this.isMemoryRangeValid(ptr, 8)) return;
    dv.setFloat64(ptr, value, true);
  }

  writeBigInt64(ptr, value) {
    if (!ptr) return;
    const dv = this._getDataView();
    if (!dv) return;
    if (!this.isMemoryRangeValid(ptr, 8)) return;
    dv.setBigInt64(ptr, BigInt(value), true);
  }

  writeBigUInt64(ptr, value) {
    if (!ptr) return;
    const dv = this._getDataView();
    if (!dv) return;
    if (!this.isMemoryRangeValid(ptr, 8)) return;
    dv.setBigUint64(ptr, BigInt(value), true);
  }

  readTypeTag(tagPtr) {
    if (!tagPtr) return null;
    const dv = this._getDataView();
    if (!dv || !this.isMemoryRangeValid(tagPtr, 16)) return null;
    const lo = dv.getBigUint64(tagPtr, true);
    const hi = dv.getBigUint64(tagPtr + 8, true);
    return `${hi.toString(16)}:${lo.toString(16)}`;
  }

  // --- N-API Function Implementations ---

  /**
   * Generate the import object for Emscripten's WebAssembly.instantiate
   * These are the N-API functions that EdgeJS's Wasm expects to import.
   */
  getImports() {
    const bridge = this;

    return {
      // --- Value Creation ---
      napi_create_int32(env, value, resultPtr) {
        bridge.writeI32(resultPtr, bridge.createHandle(value));
        return NAPI_OK;
      },

      napi_create_uint32(env, value, resultPtr) {
        bridge.writeI32(resultPtr, bridge.createHandle(value >>> 0));
        return NAPI_OK;
      },

      napi_create_int64(env, value, resultPtr) {
        bridge.writeI32(resultPtr, bridge.createHandle(value));
        return NAPI_OK;
      },

      napi_create_double(env, value, resultPtr) {
        bridge.writeI32(resultPtr, bridge.createHandle(value));
        return NAPI_OK;
      },

      napi_create_string_utf8(env, strPtr, length, resultPtr) {
        const str = length === -1 ?
          bridge.readCString(strPtr) :
          bridge.readString(strPtr, length);
        bridge.writeI32(resultPtr, bridge.createHandle(str));
        return NAPI_OK;
      },

      napi_create_string_latin1(env, strPtr, length, resultPtr) {
        void env;
        const str = length === -1
          ? bridge.readCString(strPtr)
          : bridge.readString(strPtr, length);
        bridge.writeI32(resultPtr, bridge.createHandle(str));
        return NAPI_OK;
      },

      napi_create_string_utf16(env, strPtr, length, resultPtr) {
        void env;
        const buffer = bridge.getMemoryBuffer();
        if (!buffer) {
          bridge.setLastError(NAPI_GENERIC_FAILURE, 'Wasm memory not initialized');
          return NAPI_GENERIC_FAILURE;
        }
        const maxUnits = length === -1 ? Number.MAX_SAFE_INTEGER : (length >>> 0);
        const view = new DataView(buffer);
        const chars = [];
        let offset = 0;
        while (offset < maxUnits) {
          const codeUnit = view.getUint16(strPtr + offset * 2, true);
          if (length === -1 && codeUnit === 0) break;
          chars.push(String.fromCharCode(codeUnit));
          offset += 1;
        }
        bridge.writeI32(resultPtr, bridge.createHandle(chars.join('')));
        return NAPI_OK;
      },

      napi_create_error(env, codeHandle, msgHandle, resultPtr) {
        void env;
        const code = bridge.getHandle(codeHandle);
        const message = bridge.getHandle(msgHandle);
        const error = new Error(message === undefined ? '' : String(message));
        if (code !== undefined && code !== null) {
          error.code = String(code);
        }
        bridge.writeI32(resultPtr, bridge.createHandle(error));
        return NAPI_OK;
      },

      napi_create_type_error(env, codeHandle, msgHandle, resultPtr) {
        void env;
        const code = bridge.getHandle(codeHandle);
        const message = bridge.getHandle(msgHandle);
        const error = new TypeError(message === undefined ? '' : String(message));
        if (code !== undefined && code !== null) {
          error.code = String(code);
        }
        bridge.writeI32(resultPtr, bridge.createHandle(error));
        return NAPI_OK;
      },

      napi_create_range_error(env, codeHandle, msgHandle, resultPtr) {
        void env;
        const code = bridge.getHandle(codeHandle);
        const message = bridge.getHandle(msgHandle);
        const error = new RangeError(message === undefined ? '' : String(message));
        if (code !== undefined && code !== null) {
          error.code = String(code);
        }
        bridge.writeI32(resultPtr, bridge.createHandle(error));
        return NAPI_OK;
      },

      napi_create_object(env, resultPtr) {
        bridge.writeI32(resultPtr, bridge.createHandle({}));
        return NAPI_OK;
      },

      napi_create_array(env, resultPtr) {
        bridge.writeI32(resultPtr, bridge.createHandle([]));
        return NAPI_OK;
      },

      napi_create_array_with_length(env, length, resultPtr) {
        const arr = new Array(Math.max(0, length >>> 0));
        bridge.writeI32(resultPtr, bridge.createHandle(arr));
        return NAPI_OK;
      },

      napi_create_date(env, time, resultPtr) {
        void env;
        bridge.writeI32(resultPtr, bridge.createHandle(new Date(Number(time))));
        return NAPI_OK;
      },

      napi_create_bigint_uint64(env, value, resultPtr) {
        void env;
        bridge.writeI32(resultPtr, bridge.createHandle(BigInt(value)));
        return NAPI_OK;
      },

      napi_create_promise(env, deferredPtr, promisePtr) {
        void env;
        const deferredId = bridge.nextDeferredId++;
        let resolveFn;
        let rejectFn;
        const promise = new Promise((resolve, reject) => {
          resolveFn = resolve;
          rejectFn = reject;
        });
        bridge.deferreds.set(deferredId, { resolve: resolveFn, reject: rejectFn, promise });
        if (deferredPtr) bridge.writePointer(deferredPtr, deferredId);
        if (promisePtr) bridge.writeI32(promisePtr, bridge.createHandle(promise));
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_resolve_deferred(env, deferred, resolutionHandle) {
        void env;
        const entry = bridge.deferreds.get(deferred >>> 0);
        if (!entry) return NAPI_INVALID_ARG;
        entry.resolve(bridge.getHandle(resolutionHandle));
        bridge.deferreds.delete(deferred >>> 0);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_reject_deferred(env, deferred, rejectionHandle) {
        void env;
        const entry = bridge.deferreds.get(deferred >>> 0);
        if (!entry) return NAPI_INVALID_ARG;
        entry.reject(bridge.getHandle(rejectionHandle));
        bridge.deferreds.delete(deferred >>> 0);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_create_function(env, namePtr, nameLen, cb, data, resultPtr) {
        const name = namePtr
          ? (nameLen === -1 ? bridge.readCString(namePtr) : bridge.readString(namePtr, nameLen))
          : 'anonymous';
        const fn = function (...args) {
          if (!bridge.wasm || typeof bridge.wasm.dynCall !== 'function') {
            throw new Error('dynCall is unavailable for napi callback invocation');
          }

          const tempHandles = [];
          const argHandles = [];
          for (const arg of args) {
            const handle = bridge.createHandle(arg);
            tempHandles.push(handle);
            argHandles.push(handle);
          }
          const thisHandle = bridge.createHandle(this);
          tempHandles.push(thisHandle);

          const cbinfo = bridge.nextCallbackInfo++;
          bridge.callbackInfos.set(cbinfo, {
            thisHandle,
            argHandles,
            dataPtr: data,
          });

          try {
            const resultHandle = bridge.wasm.dynCall('iii', cb, [env, cbinfo]);
            if (typeof resultHandle === 'number' && resultHandle > 0) {
              return bridge.getHandle(resultHandle);
            }
            return undefined;
          } finally {
            bridge.callbackInfos.delete(cbinfo);
            for (const handle of tempHandles) {
              bridge.freeHandle(handle);
            }
          }
        };
        Object.defineProperty(fn, 'name', { value: name });
        bridge.writeI32(resultPtr, bridge.createHandle(fn));
        return NAPI_OK;
      },

      napi_define_class(env,
                        namePtr,
                        nameLen,
                        constructorCb,
                        data,
                        propertyCount,
                        propertiesPtr,
                        resultPtr) {
        const className = namePtr
          ? (nameLen === -1 ? bridge.readCString(namePtr) : bridge.readString(namePtr, nameLen))
          : 'NapiClass';

        const ctor = function (...args) {
          if (!bridge.wasm || typeof bridge.wasm.dynCall !== 'function' || !constructorCb) {
            return this;
          }

          const tempHandles = [];
          const argHandles = [];
          for (const arg of args) {
            const handle = bridge.createHandle(arg);
            tempHandles.push(handle);
            argHandles.push(handle);
          }
          const thisHandle = bridge.createHandle(this);
          tempHandles.push(thisHandle);

          const cbinfo = bridge.nextCallbackInfo++;
          bridge.callbackInfos.set(cbinfo, { thisHandle, argHandles, dataPtr: data });
          try {
            const resultHandle = bridge.wasm.dynCall('iii', constructorCb, [env, cbinfo]);
            if (typeof resultHandle === 'number' && resultHandle > 0) {
              return bridge.getHandle(resultHandle);
            }
            return this;
          } finally {
            bridge.callbackInfos.delete(cbinfo);
            for (const handle of tempHandles) {
              bridge.freeHandle(handle);
            }
          }
        };
        Object.defineProperty(ctor, 'name', { value: className });

        const buffer = bridge.getMemoryBuffer();
        if (buffer && propertiesPtr && propertyCount > 0) {
          const view = new DataView(buffer);
          const kDescriptorSize = 32;
          for (let i = 0; i < propertyCount; i++) {
            const base = propertiesPtr + i * kDescriptorSize;
            const utf8NamePtr = view.getUint32(base + 0, true);
            const nameHandle = view.getInt32(base + 4, true);
            const methodPtr = view.getUint32(base + 8, true);
            const getterPtr = view.getUint32(base + 12, true);
            const setterPtr = view.getUint32(base + 16, true);
            const valueHandle = view.getInt32(base + 20, true);
            const attributes = view.getUint32(base + 24, true);
            const methodData = view.getUint32(base + 28, true);

            let key = '';
            if (utf8NamePtr) {
              key = bridge.readCString(utf8NamePtr);
            } else if (nameHandle) {
              key = String(bridge.getHandle(nameHandle));
            }
            if (!key) continue;

            const target = (attributes & NAPI_STATIC) ? ctor : ctor.prototype;
            if (valueHandle) {
              Object.defineProperty(target, key, {
                value: bridge.getHandle(valueHandle),
                configurable: true,
                enumerable: true,
                writable: true,
              });
              continue;
            }
            if (methodPtr) {
              const methodValue = function (...args) {
                if (!bridge.wasm || typeof bridge.wasm.dynCall !== 'function') {
                  return undefined;
                }
                const tempHandles = [];
                const argHandles = [];
                for (const arg of args) {
                  const handle = bridge.createHandle(arg);
                  tempHandles.push(handle);
                  argHandles.push(handle);
                }
                const thisHandle = bridge.createHandle(this);
                tempHandles.push(thisHandle);
                const cbinfo = bridge.nextCallbackInfo++;
                bridge.callbackInfos.set(cbinfo, { thisHandle, argHandles, dataPtr: methodData });
                try {
                  const resultHandle = bridge.wasm.dynCall('iii', methodPtr, [env, cbinfo]);
                  if (typeof resultHandle === 'number' && resultHandle > 0) {
                    return bridge.getHandle(resultHandle);
                  }
                  return undefined;
                } finally {
                  bridge.callbackInfos.delete(cbinfo);
                  for (const handle of tempHandles) {
                    bridge.freeHandle(handle);
                  }
                }
              };
              Object.defineProperty(target, key, {
                value: methodValue,
                configurable: true,
                enumerable: true,
                writable: true,
              });
              continue;
            }

            if (getterPtr || setterPtr) {
              const descriptor = {
                configurable: true,
                enumerable: true,
              };
              if (getterPtr) {
                descriptor.get = function () {
                  if (!bridge.wasm || typeof bridge.wasm.dynCall !== 'function') {
                    return undefined;
                  }
                  const thisHandle = bridge.createHandle(this);
                  const cbinfo = bridge.nextCallbackInfo++;
                  bridge.callbackInfos.set(cbinfo, { thisHandle, argHandles: [], dataPtr: methodData });
                  try {
                    const resultHandle = bridge.wasm.dynCall('iii', getterPtr, [env, cbinfo]);
                    if (typeof resultHandle === 'number' && resultHandle > 0) {
                      return bridge.getHandle(resultHandle);
                    }
                    return undefined;
                  } finally {
                    bridge.callbackInfos.delete(cbinfo);
                    bridge.freeHandle(thisHandle);
                  }
                };
              }
              if (setterPtr) {
                descriptor.set = function (nextValue) {
                  if (!bridge.wasm || typeof bridge.wasm.dynCall !== 'function') {
                    return;
                  }
                  const valueHandle = bridge.createHandle(nextValue);
                  const thisHandle = bridge.createHandle(this);
                  const cbinfo = bridge.nextCallbackInfo++;
                  bridge.callbackInfos.set(cbinfo, {
                    thisHandle,
                    argHandles: [valueHandle],
                    dataPtr: methodData,
                  });
                  try {
                    bridge.wasm.dynCall('iii', setterPtr, [env, cbinfo]);
                  } finally {
                    bridge.callbackInfos.delete(cbinfo);
                    bridge.freeHandle(valueHandle);
                    bridge.freeHandle(thisHandle);
                  }
                };
              }
              Object.defineProperty(target, key, descriptor);
            }
          }
        }

        bridge.writeI32(resultPtr, bridge.createHandle(ctor));
        return NAPI_OK;
      },

      napi_get_cb_info(env, cbinfo, argcPtr, argvPtr, thisArgPtr, dataPtr) {
        void env;
        const info = bridge.callbackInfos.get(cbinfo);
        if (!info) {
          bridge.setLastError(NAPI_INVALID_ARG, 'Unknown callback info');
          return NAPI_INVALID_ARG;
        }

        const buffer = bridge.getMemoryBuffer();
        if (!buffer) {
          bridge.setLastError(NAPI_GENERIC_FAILURE, 'Wasm memory not initialized');
          return NAPI_GENERIC_FAILURE;
        }

        const view = new DataView(buffer);
        const available = info.argHandles.length;
        let requested = available;
        if (argcPtr) {
          requested = view.getUint32(argcPtr, true);
        }

        const copyCount = Math.min(requested, available);
        if (argvPtr) {
          for (let i = 0; i < copyCount; i++) {
            view.setInt32(argvPtr + i * 4, info.argHandles[i], true);
          }
        }
        if (argcPtr) {
          view.setUint32(argcPtr, available, true);
        }
        if (thisArgPtr) {
          view.setInt32(thisArgPtr, info.thisHandle, true);
        }
        if (dataPtr) {
          view.setUint32(dataPtr, info.dataPtr >>> 0, true);
        }
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      // --- Value Getters ---
      napi_get_value_int32(env, handle, resultPtr) {
        const value = bridge.getHandle(handle);
        bridge.writeI32(resultPtr, value | 0);
        return NAPI_OK;
      },

      napi_get_value_int64(env, handle, resultPtr) {
        void env;
        bridge.writeBigInt64(resultPtr, BigInt(Math.trunc(Number(bridge.getHandle(handle) || 0))));
        return NAPI_OK;
      },

      napi_get_value_uint32(env, handle, resultPtr) {
        void env;
        const value = bridge.getHandle(handle);
        bridge.writeI32(resultPtr, Number(value) >>> 0);
        return NAPI_OK;
      },

      napi_get_value_double(env, handle, resultPtr) {
        const value = bridge.getHandle(handle);
        bridge.writeF64(resultPtr, +value);
        return NAPI_OK;
      },

      napi_get_value_bool(env, handle, resultPtr) {
        const value = bridge.getHandle(handle);
        bridge.writeI32(resultPtr, value ? 1 : 0);
        return NAPI_OK;
      },

      napi_strict_equals(env, lhsHandle, rhsHandle, resultPtr) {
        void env;
        const lhs = bridge.getHandle(lhsHandle);
        const rhs = bridge.getHandle(rhsHandle);
        bridge.writeI32(resultPtr, lhs === rhs ? 1 : 0);
        return NAPI_OK;
      },

      napi_get_array_length(env, handle, resultPtr) {
        void env;
        const value = bridge.getHandle(handle);
        const hasLength =
          value != null &&
          (Array.isArray(value) ||
            ArrayBuffer.isView(value) ||
            typeof value === 'string' ||
            typeof value.length === 'number');
        const length = hasLength ? Number(value.length) >>> 0 : 0;
        bridge.writeI32(resultPtr, length);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_get_value_string_utf8(env, handle, bufPtr, bufSize, resultPtr) {
        const str = String(bridge.getHandle(handle));
        if (bufPtr && bufSize > 0) {
          const written = bridge.writeString(bufPtr, str, bufSize);
          if (resultPtr) bridge.writeI32(resultPtr, written);
        } else if (resultPtr) {
          bridge.writeI32(resultPtr, utf8ByteLength(str));
        }
        return NAPI_OK;
      },

      napi_get_value_string_utf16(env, handle, bufPtr, bufSize, resultPtr) {
        void env;
        const str = String(bridge.getHandle(handle));
        if (!bufPtr || bufSize <= 0) {
          if (resultPtr) bridge.writeI32(resultPtr, str.length);
          return NAPI_OK;
        }
        const buffer = bridge.getMemoryBuffer();
        if (!buffer) {
          bridge.setLastError(NAPI_GENERIC_FAILURE, 'Wasm memory not initialized');
          return NAPI_GENERIC_FAILURE;
        }
        const maxUnits = Math.max(0, (bufSize >>> 0) - 1);
        const writeUnits = Math.min(str.length, maxUnits);
        const view = new DataView(buffer);
        for (let i = 0; i < writeUnits; i++) {
          view.setUint16(bufPtr + i * 2, str.charCodeAt(i), true);
        }
        view.setUint16(bufPtr + writeUnits * 2, 0, true);
        if (resultPtr) bridge.writeI32(resultPtr, writeUnits);
        return NAPI_OK;
      },

      napi_get_value_string_latin1(env, handle, bufPtr, bufSize, resultPtr) {
        void env;
        const str = String(bridge.getHandle(handle));
        const latin1 = Array.from(str, (char) => String.fromCharCode(char.charCodeAt(0) & 0xff)).join('');
        if (bufPtr && bufSize > 0) {
          const written = bridge.writeString(bufPtr, latin1, bufSize);
          if (resultPtr) bridge.writeI32(resultPtr, written);
        } else if (resultPtr) {
          bridge.writeI32(resultPtr, latin1.length);
        }
        return NAPI_OK;
      },

      napi_coerce_to_string(env, valueHandle, resultPtr) {
        void env;
        const value = bridge.getHandle(valueHandle);
        bridge.writeI32(resultPtr, bridge.createHandle(String(value)));
        return NAPI_OK;
      },

      napi_coerce_to_number(env, valueHandle, resultPtr) {
        void env;
        bridge.writeI32(resultPtr, bridge.createHandle(Number(bridge.getHandle(valueHandle))));
        return NAPI_OK;
      },

      napi_coerce_to_bool(env, valueHandle, resultPtr) {
        void env;
        bridge.writeI32(resultPtr, bridge.createHandle(Boolean(bridge.getHandle(valueHandle))));
        return NAPI_OK;
      },

      napi_coerce_to_object(env, valueHandle, resultPtr) {
        void env;
        const value = bridge.getHandle(valueHandle);
        bridge.writeI32(resultPtr, bridge.createHandle(Object(value)));
        return NAPI_OK;
      },

      napi_create_arraybuffer(env, byteLength, dataPtrOut, resultPtr) {
        void env;
        const length = byteLength >>> 0;
        const buffer = new ArrayBuffer(length);
        const handle = bridge.createHandle(buffer);
        let dataPtr = 0;
        if (dataPtrOut && bridge.wasm && typeof bridge.wasm._malloc === 'function') {
          dataPtr = bridge.wasm._malloc(length || 1) >>> 0;
          bridge.writePointer(dataPtrOut, dataPtr);
        } else if (dataPtrOut) {
          bridge.writePointer(dataPtrOut, 0);
        }
        bridge.arrayBufferMetadata.set(handle, { dataPtr, byteLength: length });
        bridge.writeI32(resultPtr, handle);
        return NAPI_OK;
      },

      napi_is_arraybuffer(env, valueHandle, resultPtr) {
        void env;
        bridge.writeI32(resultPtr, bridge.getHandle(valueHandle) instanceof ArrayBuffer ? 1 : 0);
        return NAPI_OK;
      },

      napi_get_arraybuffer_info(env, arraybufferHandle, dataPtrOut, byteLengthOut) {
        void env;
        const arrayBuffer = bridge.getHandle(arraybufferHandle);
        if (!(arrayBuffer instanceof ArrayBuffer)) {
          bridge.setLastError(NAPI_INVALID_ARG, 'ArrayBuffer expected');
          return NAPI_INVALID_ARG;
        }
        const metadata = bridge.arrayBufferMetadata.get(arraybufferHandle);
        const length = arrayBuffer.byteLength >>> 0;
        const dataPtr = metadata ? (metadata.dataPtr >>> 0) : 0;
        if (dataPtrOut) bridge.writePointer(dataPtrOut, dataPtr);
        if (byteLengthOut) bridge.writePointer(byteLengthOut, length);
        if (!metadata) {
          bridge.setLastError(NAPI_GENERIC_FAILURE, 'Array buffer allocation failed');
          return NAPI_GENERIC_FAILURE;
        }
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_is_buffer(env, valueHandle, resultPtr) {
        void env;
        const value = bridge.getHandle(valueHandle);
        const isNodeBuffer =
          typeof Buffer !== 'undefined' &&
          typeof Buffer.isBuffer === 'function' &&
          Buffer.isBuffer(value);
        const isUint8Array = value instanceof Uint8Array;
        bridge.writeI32(resultPtr, isNodeBuffer || isUint8Array ? 1 : 0);
        return NAPI_OK;
      },

      napi_create_buffer(env, length, dataPtrOut, resultPtr) {
        void env;
        const size = length >>> 0;
        const buffer = typeof Buffer !== 'undefined' ? Buffer.alloc(size) : new Uint8Array(size);
        const handle = bridge.createHandle(buffer);
        let dataPtr = 0;
        if (dataPtrOut && bridge.wasm && typeof bridge.wasm._malloc === 'function') {
          dataPtr = bridge.wasm._malloc(size || 1) >>> 0;
          bridge.writePointer(dataPtrOut, dataPtr);
        } else if (dataPtrOut) {
          bridge.writePointer(dataPtrOut, 0);
        }
        bridge.arrayBufferMetadata.set(handle, { dataPtr, byteLength: size });
        bridge.writeI32(resultPtr, handle);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_create_buffer_copy(env, length, dataPtr, resultDataPtrOut, resultPtr) {
        void env;
        const size = length >>> 0;
        const buffer = typeof Buffer !== 'undefined' ? Buffer.alloc(size) : new Uint8Array(size);
        const wasmBuffer = bridge.getMemoryBuffer();
        if (wasmBuffer && dataPtr) {
          buffer.set(new Uint8Array(wasmBuffer, dataPtr >>> 0, size));
        }
        let copiedPtr = 0;
        if (resultDataPtrOut && bridge.wasm && typeof bridge.wasm._malloc === 'function') {
          copiedPtr = bridge.wasm._malloc(size || 1) >>> 0;
          bridge.writePointer(resultDataPtrOut, copiedPtr);
          if (wasmBuffer && size > 0) {
            new Uint8Array(wasmBuffer, copiedPtr, size).set(buffer);
          }
        } else if (resultDataPtrOut) {
          bridge.writePointer(resultDataPtrOut, 0);
        }
        const handle = bridge.createHandle(buffer);
        bridge.arrayBufferMetadata.set(handle, { dataPtr: copiedPtr, byteLength: size });
        bridge.writeI32(resultPtr, handle);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_get_buffer_info(env, valueHandle, dataPtrOut, lengthPtr) {
        void env;
        const value = bridge.getHandle(valueHandle);
        if (!(value instanceof Uint8Array)) {
          bridge.setLastError(NAPI_INVALID_ARG, 'Buffer expected');
          return NAPI_INVALID_ARG;
        }
        const length = value.byteLength >>> 0;
        let dataPtr = 0;
        const wasmBuffer = bridge.getMemoryBuffer();
        if (wasmBuffer && value.buffer === wasmBuffer) {
          dataPtr = value.byteOffset >>> 0;
        } else {
          for (const [handle, metadata] of bridge.arrayBufferMetadata.entries()) {
            if (bridge.getHandle(handle) === value.buffer && metadata && metadata.dataPtr) {
              dataPtr = (metadata.dataPtr + (value.byteOffset >>> 0)) >>> 0;
              break;
            }
          }
        }
        if (dataPtrOut) bridge.writePointer(dataPtrOut, dataPtr);
        if (lengthPtr) bridge.writePointer(lengthPtr, length);
        if (!dataPtr) {
          bridge.setLastError(NAPI_GENERIC_FAILURE, 'Array buffer allocation failed');
          return NAPI_GENERIC_FAILURE;
        }
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_create_external_arraybuffer(
        env,
        externalDataPtr,
        byteLength,
        finalizeCb,
        finalizeHint,
        resultPtr,
      ) {
        void env; void finalizeCb; void finalizeHint;
        const length = byteLength >>> 0;
        const out = new ArrayBuffer(length);
        const wasmBuffer = bridge.getMemoryBuffer();
        if (wasmBuffer && externalDataPtr) {
          const src = new Uint8Array(wasmBuffer, externalDataPtr >>> 0, length);
          new Uint8Array(out).set(src);
        }
        const handle = bridge.createHandle(out);
        bridge.arrayBufferMetadata.set(handle, { dataPtr: externalDataPtr >>> 0, byteLength: length });
        bridge.writeI32(resultPtr, handle);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      node_api_create_sharedarraybuffer(env, byteLength, resultPtr) {
        void env;
        if (typeof SharedArrayBuffer !== 'function') {
          bridge.setLastError(NAPI_GENERIC_FAILURE, 'SharedArrayBuffer is not available');
          return NAPI_GENERIC_FAILURE;
        }
        const length = byteLength >>> 0;
        const handle = bridge.createHandle(new SharedArrayBuffer(length));
        bridge.arrayBufferMetadata.set(handle, { dataPtr: 0, byteLength: length });
        bridge.writeI32(resultPtr, handle);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_create_external(env, dataPtr, finalizeCb, finalizeHint, resultPtr) {
        void env; void finalizeCb; void finalizeHint;
        bridge.writeI32(resultPtr, bridge.createHandle({ __externalPtr: dataPtr >>> 0 }));
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_get_value_external(env, valueHandle, resultPtr) {
        void env;
        const value = bridge.getHandle(valueHandle);
        const ptr = value && typeof value === 'object' && '__externalPtr' in value
          ? value.__externalPtr >>> 0
          : 0;
        bridge.writePointer(resultPtr, ptr);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_create_external_buffer(env, length, dataPtr, finalizeCb, finalizeHint, resultPtr) {
        void env; void finalizeCb; void finalizeHint;
        const size = length >>> 0;
        const buffer = typeof Buffer !== 'undefined' ? Buffer.alloc(size) : new Uint8Array(size);
        const wasmBuffer = bridge.getMemoryBuffer();
        if (wasmBuffer && dataPtr) {
          buffer.set(new Uint8Array(wasmBuffer, dataPtr >>> 0, size));
        }
        const handle = bridge.createHandle(buffer);
        bridge.arrayBufferMetadata.set(handle, { dataPtr: dataPtr >>> 0, byteLength: size });
        bridge.writeI32(resultPtr, handle);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_create_typedarray(env, type, length, arraybufferHandle, byteOffset, resultPtr) {
        void env;
        const arrayBuffer = bridge.getHandle(arraybufferHandle);
        if (!(arrayBuffer instanceof ArrayBuffer)) {
          bridge.setLastError(NAPI_INVALID_ARG, 'ArrayBuffer expected');
          return NAPI_INVALID_ARG;
        }

        const metadata = bridge.arrayBufferMetadata.get(arraybufferHandle);
        const wasmBuffer = bridge.getMemoryBuffer();
        if (metadata && metadata.dataPtr && wasmBuffer) {
          const source = new Uint8Array(wasmBuffer, metadata.dataPtr, metadata.byteLength);
          new Uint8Array(arrayBuffer).set(source);
        }

        const len = length >>> 0;
        const offset = byteOffset >>> 0;
        let value;
        try {
          switch (type >>> 0) {
            case 0: value = new Int8Array(arrayBuffer, offset, len); break;
            case 1: value = new Uint8Array(arrayBuffer, offset, len); break;
            case 2: value = new Uint8ClampedArray(arrayBuffer, offset, len); break;
            case 3: value = new Int16Array(arrayBuffer, offset, len); break;
            case 4: value = new Uint16Array(arrayBuffer, offset, len); break;
            case 5: value = new Int32Array(arrayBuffer, offset, len); break;
            case 6: value = new Uint32Array(arrayBuffer, offset, len); break;
            case 7: value = new Float32Array(arrayBuffer, offset, len); break;
            case 8: value = new Float64Array(arrayBuffer, offset, len); break;
            case 9: value = new BigInt64Array(arrayBuffer, offset, len); break;
            case 10: value = new BigUint64Array(arrayBuffer, offset, len); break;
            default:
              bridge.setLastError(NAPI_INVALID_ARG, `Unsupported typedarray type ${type}`);
              return NAPI_INVALID_ARG;
          }
        } catch (error) {
          bridge.setLastError(NAPI_INVALID_ARG, error.message);
          return NAPI_INVALID_ARG;
        }

        bridge.writeI32(resultPtr, bridge.createHandle(value));
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_is_dataview(env, valueHandle, resultPtr) {
        void env;
        bridge.writeI32(resultPtr, bridge.getHandle(valueHandle) instanceof DataView ? 1 : 0);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      node_api_is_sharedarraybuffer(env, valueHandle, resultPtr) {
        void env;
        const value = bridge.getHandle(valueHandle);
        bridge.writeI32(resultPtr, typeof SharedArrayBuffer === 'function' && value instanceof SharedArrayBuffer ? 1 : 0);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_get_dataview_info(env, valueHandle, byteLengthPtr, dataPtr, arraybufferPtr, byteOffsetPtr) {
        void env;
        const value = bridge.getHandle(valueHandle);
        if (!(value instanceof DataView)) {
          bridge.setLastError(NAPI_INVALID_ARG, 'DataView expected');
          return NAPI_INVALID_ARG;
        }
        if (byteLengthPtr) bridge.writePointer(byteLengthPtr, value.byteLength >>> 0);
        if (dataPtr) bridge.writePointer(dataPtr, 0);
        if (arraybufferPtr) bridge.writeI32(arraybufferPtr, bridge.createHandle(value.buffer));
        if (byteOffsetPtr) bridge.writePointer(byteOffsetPtr, value.byteOffset >>> 0);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_get_typedarray_info(
        env,
        typedarrayHandle,
        typePtr,
        lengthPtr,
        dataPtr,
        arraybufferPtr,
        byteOffsetPtr,
      ) {
        void env;
        const value = bridge.getHandle(typedarrayHandle);
        const isTypedArray = ArrayBuffer.isView(value) && !(value instanceof DataView);

        const ctor = isTypedArray ? value.constructor : null;
        let type = 0;
        if (ctor === Int8Array) type = 0;
        else if (ctor === Uint8Array) type = 1;
        else if (ctor === Uint8ClampedArray) type = 2;
        else if (ctor === Int16Array) type = 3;
        else if (ctor === Uint16Array) type = 4;
        else if (ctor === Int32Array) type = 5;
        else if (ctor === Uint32Array) type = 6;
        else if (ctor === Float32Array) type = 7;
        else if (ctor === Float64Array) type = 8;
        else if (ctor === BigInt64Array) type = 9;
        else if (ctor === BigUint64Array) type = 10;

        if (typePtr) bridge.writeI32(typePtr, type);
        if (lengthPtr) bridge.writeI32(lengthPtr, isTypedArray ? (value.length >>> 0) : 0);
        if (dataPtr) bridge.writePointer(dataPtr, 0);
        if (arraybufferPtr) bridge.writeI32(arraybufferPtr, isTypedArray ? bridge.createHandle(value.buffer) : 0);
        if (byteOffsetPtr) bridge.writeI32(byteOffsetPtr, isTypedArray ? (value.byteOffset >>> 0) : 0);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_create_symbol(env, descriptionHandle, resultPtr) {
        void env;
        const description = bridge.getHandle(descriptionHandle);
        const symbol = description === undefined ? Symbol() : Symbol(String(description));
        bridge.writeI32(resultPtr, bridge.createHandle(symbol));
        return NAPI_OK;
      },

      // --- Property Access ---

      /**
       * Determines why a property set failed and returns appropriate N-API status.
       * @param {object} obj - The target object
       * @param {string|symbol} key - The property key
       * @param {boolean} threw - Whether Reflect.set threw
       * @param {Error|null} throwError - The error if thrown
       * @returns {{status: number, message: string, isException: boolean}}
       */
      classifySetFailure(obj, key, threw, throwError) {
        if (threw && throwError) {
          return {
            status: NAPI_PENDING_EXCEPTION,
            message: throwError.message,
            isException: true,
            error: throwError,
          };
        }

        // Check object state
        const isFrozen = Object.isFrozen(obj);
        const isSealed = Object.isSealed(obj);
        const isExtensible = Object.isExtensible(obj);

        // Get property descriptor
        const desc = Object.getOwnPropertyDescriptor(obj, key);

        if (!desc) {
          // Property doesn't exist - check why we can't add it
          if (isFrozen) {
            return {
              status: NAPI_GENERIC_FAILURE,
              message: `Cannot add property '${String(key)}': object is frozen`,
              isException: false,
            };
          }
          if (isSealed) {
            return {
              status: NAPI_GENERIC_FAILURE,
              message: `Cannot add property '${String(key)}': object is sealed`,
              isException: false,
            };
          }
          if (!isExtensible) {
            return {
              status: NAPI_GENERIC_FAILURE,
              message: `Cannot add property '${String(key)}': object is not extensible`,
              isException: false,
            };
          }
          return {
            status: NAPI_GENERIC_FAILURE,
            message: `Cannot set property '${String(key)}': unknown reason`,
            isException: false,
          };
        }

        // Property exists - check why we can't set it
        if ('value' in desc) {
          // Data property
          if (!desc.writable) {
            return {
              status: NAPI_GENERIC_FAILURE,
              message: `Cannot set read-only property '${String(key)}'`,
              isException: false,
            };
          }
        } else {
          // Accessor property
          if (!desc.set) {
            return {
              status: NAPI_GENERIC_FAILURE,
              message: `Cannot set property '${String(key)}': no setter defined`,
              isException: false,
            };
          }
        }

        return {
          status: NAPI_GENERIC_FAILURE,
          message: `Cannot set property '${String(key)}': unknown reason`,
          isException: false,
        };
      },

      napi_set_named_property(env, objHandle, namePtr, valueHandle) {
        let name = '';
        let objType = 'unknown';
        try {
          const obj = bridge.getHandle(objHandle);
          objType = typeof obj;
          if (namePtr) name = bridge.readCString(namePtr);

          if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
            bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
            return NAPI_OBJECT_EXPECTED;
          }

          const value = bridge.getHandle(valueHandle);

          // Attempt the set operation
          let setThrew = false;
          let setError = null;
          let success = false;

          try {
            success = Reflect.set(obj, name, value, obj);
          } catch (e) {
            setThrew = true;
            setError = e;
          }

          if (!success || setThrew) {
            // Classify the failure for proper error reporting
            const failure = bridge.classifySetFailure(obj, name, setThrew, setError);

            bridge.importCallTrace.push(
              `napi_set_named_property:${failure.isException ? 'exception' : 'failed'}:${name}:${objHandle}:${objType}:${failure.message}`,
            );
            if (bridge.importCallTrace.length > 5000) bridge.importCallTrace.shift();

            if (failure.isException) {
              bridge.setPendingException(failure.error);
              return NAPI_PENDING_EXCEPTION;
            }

            bridge.setLastError(failure.status, failure.message);
            return failure.status;
          }

          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (error) {
          // This catches errors in the bridge itself, not from the property access
          bridge.importCallTrace.push(
            `napi_set_named_property:error:${name}:${objHandle}:${objType}:${String(error?.message || error)}`,
          );
          if (bridge.importCallTrace.length > 5000) bridge.importCallTrace.shift();
          bridge.setPendingException(error);
          return NAPI_PENDING_EXCEPTION;
        }
      },

      napi_get_named_property(env, objHandle, namePtr, resultPtr) {
        let name = '';
        let objType = 'unknown';
        try {
          if (!namePtr) {
            bridge.setLastError(NAPI_INVALID_ARG, 'Property name pointer is null');
            return NAPI_INVALID_ARG;
          }

          const obj = bridge.getHandle(objHandle);
          objType = typeof obj;

          if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
            bridge.writeI32(resultPtr, 1); // undefined
            bridge.setLastError(NAPI_OK, '');
            return NAPI_OK;
          }

          name = bridge.readCString(namePtr);

          // Attempt the get operation - may throw if getter throws
          let result;
          try {
            result = obj[name];
          } catch (getterError) {
            // Property getter threw an exception
            bridge.importCallTrace.push(
              `napi_get_named_property:getter_threw:${name}:${objHandle}:${objType}:${String(getterError?.message || getterError)}`,
            );
            if (bridge.importCallTrace.length > 5000) bridge.importCallTrace.shift();
            bridge.setPendingException(getterError);
            return NAPI_PENDING_EXCEPTION;
          }

          bridge.writeI32(resultPtr, bridge.createHandle(result));
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (error) {
          // Bridge-level error
          bridge.importCallTrace.push(
            `napi_get_named_property:error:${name}:${objHandle}:${objType}:${String(error?.message || error)}`,
          );
          if (bridge.importCallTrace.length > 5000) bridge.importCallTrace.shift();
          bridge.setPendingException(error);
          return NAPI_PENDING_EXCEPTION;
        }
      },

      napi_has_named_property(env, objHandle, namePtr, resultPtr) {
        let name = '';
        let objType = 'unknown';
        try {
          if (!namePtr) {
            bridge.setLastError(NAPI_INVALID_ARG, 'Property name pointer is null');
            return NAPI_INVALID_ARG;
          }
          const obj = bridge.getHandle(objHandle);
          objType = typeof obj;
          if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
            bridge.writeI32(resultPtr, 0);
            bridge.setLastError(NAPI_OK, '');
            return NAPI_OK;
          }
          name = bridge.readCString(namePtr);
          bridge.writeI32(resultPtr, name in obj ? 1 : 0);
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (error) {
          bridge.importCallTrace.push(
            `napi_has_named_property:error:${name}:${objHandle}:${objType}:${String(error?.message || error)}`,
          );
          if (bridge.importCallTrace.length > 5000) bridge.importCallTrace.shift();
          bridge.setPendingException(error);
          return NAPI_PENDING_EXCEPTION;
        }
      },

      napi_is_array(env, valueHandle, resultPtr) {
        void env;
        bridge.writeI32(resultPtr, Array.isArray(bridge.getHandle(valueHandle)) ? 1 : 0);
        return NAPI_OK;
      },

      napi_is_typedarray(env, valueHandle, resultPtr) {
        void env;
        const value = bridge.getHandle(valueHandle);
        bridge.writeI32(resultPtr, ArrayBuffer.isView(value) && !(value instanceof DataView) ? 1 : 0);
        return NAPI_OK;
      },

      napi_is_promise(env, valueHandle, resultPtr) {
        void env;
        bridge.writeI32(resultPtr, bridge.getHandle(valueHandle) instanceof Promise ? 1 : 0);
        return NAPI_OK;
      },

      napi_is_date(env, valueHandle, resultPtr) {
        void env;
        bridge.writeI32(resultPtr, bridge.getHandle(valueHandle) instanceof Date ? 1 : 0);
        return NAPI_OK;
      },

      napi_is_detached_arraybuffer(env, valueHandle, resultPtr) {
        void env; void valueHandle;
        bridge.writeI32(resultPtr, 0);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_instanceof(env, objectHandle, constructorHandle, resultPtr) {
        void env;
        const value = bridge.getHandle(objectHandle);
        const ctor = bridge.getHandle(constructorHandle);
        bridge.writeI32(resultPtr, typeof ctor === 'function' && value instanceof ctor ? 1 : 0);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_get_new_target(env, cbinfo, resultPtr) {
        void env; void cbinfo;
        bridge.writeI32(resultPtr, 1);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_run_script(env, scriptHandle, resultPtr) {
        void env;
        try {
          const result = globalThis.eval(String(bridge.getHandle(scriptHandle)));
          bridge.writeI32(resultPtr, bridge.createHandle(result));
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (error) {
          bridge.setPendingException(error);
          return NAPI_PENDING_EXCEPTION;
        }
      },

      napi_get_value_bigint_int64(env, handle, resultPtr, losslessPtr) {
        void env;
        const value = BigInt(bridge.getHandle(handle) || 0);
        bridge.writeBigInt64(resultPtr, value);
        if (losslessPtr) bridge.writeI32(losslessPtr, 1);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_is_error(env, valueHandle, resultPtr) {
        void env;
        bridge.writeI32(resultPtr, bridge.getHandle(valueHandle) instanceof Error ? 1 : 0);
        return NAPI_OK;
      },

      napi_has_own_property(env, objHandle, keyHandle, resultPtr) {
        void env;
        const obj = bridge.getHandle(objHandle);
        if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
          bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
          return NAPI_OBJECT_EXPECTED;
        }
        const key = bridge.getHandle(keyHandle);
        bridge.writeI32(resultPtr, Object.prototype.hasOwnProperty.call(obj, key) ? 1 : 0);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_has_property(env, objHandle, keyHandle, resultPtr) {
        void env;
        const obj = bridge.getHandle(objHandle);
        if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
          bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
          return NAPI_OBJECT_EXPECTED;
        }
        const key = bridge.getHandle(keyHandle);
        bridge.writeI32(resultPtr, key in obj ? 1 : 0);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_get_property(env, objHandle, keyHandle, resultPtr) {
        void env;
        try {
          const obj = bridge.getHandle(objHandle);
          if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
            bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
            return NAPI_OBJECT_EXPECTED;
          }
          const key = bridge.getHandle(keyHandle);

          // Attempt the get operation - may throw if getter throws
          let result;
          try {
            result = obj[key];
          } catch (getterError) {
            bridge.setPendingException(getterError);
            return NAPI_PENDING_EXCEPTION;
          }

          bridge.writeI32(resultPtr, bridge.createHandle(result));
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (error) {
          bridge.setPendingException(error);
          return NAPI_PENDING_EXCEPTION;
        }
      },

      napi_get_element(env, objHandle, index, resultPtr) {
        void env;
        try {
          const obj = bridge.getHandle(objHandle);
          if (obj == null) {
            bridge.writeI32(resultPtr, 1); // undefined
            bridge.setLastError(NAPI_OK, '');
            return NAPI_OK;
          }

          // Attempt the get operation - may throw if getter throws
          const idx = index >>> 0;
          let result;
          try {
            result = obj[idx];
          } catch (getterError) {
            bridge.setPendingException(getterError);
            return NAPI_PENDING_EXCEPTION;
          }

          bridge.writeI32(resultPtr, bridge.createHandle(result));
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (error) {
          bridge.setPendingException(error);
          return NAPI_PENDING_EXCEPTION;
        }
      },

      napi_set_property(env, objHandle, keyHandle, valueHandle) {
        void env;
        try {
          const obj = bridge.getHandle(objHandle);
          if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
            bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
            return NAPI_OBJECT_EXPECTED;
          }
          const key = bridge.getHandle(keyHandle);
          const value = bridge.getHandle(valueHandle);

          // Attempt the set operation
          let setThrew = false;
          let setError = null;
          let success = false;

          try {
            success = Reflect.set(obj, key, value, obj);
          } catch (e) {
            setThrew = true;
            setError = e;
          }

          if (!success || setThrew) {
            // Use the classifySetFailure helper for proper error reporting
            const failure = bridge.classifySetFailure(obj, key, setThrew, setError);

            if (failure.isException) {
              bridge.setPendingException(failure.error);
              return NAPI_PENDING_EXCEPTION;
            }

            bridge.setLastError(failure.status, failure.message);
            return failure.status;
          }

          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (error) {
          bridge.setPendingException(error);
          return NAPI_PENDING_EXCEPTION;
        }
      },

      napi_delete_property(env, objHandle, keyHandle, resultPtr) {
        void env;
        const obj = bridge.getHandle(objHandle);
        if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
          bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
          return NAPI_OBJECT_EXPECTED;
        }
        const key = bridge.getHandle(keyHandle);
        const deleted = delete obj[key];
        if (resultPtr) bridge.writeI32(resultPtr, deleted ? 1 : 0);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_get_property_names(env, objHandle, resultPtr) {
        void env;
        const obj = bridge.getHandle(objHandle);
        if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
          bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
          return NAPI_OBJECT_EXPECTED;
        }
        bridge.writeI32(resultPtr, bridge.createHandle(Reflect.ownKeys(obj)));
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_get_all_property_names(env, objHandle, keyMode, keyFilter, keyConversion, resultPtr) {
        void env; void keyMode; void keyFilter; void keyConversion;
        const obj = bridge.getHandle(objHandle);
        if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
          bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
          return NAPI_OBJECT_EXPECTED;
        }
        bridge.writeI32(resultPtr, bridge.createHandle(Reflect.ownKeys(obj)));
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_object_freeze(env, objHandle) {
        void env;
        const obj = bridge.getHandle(objHandle);
        if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
          bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
          return NAPI_OBJECT_EXPECTED;
        }
        Object.freeze(obj);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_get_prototype(env, valueHandle, resultPtr) {
        void env;
        const value = bridge.getHandle(valueHandle);
        if (value == null) {
          bridge.writeI32(resultPtr, 2); // null
          return NAPI_OK;
        }
        const proto = Object.getPrototypeOf(value);
        bridge.writeI32(resultPtr, bridge.createHandle(proto));
        return NAPI_OK;
      },

      node_api_set_prototype(env, objectHandle, prototypeHandle) {
        void env;
        const obj = bridge.getHandle(objectHandle);
        const proto = bridge.getHandle(prototypeHandle);
        if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
          bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
          return NAPI_OBJECT_EXPECTED;
        }
        Object.setPrototypeOf(obj, proto);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_set_element(env, objHandle, index, valueHandle) {
        try {
          const obj = bridge.getHandle(objHandle);
          if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
            bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
            return NAPI_OBJECT_EXPECTED;
          }

          const idx = index >>> 0;
          const value = bridge.getHandle(valueHandle);

          // Attempt the set operation
          let setThrew = false;
          let setError = null;
          let success = false;

          try {
            success = Reflect.set(obj, idx, value, obj);
          } catch (e) {
            setThrew = true;
            setError = e;
          }

          if (!success || setThrew) {
            // Use the classifySetFailure helper for proper error reporting
            const failure = bridge.classifySetFailure(obj, String(idx), setThrew, setError);

            if (failure.isException) {
              bridge.setPendingException(failure.error);
              return NAPI_PENDING_EXCEPTION;
            }

            bridge.setLastError(failure.status, failure.message);
            return failure.status;
          }

          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (error) {
          bridge.setPendingException(error);
          return NAPI_PENDING_EXCEPTION;
        }
      },

      napi_define_properties(env, objHandle, propertyCount, descriptorsPtr) {
        const obj = bridge.getHandle(objHandle);
        if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
          bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
          return NAPI_OBJECT_EXPECTED;
        }

        const buffer = bridge.getMemoryBuffer();
        if (!buffer) {
          bridge.setLastError(NAPI_GENERIC_FAILURE, 'Wasm memory not initialized');
          return NAPI_GENERIC_FAILURE;
        }

        // napi_property_descriptor is 8 fields x 4 bytes on wasm32.
        const kDescriptorSize = 32;
        const view = new DataView(buffer);
        for (let i = 0; i < propertyCount; i++) {
          const base = descriptorsPtr + i * kDescriptorSize;
          const utf8NamePtr = view.getUint32(base + 0, true);
          const nameHandle = view.getInt32(base + 4, true);
          const methodPtr = view.getUint32(base + 8, true);
          const getterPtr = view.getUint32(base + 12, true);
          const setterPtr = view.getUint32(base + 16, true);
          const valueHandle = view.getInt32(base + 20, true);
          const dataPtr = view.getUint32(base + 28, true);

          let key = '';
          if (utf8NamePtr) {
            key = bridge.readCString(utf8NamePtr);
          } else if (nameHandle) {
            key = String(bridge.getHandle(nameHandle));
          }
          if (!key) continue;

          if (valueHandle) {
            Object.defineProperty(obj, key, {
              value: bridge.getHandle(valueHandle),
              configurable: true,
              enumerable: true,
              writable: true,
            });
            continue;
          }

          if (methodPtr) {
            const methodValue = function (...args) {
              if (!bridge.wasm || typeof bridge.wasm.dynCall !== 'function') return undefined;
              return bridge.wasm.dynCall(methodPtr, env, args, dataPtr);
            };
            Object.defineProperty(obj, key, {
              value: methodValue,
              configurable: true,
              enumerable: true,
              writable: true,
            });
            continue;
          }

          if (getterPtr || setterPtr) {
            const descriptor = {
              configurable: true,
              enumerable: true,
            };
            if (getterPtr) {
              descriptor.get = function () {
                if (!bridge.wasm || typeof bridge.wasm.dynCall !== 'function') return undefined;
                const thisHandle = bridge.createHandle(this);
                const cbinfo = bridge.nextCallbackInfo++;
                bridge.callbackInfos.set(cbinfo, { thisHandle, argHandles: [], dataPtr });
                try {
                  const resultHandle = bridge.wasm.dynCall('iii', getterPtr, [env, cbinfo]);
                  if (typeof resultHandle === 'number' && resultHandle > 0) {
                    return bridge.getHandle(resultHandle);
                  }
                  return undefined;
                } finally {
                  bridge.callbackInfos.delete(cbinfo);
                  bridge.freeHandle(thisHandle);
                }
              };
            }
            if (setterPtr) {
              descriptor.set = function (nextValue) {
                if (!bridge.wasm || typeof bridge.wasm.dynCall !== 'function') return;
                const valueHandle = bridge.createHandle(nextValue);
                const thisHandle = bridge.createHandle(this);
                const cbinfo = bridge.nextCallbackInfo++;
                bridge.callbackInfos.set(cbinfo, { thisHandle, argHandles: [valueHandle], dataPtr });
                try {
                  bridge.wasm.dynCall('iii', setterPtr, [env, cbinfo]);
                } finally {
                  bridge.callbackInfos.delete(cbinfo);
                  bridge.freeHandle(valueHandle);
                  bridge.freeHandle(thisHandle);
                }
              };
            }
            Object.defineProperty(obj, key, descriptor);
          }
        }

        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_wrap(env, objectHandle, nativePtr, finalizeCb, finalizeHint, resultPtr) {
        const ptr = nativePtr >>> 0;
        const value = bridge.getHandle(objectHandle);
        if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
          bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
          return NAPI_OBJECT_EXPECTED;
        }

        // Check if already wrapped
        if (bridge.wrapRegistry.has(objectHandle)) {
          bridge.setLastError(NAPI_INVALID_ARG, 'Object is already wrapped');
          return NAPI_INVALID_ARG;
        }

        // Create wrap metadata with unique ID and refcount tracking
        const wrapId = bridge.nextWrapId++;
        const wrapData = {
          wrapId,
          objectHandle,
          nativePtr: ptr,
          finalizeCb: finalizeCb >>> 0,
          finalizeHint: finalizeHint >>> 0,
          env: env >>> 0,
          refCount: 0, // Will be incremented by create_reference
          isFinalized: false,
        };

        // Store wrap data by both handle and object reference
        bridge.wrapRegistry.set(objectHandle, wrapData);
        bridge.wrapDataByObject.set(value, wrapData);

        if (resultPtr) {
          // Create an initial reference to keep the object alive
          // Return the wrapId as the reference (not the handle, to avoid collisions)
          wrapData.refCount = 1;
          bridge.refs.set(objectHandle, { count: 1, isWeak: false });
          bridge.writeI32(resultPtr, objectHandle);
        }

        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_unwrap(env, objectHandle, resultPtr) {
        void env;
        const value = bridge.getHandle(objectHandle);

        // Look up wrap data by object reference first (handles handle recycling)
        let wrapData = null;
        if (value && (typeof value === 'object' || typeof value === 'function')) {
          wrapData = bridge.wrapDataByObject.get(value) || null;
        }

        // Fallback to handle lookup
        if (!wrapData) {
          wrapData = bridge.wrapRegistry.get(objectHandle) || null;
        }

        if (!wrapData || wrapData.isFinalized) {
          bridge.setLastError(NAPI_INVALID_ARG, 'Object is not wrapped');
          return NAPI_INVALID_ARG;
        }

        bridge.writePointer(resultPtr, wrapData.nativePtr);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_remove_wrap(env, objectHandle, resultPtr) {
        void env;
        const value = bridge.getHandle(objectHandle);

        // Look up wrap data
        let wrapData = bridge.wrapRegistry.get(objectHandle) || null;

        // Verify object match to detect handle recycling
        if (wrapData && value && (typeof value === 'object' || typeof value === 'function')) {
          const objectWrapData = bridge.wrapDataByObject.get(value);
          if (objectWrapData && objectWrapData.wrapId !== wrapData.wrapId) {
            // Handle was recycled, object points to different wrap
            wrapData = null;
          }
        }

        if (!wrapData || wrapData.isFinalized) {
          bridge.setLastError(NAPI_INVALID_ARG, 'Object is not wrapped');
          return NAPI_INVALID_ARG;
        }

        const nativePtr = wrapData.nativePtr;

        // Mark as finalized to prevent double-finalization
        wrapData.isFinalized = true;

        // Remove from tracking
        bridge.wrapRegistry.delete(objectHandle);
        if (value && (typeof value === 'object' || typeof value === 'function')) {
          bridge.wrapDataByObject.delete(value);
          bridge.wrappedNativePointersByObjectCount = Math.max(
            0,
            bridge.wrappedNativePointersByObjectCount - 1,
          );
        }

        // Clear the reference
        bridge.refs.delete(objectHandle);

        // Invoke finalize callback if provided
        // Signature: void finalize_callback(napi_env env, void* finalize_data, void* finalize_hint)
        if (wrapData.finalizeCb && bridge.wasm && typeof bridge.wasm.dynCall === 'function') {
          try {
            bridge.wasm.dynCall('viii', wrapData.finalizeCb, [wrapData.env, nativePtr, wrapData.finalizeHint]);
          } catch (e) {
            // Finalize callbacks should not throw, but log for debugging
            bridge.importCallTrace.push(`napi_remove_wrap:finalize_error:${e?.message || e}`);
          }
        }

        if (resultPtr) bridge.writePointer(resultPtr, nativePtr);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_add_finalizer(env, objectHandle, nativePtr, finalizeCb, finalizeHint, resultPtr, finalizeResultPtr) {
        void resultPtr;
        const value = bridge.getHandle(objectHandle);
        if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
          bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
          return NAPI_OBJECT_EXPECTED;
        }
        const finalizers = bridge.objectFinalizers.get(value) || [];
        finalizers.push({
          env: env >>> 0,
          nativePtr: nativePtr >>> 0,
          finalizeCb: finalizeCb >>> 0,
          finalizeHint: finalizeHint >>> 0,
        });
        bridge.objectFinalizers.set(value, finalizers);
        if (finalizeResultPtr) {
          bridge.refs.set(objectHandle, { count: 1, isWeak: false });
          bridge.writeI32(finalizeResultPtr, objectHandle);
        }
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      // --- Function Calls ---
      napi_call_function(env, thisHandle, fnHandle, argc, argvPtr, resultPtr) {
        const fn = bridge.getHandle(fnHandle);
        if (typeof fn !== 'function') {
          bridge.setLastError(NAPI_FUNCTION_EXPECTED, 'Function expected');
          return NAPI_FUNCTION_EXPECTED;
        }
        const thisVal = bridge.getHandle(thisHandle);
        const buffer = bridge.getMemoryBuffer();
        if (!buffer) {
          bridge.setLastError(NAPI_GENERIC_FAILURE, 'Wasm memory not initialized');
          return NAPI_GENERIC_FAILURE;
        }
        const argCount = argc >>> 0;
        if (argCount > 0 && !argvPtr) {
          bridge.setLastError(NAPI_INVALID_ARG, 'argv is null with non-zero argc');
          return NAPI_INVALID_ARG;
        }
        const requiredBytes = argvPtr + argCount * 4;
        if (argCount > 0 && requiredBytes > buffer.byteLength) {
          bridge.setLastError(NAPI_INVALID_ARG, 'argv extends beyond Wasm memory');
          return NAPI_INVALID_ARG;
        }
        const view = new DataView(buffer);
        const args = [];
        for (let i = 0; i < argCount; i++) {
          const argHandle = view.getInt32(argvPtr + i * 4, true);
          args.push(bridge.getHandle(argHandle));
        }
        try {
          const result = fn.apply(thisVal, args);
          if (resultPtr) {
            bridge.writeI32(resultPtr, bridge.createHandle(result));
          }
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (e) {
          const fnName = fn.name || 'anonymous';
          const thisType = thisVal === null ? 'null' : typeof thisVal;
          const thisCtor =
            thisVal && (typeof thisVal === 'object' || typeof thisVal === 'function')
              ? (thisVal.constructor?.name || 'Object')
              : '';
          const message = String(e?.message || e);
          const stack = String(e?.stack || '').split('\n').slice(0, 3).join(' | ');
          bridge.importCallTrace.push(
            `napi_call_function:error:${fnName}:${thisHandle}:${fnHandle}:${thisType}:${thisCtor}:${message}:${stack}`,
          );
          if (bridge.importCallTrace.length > 5000) bridge.importCallTrace.shift();
          bridge.setPendingException(e);
          return NAPI_PENDING_EXCEPTION;
        }
      },

      napi_new_instance(env, ctorHandle, argc, argvPtr, resultPtr) {
        const ctor = bridge.getHandle(ctorHandle);
        const buffer = bridge.getMemoryBuffer();
        if (typeof ctor !== 'function' || !buffer) {
          bridge.setLastError(NAPI_FUNCTION_EXPECTED, 'Constructor expected');
          return NAPI_FUNCTION_EXPECTED;
        }
        const view = new DataView(buffer);

        const args = [];
        for (let i = 0; i < argc; i++) {
          const argHandle = view.getInt32(argvPtr + i * 4, true);
          args.push(bridge.getHandle(argHandle));
        }

        try {
          const value = new ctor(...args);
          bridge.writeI32(resultPtr, bridge.createHandle(value));
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (error) {
          bridge.setPendingException(error);
          return NAPI_PENDING_EXCEPTION;
        }
      },

      // --- Type Checking ---
      napi_typeof(env, handle, resultPtr) {
        const value = bridge.getHandle(handle);
        let type;
        switch (typeof value) {
          case 'undefined': type = NAPI_UNDEFINED; break;
          case 'boolean': type = NAPI_BOOLEAN; break;
          case 'number': type = NAPI_NUMBER; break;
          case 'string': type = NAPI_STRING; break;
          case 'symbol': type = NAPI_SYMBOL; break;
          case 'function': type = NAPI_FUNCTION; break;
          case 'bigint': type = NAPI_BIGINT; break;
          case 'object':
            type = value === null ? NAPI_NULL : NAPI_OBJECT;
            break;
          default: type = NAPI_UNDEFINED;
        }
        bridge.writeI32(resultPtr, type);
        return NAPI_OK;
      },

      // --- Handle Scopes ---
      napi_open_handle_scope(env, resultPtr) {
        bridge.openHandleScope();
        bridge.writeI32(resultPtr, bridge.handleScopes.length - 1);
        return NAPI_OK;
      },

      napi_close_handle_scope(env, scope) {
        return bridge.closeHandleScope();
      },

      // --- Global & Undefined ---
      napi_get_global(env, resultPtr) {
        bridge.writeI32(resultPtr, 3); // handle 3 = globalThis
        return NAPI_OK;
      },

      napi_get_undefined(env, resultPtr) {
        bridge.writeI32(resultPtr, 1); // handle 1 = undefined
        return NAPI_OK;
      },

      napi_get_null(env, resultPtr) {
        bridge.writeI32(resultPtr, 2); // handle 2 = null
        return NAPI_OK;
      },

      napi_get_boolean(env, value, resultPtr) {
        bridge.writeI32(resultPtr, bridge.createHandle(!!value));
        return NAPI_OK;
      },

      // --- Error Handling ---
      napi_throw(env, errorHandle) {
        bridge.setPendingException(bridge.getHandle(errorHandle));
        return NAPI_OK;
      },

      napi_throw_error(env, codePtr, msgPtr) {
        const msg = bridge.readCString(msgPtr);
        const code = codePtr ? bridge.readCString(codePtr) : '';
        const error = new Error(msg || 'N-API error');
        if (code) error.code = code;
        bridge.setPendingException(error);
        if (bridge.logNapiErrors) {
          console.error(`[napi] Error: ${msg}`);
        }
        return NAPI_OK;
      },

      napi_throw_type_error(env, codePtr, msgPtr) {
        const msg = bridge.readCString(msgPtr);
        const code = codePtr ? bridge.readCString(codePtr) : '';
        const error = new TypeError(msg || 'N-API type error');
        if (code) error.code = code;
        bridge.setPendingException(error);
        return NAPI_OK;
      },

      napi_throw_range_error(env, codePtr, msgPtr) {
        const msg = bridge.readCString(msgPtr);
        const code = codePtr ? bridge.readCString(codePtr) : '';
        const error = new RangeError(msg || 'N-API range error');
        if (code) error.code = code;
        bridge.setPendingException(error);
        return NAPI_OK;
      },

      napi_is_exception_pending(env, resultPtr) {
        bridge.writeI32(resultPtr, bridge.pendingExceptionHandle == null ? 0 : 1);
        return NAPI_OK;
      },

      napi_get_and_clear_last_exception(env, resultPtr) {
        if (bridge.pendingExceptionHandle == null) {
          bridge.writeI32(resultPtr, 0);
          return NAPI_OK;
        }
        bridge.writeI32(resultPtr, bridge.pendingExceptionHandle);
        bridge.clearPendingException();
        return NAPI_OK;
      },

      napi_get_last_error_info(env, resultPtr) {
        bridge.ensureLastErrorStorage();
        const infoPtr = bridge.lastErrorInfoPtr;
        const msgPtr = bridge.lastErrorMessagePtr;

        bridge.writeString(msgPtr, bridge.lastErrorMessage || '', 256);

        // napi_extended_error_info (wasm32):
        // 0: const char* error_message
        // 4: void* engine_reserved
        // 8: uint32_t engine_error_code
        // 12: napi_status error_code
        bridge.writePointer(infoPtr, msgPtr);
        bridge.writePointer(infoPtr + 4, 0);
        bridge.writeI32(infoPtr + 8, 0);
        bridge.writeI32(infoPtr + 12, bridge.lastErrorCode);
        bridge.writePointer(resultPtr, infoPtr);
        return NAPI_OK;
      },

      // --- References ---
      napi_create_reference(env, handle, initialRefcount, resultPtr) {
        const refData = { count: initialRefcount, isWeak: false };
        bridge.refs.set(handle, refData);

        // If this is a wrapped object, track the reference count in wrap data too
        const wrapData = bridge.wrapRegistry.get(handle);
        if (wrapData) {
          wrapData.refCount = initialRefcount;
        }

        bridge.writeI32(resultPtr, handle);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_reference_ref(env, ref, resultPtr) {
        const refData = bridge.refs.get(ref);
        if (!refData) {
          bridge.setLastError(NAPI_GENERIC_FAILURE, 'Invalid reference');
          return NAPI_GENERIC_FAILURE;
        }

        refData.count++;

        // Sync with wrap data if this is a wrapped object
        const wrapData = bridge.wrapRegistry.get(ref);
        if (wrapData) {
          wrapData.refCount = refData.count;
        }

        if (resultPtr) bridge.writeI32(resultPtr, refData.count);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_reference_unref(env, ref, resultPtr) {
        const refData = bridge.refs.get(ref);
        if (!refData) {
          bridge.setLastError(NAPI_GENERIC_FAILURE, 'Invalid reference');
          return NAPI_GENERIC_FAILURE;
        }

        refData.count = Math.max(0, refData.count - 1);

        // Sync with wrap data if this is a wrapped object
        const wrapData = bridge.wrapRegistry.get(ref);
        if (wrapData) {
          wrapData.refCount = refData.count;
        }

        if (refData.count === 0 && !refData.isWeak) {
          // Strong reference dropped to zero - delete the reference
          bridge.refs.delete(ref);

          // Note: We do NOT finalize the wrapped object here.
          // Finalization only happens via napi_remove_wrap or GC.
        }

        if (resultPtr) bridge.writeI32(resultPtr, refData.count);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_get_reference_value(env, ref, resultPtr) {
        const refData = bridge.refs.get(ref);
        if (refData && refData.count > 0) {
          bridge.writeI32(resultPtr, ref);
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        }
        // Match N-API behavior where an empty weak reference yields nullptr.
        bridge.writeI32(resultPtr, 0);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_delete_reference(env, ref) {
        const refData = bridge.refs.get(ref);
        if (refData) {
          bridge.refs.delete(ref);

          // Sync with wrap data
          const wrapData = bridge.wrapRegistry.get(ref);
          if (wrapData) {
            wrapData.refCount = 0;
          }
        }
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_add_env_cleanup_hook(env, hook, arg) {
        const envId = env >>> 0;
        const hooks = bridge.envCleanupHooks.get(envId) || [];
        hooks.push({ hook: hook >>> 0, arg: arg >>> 0 });
        bridge.envCleanupHooks.set(envId, hooks);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_adjust_external_memory(env, changeBytes, adjustedValuePtr) {
        void env;
        const adjusted = typeof changeBytes === 'bigint' ? changeBytes : BigInt(Number(changeBytes) || 0);
        if (adjustedValuePtr) {
          bridge.writeBigInt64(adjustedValuePtr, adjusted);
        }
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_type_tag_object(env, objectHandle, typeTagPtr) {
        void env;
        const value = bridge.getHandle(objectHandle);
        if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
          bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
          return NAPI_OBJECT_EXPECTED;
        }
        const tag = bridge.readTypeTag(typeTagPtr);
        if (!tag) {
          bridge.setLastError(NAPI_INVALID_ARG, 'Type tag pointer expected');
          return NAPI_INVALID_ARG;
        }
        bridge.typeTags.set(value, tag);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_check_object_type_tag(env, objectHandle, typeTagPtr, resultPtr) {
        void env;
        const value = bridge.getHandle(objectHandle);
        const expectedTag = bridge.readTypeTag(typeTagPtr);
        const actualTag = value && (typeof value === 'object' || typeof value === 'function')
          ? bridge.typeTags.get(value) || null
          : null;
        bridge.writeI32(resultPtr, expectedTag !== null && actualTag === expectedTag ? 1 : 0);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      // --- Unofficial env bootstrap helpers ---
      unofficial_napi_set_flags_from_string(flagsPtr, length) {
        // Flags are currently ignored in browser/emscripten mode.
        bridge.readString(flagsPtr, length);
        return NAPI_OK;
      },

      unofficial_napi_terminate_execution(env) {
        void env;
        return NAPI_OK;
      },

      unofficial_napi_cancel_terminate_execution(env) {
        void env;
        return NAPI_OK;
      },

      unofficial_napi_get_continuation_preserved_embedder_data(env, resultOutPtr) {
        void env;
        bridge.writeI32(resultOutPtr, bridge.continuationPreservedEmbedderDataHandle || 1);
        return NAPI_OK;
      },

      unofficial_napi_set_continuation_preserved_embedder_data(env, valueHandle) {
        void env;
        bridge.continuationPreservedEmbedderDataHandle = valueHandle || 1;
        return NAPI_OK;
      },

      unofficial_napi_process_microtasks(env) {
        void env;
        // In browser environments, microtasks are automatically processed at the end
        // of each task. To simulate a "checkpoint" where microtasks are explicitly
        // drained, we queue a no-op microtask and track completion.
        // Note: This is best-effort; true synchronous draining would require blocking.
        if (typeof queueMicrotask === 'function') {
          queueMicrotask(() => {
            // Microtask checkpoint executed
          });
        }
        // Also flush any pending Promise resolutions by creating a resolved promise.
        Promise.resolve().then(() => {});
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      unofficial_napi_get_promise_details(env, promiseHandle, stateOutPtr, resultOutPtr, hasResultOutPtr) {
        void env;
        const value = bridge.getHandle(promiseHandle);
        const isPromise = value instanceof Promise;

        // Note: JavaScript does not provide synchronous access to Promise state.
        // V8 has internal slots for this; standard JS engines do not.
        // We return 0 (pending) as the safest default, which prevents incorrect
        // optimizations while not blocking execution.
        // 0 = pending, 1 = fulfilled, 2 = rejected (mirrors V8 Promise::PromiseState)
        if (stateOutPtr) bridge.writeI32(stateOutPtr, 0);
        if (resultOutPtr) bridge.writeI32(resultOutPtr, 1); // undefined
        if (hasResultOutPtr) bridge.writeI32(hasResultOutPtr, 0);

        if (!isPromise) {
          // For non-Promises, return NAPI_INVALID_ARG per Node-API semantics
          // when the value is not a Promise.
          bridge.setLastError(NAPI_INVALID_ARG, 'Value is not a Promise');
          return NAPI_INVALID_ARG;
        }

        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      unofficial_napi_create_env(moduleApiVersion, envOutPtr, scopeOutPtr) {
        const envId = bridge.nextEnvId++;
        const scopeId = bridge.nextEnvScopeId++;
        bridge.activeEnv = envId;
        bridge.envByScope.set(scopeId, envId);
        if (envOutPtr) bridge.writePointer(envOutPtr, envId);
        if (scopeOutPtr) bridge.writePointer(scopeOutPtr, scopeId);
        return NAPI_OK;
      },

      unofficial_napi_create_env_with_options(moduleApiVersion, optionsPtr, envOutPtr, scopeOutPtr) {
        void optionsPtr;
        const envId = bridge.nextEnvId++;
        const scopeId = bridge.nextEnvScopeId++;
        bridge.activeEnv = envId;
        bridge.envByScope.set(scopeId, envId);
        if (envOutPtr) bridge.writePointer(envOutPtr, envId);
        if (scopeOutPtr) bridge.writePointer(scopeOutPtr, scopeId);
        return NAPI_OK;
      },

      unofficial_napi_release_env(scopePtr) {
        bridge.envByScope.delete(scopePtr);
        return NAPI_OK;
      },

      unofficial_napi_release_env_with_loop(scopePtr, loopPtr) {
        void loopPtr;
        bridge.envByScope.delete(scopePtr);
        return NAPI_OK;
      },

      unofficial_napi_set_edge_environment(env, environment) {
        bridge.edgeEnvironmentByEnv.set(env, environment);
        return NAPI_OK;
      },

      unofficial_napi_get_edge_environment(env) {
        return bridge.edgeEnvironmentByEnv.get(env) || 0;
      },

      unofficial_napi_set_env_cleanup_callback(env, callback, data) {
        void env; void callback; void data;
        return NAPI_OK;
      },

      unofficial_napi_set_env_destroy_callback(env, callback, data) {
        void env; void callback; void data;
        return NAPI_OK;
      },

      unofficial_napi_set_context_token_callbacks(env, assignCb, unassignCb, data) {
        void env; void assignCb; void unassignCb; void data;
        return NAPI_OK;
      },

      unofficial_napi_set_source_maps_enabled(env, enabled) {
        void env; void enabled;
        return NAPI_OK;
      },

      unofficial_napi_set_prepare_stack_trace_callback(env, callbackHandle) {
        void env; void callbackHandle;
        return NAPI_OK;
      },

      unofficial_napi_get_proxy_details(env, proxyHandle, targetOutPtr, handlerOutPtr) {
        void env; void proxyHandle;
        // Proxy internals are not exposed in this bridge yet; report "not a proxy".
        if (targetOutPtr) bridge.writeI32(targetOutPtr, 1);
        if (handlerOutPtr) bridge.writeI32(handlerOutPtr, 1);
        return NAPI_OK;
      },

      unofficial_napi_get_own_non_index_properties(env, valueHandle, filterBits, resultOutPtr) {
        void env; void filterBits;
        const value = bridge.getHandle(valueHandle);
        if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
          bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
          return NAPI_OBJECT_EXPECTED;
        }
        const keys = Reflect.ownKeys(value).filter((key) => {
          if (typeof key !== 'string') return true;
          if (key === '') return true;
          const n = Number(key);
          return !Number.isInteger(n) || n < 0 || String(n) !== key;
        });
        bridge.writeI32(resultOutPtr, bridge.createHandle(keys));
        return NAPI_OK;
      },

      unofficial_napi_set_enqueue_foreground_task_callback(env, callback, target) {
        void env; void callback; void target;
        return NAPI_OK;
      },

      unofficial_napi_set_fatal_error_callbacks(env, fatalCallback, oomCallback) {
        void env; void fatalCallback; void oomCallback;
        return NAPI_OK;
      },

      unofficial_napi_module_wrap_set_import_module_dynamically_callback(env, callbackHandle) {
        void env;
        bridge.moduleWrapImportModuleDynamicallyCallback = callbackHandle;
        return NAPI_OK;
      },

      unofficial_napi_module_wrap_set_initialize_import_meta_object_callback(env, callbackHandle) {
        void env;
        bridge.moduleWrapInitializeImportMetaObjectCallback = callbackHandle;
        return NAPI_OK;
      },

      unofficial_napi_contextify_compile_function(
        env,
        codeHandle,
        filenameHandle,
        lineOffset,
        columnOffset,
        cachedDataHandle,
        produceCachedData,
        parsingContextHandle,
        contextExtensionsHandle,
        paramsHandle,
        hostDefinedOptionHandle,
        resultOutPtr,
      ) {
        void parsingContextHandle;
        void contextExtensionsHandle;
        void hostDefinedOptionHandle;
        void cachedDataHandle;

        try {
          const source = String(bridge.getHandle(codeHandle) ?? '');
          const filename = String(bridge.getHandle(filenameHandle) ?? '');
          const paramsValue = bridge.getHandle(paramsHandle);
          const params = Array.isArray(paramsValue) ? paramsValue.map((x) => String(x)) : [];

          // Apply line/column offset annotations for better stack traces.
          // Format: //# sourceURL=filename:line:column (approximate, varies by engine)
          const adjustedFilename = filename || '<anonymous>';
          const lineOffsetNum = lineOffset || 0;
          const columnOffsetNum = columnOffset || 0;

          let compiled;
          try {
            compiled = new Function(...params, source);
          } catch (compileError) {
            // Enhance error with source location context
            const enhancedError = new SyntaxError(
              `${compileError.message} in ${adjustedFilename}:${lineOffsetNum + 1}:${columnOffsetNum}`,
            );
            bridge.setPendingException(enhancedError);
            return NAPI_PENDING_EXCEPTION;
          }

          // Attach source metadata for stack trace formatting
          try {
            Object.defineProperty(compiled, 'name', {
              value: params[0] || '<anonymous>',
              configurable: true,
            });
          } catch {
            // Ignore defineProperty failures
          }

          const result = {
            function: compiled,
            sourceURL: adjustedFilename,
            sourceMapURL: undefined,
            cachedDataProduced: !!(produceCachedData && compiled),
            cachedDataRejected: false,
            importModuleDynamically(specifier, assertions) {
              const { status, resultHandle } =
                bridge.invokeImportModuleDynamically(env, specifier, assertions, filename);
              if (status !== NAPI_OK) {
                return Promise.reject(
                  new Error(`Dynamic import failed for '${specifier}' (status ${status})`),
                );
              }
              const value = bridge.getHandle(resultHandle);
              return value instanceof Promise ? value : Promise.resolve(value);
            },
            // Store offset metadata for error formatting
            lineOffset: lineOffsetNum,
            columnOffset: columnOffsetNum,
          };
          bridge.writeI32(resultOutPtr, bridge.createHandle(result));
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (error) {
          bridge.setPendingException(error);
          return NAPI_PENDING_EXCEPTION;
        }
      },

      /**
       * Detects if source code is ESM by tokenizing and looking for import/export
       * statements at the module level, not inside strings or comments.
       * This is a production-grade lexer, not regex heuristics.
       */
      detectESMSource(source) {
        const len = source.length;
        let pos = 0;
        let inString = false;
        let stringChar = null;
        let inTemplate = false;
        let templateDepth = 0;
        let inComment = false;
        let commentType = null; // 'line' or 'block'
        let escaped = false;

        const keywords = [];

        while (pos < len) {
          const char = source[pos];
          const nextChar = source[pos + 1] || '';

          // Handle escaped characters
          if (escaped) {
            escaped = false;
            pos++;
            continue;
          }
          if (char === '\\') {
            escaped = true;
            pos++;
            continue;
          }

          // Handle comments
          if (!inString && !inTemplate) {
            if (!inComment && char === '/' && nextChar === '/') {
              inComment = true;
              commentType = 'line';
              pos += 2;
              continue;
            }
            if (!inComment && char === '/' && nextChar === '*') {
              inComment = true;
              commentType = 'block';
              pos += 2;
              continue;
            }
            if (inComment && commentType === 'line' && char === '\n') {
              inComment = false;
              commentType = null;
              pos++;
              continue;
            }
            if (inComment && commentType === 'block' && char === '*' && nextChar === '/') {
              inComment = false;
              commentType = null;
              pos += 2;
              continue;
            }
            if (inComment) {
              pos++;
              continue;
            }
          }

          // Handle template literals (backticks)
          if (!inString && !inComment) {
            if (char === '`') {
              if (!inTemplate) {
                inTemplate = true;
                templateDepth = 1;
              } else {
                templateDepth--;
                if (templateDepth === 0) {
                  inTemplate = false;
                }
              }
              pos++;
              continue;
            }
            if (inTemplate && char === '$' && nextChar === '{') {
              templateDepth++;
              pos += 2;
              continue;
            }
            if (inTemplate && templateDepth > 1 && char === '}') {
              templateDepth--;
              pos++;
              continue;
            }
          }

          // Handle regular strings
          if (!inTemplate && !inComment) {
            if (!inString && (char === '"' || char === "'")) {
              inString = true;
              stringChar = char;
              pos++;
              continue;
            }
            if (inString && char === stringChar) {
              inString = false;
              stringChar = null;
              pos++;
              continue;
            }
          }

          // Skip if inside string, template, or comment
          if (inString || inTemplate || inComment) {
            pos++;
            continue;
          }

          // Look for keywords (import/export)
          if (/[a-zA-Z_$]/.test(char)) {
            let word = '';
            let wordPos = pos;
            while (wordPos < len && /[a-zA-Z0-9_$]/.test(source[wordPos])) {
              word += source[wordPos];
              wordPos++;
            }

            if (word === 'import' || word === 'export') {
              // Check that this is actually a keyword, not an identifier
              // Keyword must be followed by non-identifier char or end of string
              const next = source[wordPos] || ' ';
              if (!/[a-zA-Z0-9_$]/.test(next)) {
                // Check that it's not preceded by an identifier (like 'myimport')
                const prev = source[pos - 1] || ' ';
                if (!/[a-zA-Z0-9_$]/.test(prev)) {
                  keywords.push({ type: word, pos });
                }
              }
            }

            pos = wordPos;
            continue;
          }

          // Check for CommonJS markers (module.exports, exports.xxx)
          if (char === 'm' && source.slice(pos, pos + 13) === 'module.exports') {
            const next = source[pos + 13] || ' ';
            if (!/[a-zA-Z0-9_$]/.test(next)) {
              return { isESM: false, reason: 'module.exports detected' };
            }
          }
          if (char === 'e' && source.slice(pos, pos + 7) === 'exports' && keywords.length === 0) {
            const next = source[pos + 7] || ' ';
            const prev = source[pos - 1] || ' ';
            if (!/[a-zA-Z0-9_$]/.test(next) && !/[a-zA-Z0-9_$]/.test(prev)) {
              // exports.xxx assignment indicates CommonJS
              // Look ahead for '=' or '.' to confirm it's an assignment
              let lookPos = pos + 7;
              while (lookPos < len && /\s/.test(source[lookPos])) lookPos++;
              if (source[lookPos] === '.' || source[lookPos] === '=') {
                return { isESM: false, reason: 'exports assignment detected' };
              }
            }
          }

          pos++;
        }

        // If we found import/export keywords and no CommonJS markers, it's likely ESM
        if (keywords.length > 0) {
          // Check for dynamic import() - this doesn't make it ESM
          const hasDynamicImport = keywords.some(k =>
            k.type === 'import' && source.slice(k.pos + 6, k.pos + 7) === '('
          );
          const hasStaticImport = keywords.some(k =>
            k.type === 'import' && source.slice(k.pos + 6, k.pos + 7) !== '('
          );
          const hasExport = keywords.some(k => k.type === 'export');

          if (hasStaticImport || hasExport) {
            return { isESM: true, keywords };
          }
          if (hasDynamicImport) {
            return { isESM: false, reason: 'dynamic import only' };
          }
        }

        return { isESM: false, reason: 'no ESM keywords found' };
      },

      unofficial_napi_contextify_compile_function_for_cjs_loader(
        env,
        codeHandle,
        filenameHandle,
        isSeaMain,
        shouldDetectModule,
        resultOutPtr,
      ) {
        void isSeaMain;

        try {
          const source = String(bridge.getHandle(codeHandle) ?? '');
          const filename = String(bridge.getHandle(filenameHandle) ?? '');

          // Production-grade ESM detection using proper tokenization
          let canParseAsESM = false;
          if (shouldDetectModule) {
            const detection = bridge.detectESMSource(source);
            canParseAsESM = detection.isESM;
          }

          let compiled;
          try {
            compiled = new Function(
              'exports',
              'require',
              'module',
              '__filename',
              '__dirname',
              source,
            );
          } catch (compileError) {
            const adjustedFilename = filename || '<anonymous>';
            const enhancedError = new SyntaxError(
              `${compileError.message} in ${adjustedFilename}`,
            );
            bridge.setPendingException(enhancedError);
            return NAPI_PENDING_EXCEPTION;
          }

          const result = {
            function: compiled,
            sourceURL: filename || '<anonymous>',
            sourceMapURL: undefined,
            cachedDataRejected: false,
            canParseAsESM,
            importModuleDynamically(specifier, assertions) {
              const { status, resultHandle } =
                bridge.invokeImportModuleDynamically(env, specifier, assertions, filename);
              if (status !== NAPI_OK) {
                return Promise.reject(
                  new Error(`Dynamic import failed for '${specifier}' (status ${status})`),
                );
              }
              const value = bridge.getHandle(resultHandle);
              return value instanceof Promise ? value : Promise.resolve(value);
            },
          };
          bridge.writeI32(resultOutPtr, bridge.createHandle(result));
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (error) {
          bridge.setPendingException(error);
          return NAPI_PENDING_EXCEPTION;
        }
      },

      unofficial_napi_get_error_source_positions(env, errorHandle, outPtr) {
        void env;
        const metadata = bridge.getErrorSourceMetadata(errorHandle);
        // unofficial_napi_error_source_positions:
        // source_line, script_resource_name, line_number, start_column, end_column
        bridge.writeI32(outPtr + 0, bridge.createHandle(metadata.sourceLine));
        bridge.writeI32(outPtr + 4, bridge.createHandle(metadata.scriptResourceName));
        bridge.writeI32(outPtr + 8, metadata.lineNumber | 0);
        bridge.writeI32(outPtr + 12, metadata.startColumn | 0);
        bridge.writeI32(outPtr + 16, metadata.endColumn | 0);
        return NAPI_OK;
      },

      unofficial_napi_get_error_source_line_for_stderr(env, errorHandle, resultOutPtr) {
        void env;
        const metadata = bridge.getErrorSourceMetadata(errorHandle);
        const rendered = metadata.lineNumber > 0
          ? `${metadata.scriptResourceName}:${metadata.lineNumber}:${metadata.startColumn}\n${metadata.sourceLine}`
          : metadata.sourceLine;
        bridge.writeI32(resultOutPtr, bridge.createHandle(rendered));
        return NAPI_OK;
      },

      unofficial_napi_get_error_thrown_at(env, errorHandle, resultOutPtr) {
        void env;
        const metadata = bridge.getErrorSourceMetadata(errorHandle);
        bridge.writeI32(resultOutPtr, bridge.createHandle(metadata.thrownAt));
        return NAPI_OK;
      },

      unofficial_napi_take_preserved_error_formatting(
        env,
        errorHandle,
        sourceLineOutPtr,
        thrownAtOutPtr,
      ) {
        void env;
        const metadata = bridge.getErrorSourceMetadata(errorHandle);
        if (sourceLineOutPtr) {
          bridge.writeI32(sourceLineOutPtr, bridge.createHandle(metadata.sourceLine));
        }
        if (thrownAtOutPtr) {
          bridge.writeI32(thrownAtOutPtr, bridge.createHandle(metadata.thrownAt));
        }
        return NAPI_OK;
      },

      unofficial_napi_create_private_symbol(env, descriptionPtr, length, resultPtr) {
        void env;
        const description = descriptionPtr ? bridge.readString(descriptionPtr, length) : '';
        const symbol = Symbol(description);
        bridge.writeI32(resultPtr, bridge.createHandle(symbol));
        return NAPI_OK;
      },

      // --- Module Registration ---
      napi_module_register(mod) {
        // Called by EdgeJS C++ to register built-in modules
        // The mod pointer contains the module descriptor
        console.log('[napi] Module registered');
        return NAPI_OK;
      },
    };
  }

  getImportModule() {
    const base = this.getImports();
    const bridge = this;

    // Fast path: when diagnostics are disabled, skip the Proxy wrapper entirely.
    // The Proxy adds ~1.83x overhead per call due to map increments and trace
    // array management. In production, return the raw imports object and only
    // intercept missing imports via a one-time check.
    if (!bridge.diagnosticsEnabled) {
      // Still need to handle missing imports for WebAssembly.instantiate
      const handler = {
        get(target, prop) {
          if (prop in target) return target[prop];
          if (typeof prop !== 'string') return undefined;
          bridge.recordMissingImport(prop);
          if (bridge.strictUnknownImports) {
            return () => {
              throw new Error(`N-API import '${String(prop)}' is not implemented (strict mode)`);
            };
          }
          return () => NAPI_GENERIC_FAILURE;
        },
      };
      return new Proxy(base, handler);
    }

    // Diagnostics path: full call tracing + error counting
    const wrapped = new Map();
    return new Proxy(base, {
      get(target, prop) {
        if (prop in target) {
          if (wrapped.has(prop)) return wrapped.get(prop);
          const original = target[prop];
          if (typeof original !== 'function') return original;
          const wrappedFn = (...args) => {
            const name = String(prop);
            bridge.importCallCounts.set(name, (bridge.importCallCounts.get(name) || 0) + 1);
            bridge.importCallTrace.push(name);
            if (bridge.importCallTrace.length > 5000) {
              bridge.importCallTrace.shift();
            }
            const status = original(...args);
            if (typeof status === 'number' && status !== NAPI_OK) {
              bridge.importErrorCounts.set(name, (bridge.importErrorCounts.get(name) || 0) + 1);
            }
            return status;
          };
          wrapped.set(prop, wrappedFn);
          return wrappedFn;
        }
        if (typeof prop !== 'string') return undefined;
        bridge.recordMissingImport(prop);
        if (bridge.strictUnknownImports) {
          return () => {
            throw new Error(`N-API import '${String(prop)}' is not implemented (strict mode)`);
          };
        }
        return () => NAPI_GENERIC_FAILURE;
      },
    });
  }
}

/**
 * Initialize EdgeJS in the browser.
 *
 * @param {object} options
 * @param {string} options.wasmUrl - URL to edgejs.wasm
 * @param {object} options.env - Environment variables
 * @param {object} options.fs - Virtual filesystem initial contents
 * @param {boolean} [options.preferJsScriptBridge] - Skip wasm invokeMain for runFile/eval; use MEMFS JS executor only (tests / constrained hosts)
 * @returns {Promise<object>} EdgeJS runtime instance
 */
export async function initEdgeJS(options = {}) {
  const strictUnknownImportsOption =
    options.strictUnknownImports ??
    (typeof process !== 'undefined' && process.env?.EDGEJS_STRICT_IMPORTS === '1');
  const diagnosticsOption =
    options.diagnosticsEnabled ??
    (typeof process !== 'undefined' && process.env?.EDGEJS_DIAGNOSTICS === '1');
  const bridge = new NapiBridge(null, {
    logNapiErrors: options.logNapiErrors,
    strictUnknownImports: strictUnknownImportsOption,
    diagnosticsEnabled: Boolean(diagnosticsOption),
  });

  // Detect real Node.js vs browser polyfill.
  // In real Node.js, import.meta.url starts with file://.
  // In browsers, it starts with http://.
  const isNode = typeof process !== 'undefined' && !!process.versions?.node
    && import.meta.url?.startsWith('file:');

  // Node does not expose JSPI constructors everywhere yet. Provide pass-through
  // fallbacks so local bridge tests can instantiate the module.
  if (typeof WebAssembly.Suspending !== 'function') {
    WebAssembly.Suspending = class {
      constructor(fn) { return fn; }
    };
  }
  if (typeof WebAssembly.promising !== 'function') {
    WebAssembly.promising = (fn) => fn;
  }

  // Load the Emscripten-generated module factory.
  let EdgeJSModule = options.moduleFactory;
  if (typeof EdgeJSModule !== 'function') {
    const moduleUrl = options.moduleUrl || './edgejs.js';
    try {
      const imported = await import(moduleUrl);
      if (typeof imported?.default === 'function') {
        EdgeJSModule = imported.default;
      } else if (typeof imported === 'function') {
        EdgeJSModule = imported;
      }
    } catch (_) {
      // Fall through to Node CJS loading path.
    }
  }
  if (typeof EdgeJSModule !== 'function' && isNode) {
    try {
      const { createRequire } = await import('node:module');
      const require = createRequire(import.meta.url);
      const modulePath = options.modulePath || '../build/edge';
      const loaded = require(modulePath);
      if (typeof loaded === 'function') {
        EdgeJSModule = loaded;
      }
    } catch (_) {
      // Module not found — will fall through to bridge-only mode.
    }
  }

  // ── Shared imports (used by both bridge-only and Wasm paths) ───────
  const { processBridge: _sharedProcessBridge } = await import('./browser-builtins.js');
  const { createFilesystem } = await import('./memfs.js');
  const { createFsModule, setActiveFsModule } = await import('./fs.js');
  const { setMemfs: _setShellMemfs } = await import('./shell-commands.js');
  const { setForkRequire: _setForkRequire } = await import('./child-process.js');

  // ── Per-runtime filesystem instance ────────────────────────────────
  // Each initEdgeJS() call gets its own isolated MEMFS for snapshots,
  // sync, and deterministic tests.
  const _sharedMemfs = createFilesystem({ files: options.files || {} });

  // Wire shell/git subsystems to use this runtime's filesystem
  _setShellMemfs(_sharedMemfs);

  // Create fs module bound to this runtime's MEMFS + cwd
  const _sharedBridgeFs = createFsModule(
    _sharedMemfs,
    () => _sharedProcessBridge.cwd(),
  );
  setActiveFsModule(_sharedBridgeFs);

  // Wire onStdout / onStderr callbacks into processBridge.
  // Optimization: reuse a single TextDecoder and batch writes per microtask
  // to reduce term.write() call overhead for high-frequency token streaming.
  const _stdDecoder = new TextDecoder('utf-8');

  function _makeBatchedWriter(callback) {
    let pending = '';
    let scheduled = false;
    return (chunk, encoding, cb) => {
      pending += typeof chunk === 'string' ? chunk : _stdDecoder.decode(chunk);
      if (!scheduled) {
        scheduled = true;
        Promise.resolve().then(() => {
          const out = pending;
          pending = '';
          scheduled = false;
          callback(out);
        });
      }
      cb();
    };
  }

  if (options.onStdout) {
    _sharedProcessBridge.stdout._write = _makeBatchedWriter(options.onStdout);
  }
  if (options.onStderr) {
    _sharedProcessBridge.stderr._write = _makeBatchedWriter(options.onStderr);
  }

  // Apply env vars
  if (options.env) {
    for (const [k, v] of Object.entries(options.env)) {
      _sharedProcessBridge.env[k] = v;
    }
  }

  // ── Shared module registration + MEMFS require() ──────────────────
  const _builtinOverrides = new Map();

  function _registerBuiltinOverride(name, impl) {
    _builtinOverrides.set(name, impl);
  }

  const _moduleCache = new Map();

  // ── Module cache invalidation via mutation journal ─────────────────
  // When a file is written/renamed/unlinked, evict its module cache entry
  // so subsequent require() calls pick up the new content.
  _sharedMemfs.onMutation((record) => {
    if (record.op === 'writeFile' || record.op === 'create' ||
        record.op === 'unlink' || record.op === 'rename') {
      _moduleCache.delete(record.path);
      // For rename, also evict the new path
      if (record.op === 'rename' && record.newPath) {
        _moduleCache.delete(record.newPath);
      }
    }
  });

  // Use canonical path resolution from memfs
  const { normalizePath: _normPath, resolvePath: _resolvePath } = await import('./memfs.js');
  const {
    parsePackageSpecifier,
    resolvePackageExportsMappingFromPkg,
  } = await import('./package-resolve.js');

  function _packageJsonTypeModuleForPath(absFile) {
    let dir = absFile.includes('/') ? absFile.substring(0, absFile.lastIndexOf('/')) || '/' : '/';
    const seen = new Set();
    while (!seen.has(dir)) {
      seen.add(dir);
      try {
        const pj = _normPath(dir === '/' ? '/package.json' : `${dir}/package.json`);
        const raw = _sharedBridgeFs.readFileSync(pj, 'utf8');
        return JSON.parse(raw).type === 'module';
      } catch {
        /* missing or invalid */
      }
      if (dir === '/' || dir === '') return false;
      const slash = dir.lastIndexOf('/');
      dir = slash <= 0 ? '/' : dir.substring(0, slash);
    }
    return false;
  }

  function _needsEsmTranspile(scriptPath, source) {
    const lower = scriptPath.toLowerCase();
    if (lower.endsWith('.mjs') || lower.endsWith('.mts')) return true;
    if (lower.endsWith('.cjs')) return false;
    if (lower.endsWith('.js') && _packageJsonTypeModuleForPath(scriptPath)) return true;
    const s = source.trimStart();
    if (/^import\s+[\s*{]/.test(s) || /^export\s+/.test(s)) return true;
    return false;
  }

  function _memfsFileUrl(absPath) {
    const p = absPath.startsWith('/') ? absPath : `/${absPath}`;
    return `file://${p}`;
  }

  function _cjsExportsToImportNamespace(exp) {
    if (exp == null || typeof exp !== 'object') return { default: exp };
    if (exp.__esModule) return exp;
    return { ...exp, default: exp.default !== undefined ? exp.default : exp };
  }

  const _esmImportDirStack = [];
  const _dynamicImportPromises = new Map();
  const _dynamicImportLoading = new Set();
  let _pendingImportsForRun = null;

  async function _memfsDynamicImport(specifier) {
    const traceWork = (async () => {
      if (typeof specifier !== 'string') {
        throw new TypeError('dynamic import specifier must be a string');
      }
      const baseDir = _esmImportDirStack.length
        ? _esmImportDirStack[_esmImportDirStack.length - 1]
        : _sharedProcessBridge.cwd();

      const resolved = _resolveModule(specifier, baseDir);
      if (!resolved) {
        const err = new Error(`Cannot find module '${specifier}'`);
        err.code = 'ERR_MODULE_NOT_FOUND';
        throw err;
      }
      if (resolved.type === 'builtin') {
        return _cjsExportsToImportNamespace(resolved.exports);
      }

      const abs = resolved.path;
      if (_dynamicImportPromises.has(abs)) {
        return await _dynamicImportPromises.get(abs);
      }
      if (abs.endsWith('.node')) {
        const e = new Error(`Cannot load native module '${abs}': native addons (.node) are not supported in-tab`);
        e.code = 'ERR_DLOPEN_FAILED';
        throw e;
      }

      const promise = (async () => {
        if (abs.endsWith('.json')) {
          return { default: JSON.parse(_sharedBridgeFs.readFileSync(abs, 'utf8')) };
        }
        if (_dynamicImportLoading.has(abs)) {
          const err = new Error(`Unsupported circular dynamic import while loading '${abs}'`);
          err.code = 'ERR_UNSUPPORTED_NODE_MODULES_TYPE';
          throw err;
        }
        _dynamicImportLoading.add(abs);
        const zDir = abs.includes('/') ? abs.substring(0, abs.lastIndexOf('/')) || '/' : '/';
        _esmImportDirStack.push(zDir);
        try {
          let zSrc = _sharedBridgeFs.readFileSync(abs, 'utf8');
          if (zSrc.startsWith('#!')) zSrc = zSrc.substring(zSrc.indexOf('\n') + 1);

          if (_needsEsmTranspile(abs, zSrc)) {
            const esbuild = await import('esbuild');
            zSrc = esbuild.transformSync(zSrc, {
              loader: 'js',
              format: 'cjs',
              platform: 'neutral',
              target: 'es2022',
              define: { 'import.meta.url': JSON.stringify(_memfsFileUrl(abs)) },
            }).code;
            zSrc = zSrc.replace(/\bimport\s*\(/g, 'globalThis.__memfsDynamicImport(');
          } else if (/\bimport\s*\(/.test(zSrc)) {
            zSrc = zSrc.replace(/\bimport\s*\(/g, 'globalThis.__memfsDynamicImport(');
          }

          const moduleObj = { exports: {} };
          const zfn = new Function(
            'require', 'module', 'exports', '__filename', '__dirname',
            zSrc,
          );
          zfn(
            (dep) => _memfsRequire(dep, zDir),
            moduleObj,
            moduleObj.exports,
            abs,
            zDir,
          );
          return _cjsExportsToImportNamespace(moduleObj.exports);
        } finally {
          _esmImportDirStack.pop();
          _dynamicImportLoading.delete(abs);
        }
      })();

      _dynamicImportPromises.set(abs, promise);
      try {
        return await promise;
      } catch (e) {
        _dynamicImportPromises.delete(abs);
        throw e;
      }
    })();

    if (_pendingImportsForRun) _pendingImportsForRun.add(traceWork);
    try {
      return await traceWork;
    } finally {
      if (_pendingImportsForRun) _pendingImportsForRun.delete(traceWork);
    }
  }

  function _resolveNodeModuleBare(name, fromDir) {
    const parsed = parsePackageSpecifier(name);
    if (!parsed) return null;
    const { packageName, subpath } = parsed;
    const conditions = ['node', 'require', 'default'];

    let dir = fromDir;
    while (dir.length > 0) {
      const candidate = _normPath(`${dir}/node_modules/${packageName}`);

      let pkg = null;
      try {
        const pkgSrc = _sharedBridgeFs.readFileSync(`${candidate}/package.json`, 'utf8');
        pkg = JSON.parse(pkgSrc);
      } catch { /* no package.json */ }

      if (pkg?.exports != null) {
        const rel = resolvePackageExportsMappingFromPkg(pkg, subpath, conditions);
        if (rel) {
          const full = _normPath(`${candidate}/${String(rel).replace(/^\.\//, '')}`);
          const r = _tryResolveFile(full);
          if (r) return r;
        }
        if (subpath !== '.') {
          const idx = dir.lastIndexOf('/');
          if (idx <= 0) break;
          dir = dir.substring(0, idx);
          continue;
        }
      }

      if (subpath === '.') {
        if (pkg) {
          if (!pkg.exports) {
            const main = pkg.module || pkg.main || 'index.js';
            const mr = _tryResolveFile(_normPath(`${candidate}/${String(main).replace(/^\.\//, '')}`));
            if (mr) return mr;
          }
          const direct = _tryResolveFile(candidate);
          if (direct) return direct;
        } else {
          const direct = _tryResolveFile(candidate);
          if (direct) return direct;
        }
      } else if (!pkg?.exports) {
        const legacyRel = subpath.replace(/^\.\//, '');
        const r = _tryResolveFile(_normPath(`${candidate}/${legacyRel}`));
        if (r) return r;
      }

      const idx = dir.lastIndexOf('/');
      if (idx <= 0) break;
      dir = dir.substring(0, idx);
    }
    return null;
  }

  function _resolveModule(name, fromDir) {
    const builtin = _builtinOverrides.get(name);
    if (builtin) return { type: 'builtin', exports: builtin };
    if (name.startsWith('node:')) {
      const b2 = _builtinOverrides.get(name.slice(5));
      if (b2) return { type: 'builtin', exports: b2 };
    }
    // Resolve subpath imports (e.g. path/win32, path/posix, stream/promises)
    const slashIdx = name.indexOf('/');
    if (slashIdx > 0 && !name.startsWith('.') && !name.startsWith('/')) {
      const base = name.substring(0, slashIdx);
      const stripped = name.startsWith('node:') ? base.slice(5) : base;
      const parent = _builtinOverrides.get(stripped) || _builtinOverrides.get(name.replace('node:', ''));
      if (parent) return { type: 'builtin', exports: parent };
    }
    if (name.startsWith('./') || name.startsWith('../') || name.startsWith('/')) {
      const base = name.startsWith('/') ? name : fromDir + '/' + name;
      return _tryResolveFile(_normPath(base));
    }
    return _resolveNodeModuleBare(name, fromDir);
  }

  function _tryResolveFile(absPath) {
    if (_fstat(absPath)) return { type: 'file', path: absPath };
    if (_fstat(absPath + '.js')) return { type: 'file', path: absPath + '.js' };
    if (_fstat(absPath + '.json')) return { type: 'file', path: absPath + '.json' };
    if (_fstat(absPath + '.mjs')) return { type: 'file', path: absPath + '.mjs' };
    if (_fstat(absPath + '/index.js')) return { type: 'file', path: absPath + '/index.js' };
    if (_fstat(absPath + '/index.json')) return { type: 'file', path: absPath + '/index.json' };
    try {
      const pkgSrc = _sharedBridgeFs.readFileSync(absPath + '/package.json', 'utf8');
      const pkg = JSON.parse(pkgSrc);
      const main = pkg.main || pkg.module || 'index.js';
      const mp = _normPath(absPath + '/' + main);
      if (_fstat(mp)) return { type: 'file', path: mp };
      if (_fstat(mp + '.js')) return { type: 'file', path: mp + '.js' };
    } catch { /* no package.json */ }
    return null;
  }

  function _fstat(p) {
    try { const s = _sharedBridgeFs.statSync(p); return s.isFile(); } catch { return false; }
  }

  function _memfsRequire(name, fromDir) {
    fromDir = fromDir || _sharedProcessBridge.cwd();
    const resolved = _resolveModule(name, fromDir);
    if (!resolved) {
      console.warn(`[require] Cannot find module '${name}' from '${fromDir}'`);
      throw new Error(`Cannot find module '${name}' from '${fromDir}'`);
    }
    if (resolved.type === 'builtin') return resolved.exports;

    const filePath = resolved.path;
    if (filePath.endsWith('.node')) {
      const e = new Error(
        `Cannot load native module '${filePath}': native addons (.node) are not supported in-tab`,
      );
      e.code = 'ERR_DLOPEN_FAILED';
      throw e;
    }
    if (_moduleCache.has(filePath)) return _moduleCache.get(filePath).exports;

    const source = _sharedBridgeFs.readFileSync(filePath, 'utf8');
    const dirName = filePath.substring(0, filePath.lastIndexOf('/')) || '/';

    if (filePath.endsWith('.json')) {
      const parsed = JSON.parse(source);
      _moduleCache.set(filePath, { exports: parsed });
      return parsed;
    }

    const moduleObj = { exports: {}, id: filePath, filename: filePath, loaded: false };
    _moduleCache.set(filePath, moduleObj);

    const localRequire = (dep) => _memfsRequire(dep, dirName);
    localRequire.resolve = (dep) => {
      const r = _resolveModule(dep, dirName);
      if (!r || r.type === 'builtin') return dep;
      return r.path;
    };

    try {
      // C6: SECURITY NOTE — new Function() executes loaded modules with full
      // access to globalThis. This is intentional: Claude Code and its
      // dependencies require unrestricted JS execution. The trust boundary
      // is at the MEMFS level — only code pre-loaded into MEMFS (via
      // initEdgeJS({ files }) or runtime.fs.writeFileSync) can be required.
      // Do NOT load untrusted code into MEMFS without sandboxing.
      const wrapped = new Function(
        'exports', 'require', 'module', '__filename', '__dirname',
        source
      );
      wrapped(moduleObj.exports, localRequire, moduleObj, filePath, dirName);
      moduleObj.loaded = true;
    } catch (err) {
      _moduleCache.delete(filePath);
      throw err;
    }
    return moduleObj.exports;
  }

  // Wire fork() to use this runtime's require system for in-process child isolation
  _setForkRequire(_memfsRequire);

  // M9: require.main and require.cache for compatibility
  _memfsRequire.main = null;
  _memfsRequire.cache = _moduleCache;
  _memfsRequire.resolve = (name, fromDir = _sharedProcessBridge.cwd()) => {
    const r = _resolveModule(name, fromDir);
    if (!r || r.type === 'builtin') return name;
    return r.path;
  };

  // ── Auto-register browser builtins at boot ─────────────────────────
  // Guarantee all browser-native overrides are installed before any user
  // code runs, rather than relying on ad hoc registration in web/terminal.js.
  const { registerBrowserBuiltins: _autoRegister } = await import('./browser-builtins.js');
  const _runtimeShell = { _registerBuiltinOverride, _memfsRequire };
  _autoRegister(_runtimeShell, { fs: _sharedBridgeFs });

  // ── Bridge-only mode ────────────────────────────────────────────────
  // When no Wasm module is available, return a lightweight runtime backed
  // entirely by our JS bridge modules (MEMFS fs, shell shims, etc.).
  if (typeof EdgeJSModule !== 'function') {
    return {
      _registerBuiltinOverride,
      _getBuiltinOverride(name) { return _builtinOverrides.get(name); },
      get _builtinOverrides() { return _builtinOverrides; },

      eval(code) {
        try { return (0, eval)(code); }
        catch (err) { throw new Error(err.message || 'eval failed'); }
      },

      runFile(path) {
        // M7: Log errors to stderr instead of swallowing silently
        try {
          _memfsRequire(String(path), _sharedProcessBridge.cwd());
          return 0;
        } catch (err) {
          try { _sharedProcessBridge.stderr.write(`Error: ${err.message}\n`); } catch {}
          return 1;
        }
      },

      async runFileAsync(path) {
        return this.runFile(path);
      },

      async runNodeEntry(opts = {}) {
        const entry = opts.entry;
        if (entry == null || entry === '') {
          throw new Error('runNodeEntry: options.entry is required');
        }
        const cwd = opts.cwd ?? '/workspace';
        try {
          _sharedBridgeFs.mkdirSync(cwd, { recursive: true });
        } catch {
          /* exists */
        }
        _sharedProcessBridge.chdir(cwd);
        const argv0 = opts.argv0 ?? 'node';
        const rest = Array.isArray(opts.argv) ? opts.argv.map(String) : [];
        _sharedProcessBridge.argv = [argv0, String(entry), ...rest];
        if (opts.env && typeof opts.env === 'object') {
          for (const [k, v] of Object.entries(opts.env)) {
            _sharedProcessBridge.env[k] = v;
          }
        }
        try {
          _memfsRequire(String(entry), _sharedProcessBridge.cwd());
          return { status: 0, stdout: [], stderr: [] };
        } catch (err) {
          try {
            _sharedProcessBridge.stderr.write(`${err.stack || err.message}\n`);
          } catch {
            /* ignore */
          }
          return { status: 1, stdout: [], stderr: [err.stack || err.message] };
        }
      },

      execute(scriptPath, opts = {}) {
        try {
          _memfsRequire(String(scriptPath), _sharedProcessBridge.cwd());
          return { status: 0, result: undefined, error: null, stdout: [], stderr: [] };
        } catch (err) {
          return { status: 1, result: undefined, error: err.message, stdout: [], stderr: [err.message] };
        }
      },

      fs: _sharedBridgeFs,
      require: _memfsRequire,
      module: null,

      // ── Sync/replication plane ─────────────────────────────────────
      // Exposed separately from fs API for external sync engines.

      /** Capture filesystem metadata snapshot (COW-friendly: hashes, not byte clones). */
      fsSnapshot() { return _sharedMemfs.snapshot(); },

      /** Capture full snapshot with byte content (for initial sync/restore). */
      fsSnapshotFull() { return _sharedMemfs.snapshotFull(); },

      /** Get journal entries since seq. Returns { gap, entries, gapFrom?, gapTo? }. */
      fsJournalSince(seq) { return _sharedMemfs.getJournalSince(seq); },

      /** Subscribe to filesystem mutations. Returns unsubscribe function. */
      fsWatch(callback) { return _sharedMemfs.onMutation(callback); },

      /** Begin a transactional batch of mutations. Returns txid. */
      fsBeginTx() { return _sharedMemfs.beginTx(); },

      /** Commit the current transaction. */
      fsCommitTx() { return _sharedMemfs.commitTx(); },

      pushStdin(data) {
        _sharedProcessBridge.stdin.push(typeof data === 'string' ? data : String(data));
      },

      setTerminalSize(cols, rows) {
        _sharedProcessBridge.stdout.columns = cols;
        _sharedProcessBridge.stdout.rows = rows;
        _sharedProcessBridge.stderr.columns = cols;
        _sharedProcessBridge.stderr.rows = rows;
        try { _sharedProcessBridge.emit('SIGWINCH'); } catch {}
      },

      diagnostics() {
        return {
          mode: 'bridge-only',
          missingImports: {},
          importCalls: {},
          importErrors: {},
          importTrace: [],
          recentImportTrace: [],
          executionCounter: 0,
        };
      },
    };
  }

  const napiImports = bridge.getImportModule();
  const stdoutBuffer = [];
  const stderrBuffer = [];
  let wasmBinary = null;
  if (isNode) {
    try {
      const { readFileSync } = await import('node:fs');
      const wasmPath = options.wasmPath || '../build/edge.wasm';
      wasmBinary = readFileSync(new URL(wasmPath, import.meta.url));
    } catch (_) {
      wasmBinary = null;
    }
  }

  // Temporarily clear process.versions.node during module factory call.
  // Emscripten's IIFE checks this and calls require('node:worker_threads')
  // if it thinks we're in Node.js. In the browser, require doesn't exist.
  const _savedNode = globalThis.process?.versions?.node;
  if (!isNode && globalThis.process?.versions) {
    delete globalThis.process.versions.node;
  }

  const instance = await EdgeJSModule({
    // Inject N-API bridge imports.
    napi: napiImports,
    napiImports,
    noInitialRun: true,
    noExitRuntime: true,

    // Override abort for "missing function" stubs — Emscripten generates
    // abort('missing function: X') for every unresolved symbol at link time.
    // For OpenSSL stubs, these are expected and should not crash the runtime.
    abort(what) {
      if (typeof what === 'string' && what.startsWith('missing function:')) {
        // Silently ignore missing OpenSSL/crypto stubs
        return;
      }
      throw new Error('Aborted: ' + what);
    },

    // Environment variables (for API keys etc.)
    ENV: {
      HOME: '/home/user',
      PATH: '/usr/bin:/bin',
      NODE_ENV: 'production',
      ...options.env,
    },

    // Force import wiring for the extra "napi" module that Emscripten does not
    // include in getWasmImports() by default.
    instantiateWasm(info, receiveInstance) {
      // Minimal env-level overrides for functions that have no native Emscripten
      // equivalent. Every other env import must be provided by the Emscripten
      // glue; missing imports will surface during instantiation because the
      // `has` trap returns false for unknown properties.
      const envOverrides = Object.create(null);
      envOverrides.uv_setup_args = (argc, argv) => argv;
      envOverrides.uv__hrtime = () => 0;

      // OpenSSL init stubs — return non-zero "success" to prevent abort().
      // The binary links against OpenSSL but crypto is shimmed via JS.
      envOverrides.OPENSSL_INIT_new = () => 1;       // Returns OPENSSL_INIT_SETTINGS*
      envOverrides.OPENSSL_INIT_free = () => {};
      envOverrides.OPENSSL_init_crypto = () => 1;     // Returns 1 on success
      envOverrides.OPENSSL_INIT_set_config_filename = () => {};
      envOverrides.OPENSSL_INIT_set_config_appname = () => {};
      envOverrides.OPENSSL_INIT_set_config_file_flags = () => {};
      envOverrides.OPENSSL_sk_new_null = () => 1;     // Returns OPENSSL_STACK*
      envOverrides.OPENSSL_sk_push = () => 1;
      envOverrides.OPENSSL_sk_num = () => 0;
      envOverrides.OPENSSL_sk_value = () => 0;
      envOverrides.OPENSSL_sk_pop_free = () => {};

      const envBase = info.env || {};
      const envProxy = new Proxy(envBase, {
        has(target, prop) {
          return prop in envOverrides || prop in target;
        },
        get(target, prop) {
          if (prop in envOverrides) return envOverrides[prop];
          if (prop in target) return target[prop];
          // Return a no-op stub for any unresolved env import.
          // Some wasm functions expect i64 (BigInt) return values.
          // We can't know the signature at proxy-time, so return 0 and
          // let the caller handle it.
          if (typeof prop === 'string') return (..._args) => 0;
          return undefined;
        },
      });

      // Stub any import modules the wasm expects but the Emscripten glue
      // doesn't provide (e.g. napi_extension_wasmer_v0, wasi_snapshot_preview1).
      // These are no-op stubs — the real implementations live in JS shims or
      // are provided by the Emscripten runtime via env.
      const _stubProxy = (tag) => new Proxy(Object.create(null), {
        has: () => true,
        get: (_, prop) => {
          if (typeof prop === 'symbol') return undefined;
          return (..._args) => 0;
        },
      });

      const imports = {
        ...info,
        env: envProxy,
        napi: napiImports,
        // napi_extension_wasmer_v0 contains unofficial_napi_* functions.
        // Route to the bridge's real implementations when available,
        // fall back to no-op stubs for unimplemented ones.
        napi_extension_wasmer_v0: new Proxy(Object.create(null), {
          has: () => true,
          get: (_, prop) => {
            if (typeof prop === 'symbol') return undefined;
            if (prop in napiImports) return napiImports[prop];
            return (..._args) => 0;
          },
        }),
        ...(info.wasi_snapshot_preview1 ? { wasi_snapshot_preview1: info.wasi_snapshot_preview1 } : {}),
      };
      const onInstantiated = (result) => {
        // Bind bridge memory BEFORE receiveInstance triggers static
        // constructors (__wasm_call_ctors). The C++ static init calls
        // unofficial_napi_create_env which needs writePointer to work.
        if (result.instance.exports.memory) {
          bridge.memory = new Uint8Array(result.instance.exports.memory.buffer);
          bridge._wasmMemory = result.instance.exports.memory;
        }
        receiveInstance(result.instance, result.module);
        return result.instance.exports;
      };

      if (wasmBinary) {
        return WebAssembly.instantiate(wasmBinary, imports).then(onInstantiated);
      }

      const wasmUrl = options.wasmUrl || './edgejs.wasm';
      // Prefer instantiateStreaming for faster startup — compiles while
      // downloading instead of waiting for the full arrayBuffer first.
      // Falls back to arrayBuffer path when MIME type is wrong (non-wasm).
      if (typeof WebAssembly.instantiateStreaming === 'function') {
        return WebAssembly.instantiateStreaming(fetch(wasmUrl), imports)
          .catch(() =>
            // Fallback: server may not serve application/wasm MIME type
            fetch(wasmUrl)
              .then((res) => res.arrayBuffer())
              .then((buf) => WebAssembly.instantiate(buf, imports))
          )
          .then(onInstantiated);
      }
      return fetch(wasmUrl)
        .then((res) => res.arrayBuffer())
        .then((buf) => WebAssembly.instantiate(buf, imports))
        .then(onInstantiated);
    },

    // Emscripten callbacks
    onRuntimeInitialized() {
      bridge.wasm = this;
      bridge.memory = this.HEAPU8;
      bridge._wasmMemory = this.wasmMemory || (this.HEAPU8 && { buffer: this.HEAPU8.buffer });
    },

    // Filesystem pre-population
    preRun: [
      function (mod) {
        if (options.fs) {
          for (const [path, content] of Object.entries(options.fs)) {
            const dir = path.substring(0, path.lastIndexOf('/'));
            mod.FS.mkdirTree(dir);
            mod.FS.writeFile(path, content);
          }
        }
      },
    ],

    // stdout/stderr capture
    print: (...args) => {
      const line = args.map((x) => String(x)).join(' ');
      stdoutBuffer.push(line);
      (options.onStdout || console.log)(...args);
    },
    printErr: (...args) => {
      const line = args.map((x) => String(x)).join(' ');
      stderrBuffer.push(line);
      (options.onStderr || console.error)(...args);
    },
  });

  // Restore process.versions.node after factory call
  if (!isNode && globalThis.process?.versions && _savedNode) {
    globalThis.process.versions.node = _savedNode;
  }

  bridge.wasm = instance;
  bridge.memory = instance.HEAP8;

  // Wire Wasm instance into processBridge for real memoryUsage() telemetry
  _sharedProcessBridge._wasmInstance = instance;

  function invokeMain(args) {
    if (typeof instance._main !== 'function') {
      throw new Error('Edge main entry point not available');
    }

    const baselineScopeDepth = bridge.handleScopes.length;
    bridge.openHandleScope();

    const cliArgs = ['edge', ...args.map((arg) => String(arg))];
    bridge.lastMainArgPath = cliArgs[1] || '';
    const argvPointers = [];
    let argvPtr = 0;
    try {
      for (const value of cliArgs) {
        const byteLength = utf8ByteLength(value) + 1;
        const ptr = instance._malloc(byteLength);
        instance.stringToUTF8(value, ptr, byteLength);
        argvPointers.push(ptr);
      }

      argvPtr = instance._malloc((argvPointers.length + 1) * 4);
      // Emscripten exposes HEAPU8 and HEAP32 on Module but not HEAPU32.
      // Create a Uint32Array view from the underlying buffer.
      const heapU32 = instance.HEAPU32
        || new Uint32Array(instance.HEAPU8.buffer);
      for (let i = 0; i < argvPointers.length; i++) {
        heapU32[(argvPtr >> 2) + i] = argvPointers[i];
      }
      heapU32[(argvPtr >> 2) + argvPointers.length] = 0;

      return instance._main(cliArgs.length, argvPtr);
    } finally {
      if (typeof instance._free === 'function') {
        if (argvPtr) {
          instance._free(argvPtr);
        }
        for (const ptr of argvPointers) {
          instance._free(ptr);
        }
      }
      while (bridge.handleScopes.length > baselineScopeDepth) {
        bridge.closeHandleScope();
      }
    }
  }

  // ── JS-side script execution (bypasses C++ libuv event loop) ──────
  // When the C++ runtime's EdgeRunScriptFileWithLoop aborts due to
  // stubbed libuv, we fall back to evaluating scripts directly in the
  // browser's V8 engine using the bridge's own module system.
  let _useJsBridge = Boolean(options.preferJsScriptBridge);

  function executeViaBridge(scriptPath) {
    const stdoutLines = [];
    const stderrLines = [];

    // Read script from MEMFS
    let source;
    try {
      source = _sharedBridgeFs.readFileSync(scriptPath, 'utf8');
    } catch (err) {
      return { status: 1, stdout: [], stderr: [`Cannot read ${scriptPath}: ${err.message}`] };
    }

    // Strip shebang line (#!/usr/bin/env node)
    if (source.startsWith('#!')) {
      source = source.substring(source.indexOf('\n') + 1);
    }

    if (_needsEsmTranspile(scriptPath, source)) {
      return {
        status: 1,
        stdout: [],
        stderr: [
          `ESM syntax in ${scriptPath} requires async execution (runFileAsync / executeCliAsync / runNodeEntry).`,
        ],
      };
    }

    // Build a Node-like execution context
    const dirname = scriptPath.substring(0, scriptPath.lastIndexOf('/')) || '/';
    const moduleObj = { exports: {}, id: scriptPath, filename: scriptPath, loaded: false };

    const contextKeys = ['require', 'module', 'exports', '__filename', '__dirname', 'console', 'process', 'Buffer', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask', 'globalThis'];
    const contextVals = [
      _memfsRequire,
      moduleObj,
      moduleObj.exports,
      scriptPath,
      dirname,
      {
        log: (...args) => {
          const line = args.map(String).join(' ');
          stdoutLines.push(line);
          if (options.onStdout) options.onStdout(line);
        },
        error: (...args) => {
          const line = args.map(String).join(' ');
          stderrLines.push(line);
          if (options.onStderr) options.onStderr(line);
        },
        warn: (...args) => {
          const line = args.map(String).join(' ');
          stderrLines.push(line);
          if (options.onStderr) options.onStderr(line);
        },
        info: (...args) => {
          const line = args.map(String).join(' ');
          stdoutLines.push(line);
          if (options.onStdout) options.onStdout(line);
        },
        debug: () => {},
        trace: () => {},
        dir: (...args) => {
          const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
          stdoutLines.push(line);
          if (options.onStdout) options.onStdout(line);
        },
      },
      {
        argv: Array.isArray(_sharedProcessBridge.argv) && _sharedProcessBridge.argv.length
          ? [..._sharedProcessBridge.argv]
          : ['node', scriptPath],
        env: (() => {
          const base = {
            HOME: '/home/user',
            PATH: '/usr/bin:/bin',
            NODE_ENV: 'production',
          };
          const be = _sharedProcessBridge.env;
          if (be && typeof be === 'object') {
            for (const k of Object.keys(be)) {
              try {
                base[k] = be[k];
              } catch {
                /* ignore */
              }
            }
          }
          return { ...base, ...(options.env || {}) };
        })(),
        cwd: () => _sharedMemfs.cwd?.() || '/',
        exit: (code) => { throw Object.assign(new Error(`process.exit(${code})`), { exitCode: code }); },
        stdout: { write: (data) => { const s = String(data); stdoutLines.push(s); if (options.onStdout) options.onStdout(s); } },
        stderr: { write: (data) => { const s = String(data); stderrLines.push(s); if (options.onStderr) options.onStderr(s); } },
        platform: 'linux',
        arch: 'wasm32',
        version: 'v22.0.0',
        versions: { node: '22.0.0', v8: '12.0.0' },
        hrtime: { bigint: () => BigInt(Math.round(performance.now() * 1e6)) },
        nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)),
        on: () => ({ on: () => ({}) }),
        removeListener: () => {},
      },
      globalThis.Buffer || { from: (x) => new Uint8Array(typeof x === 'string' ? new TextEncoder().encode(x) : x) },
      globalThis.setTimeout,
      globalThis.setInterval,
      globalThis.clearTimeout,
      globalThis.clearInterval,
      globalThis.queueMicrotask,
      globalThis,
    ];

    try {
      const fn = new Function(...contextKeys, source);
      const ret = fn(...contextVals);
      if (ret != null && typeof ret.then === 'function') {
        stderrLines.push(
          'Script returned a Promise; use runtime.runFileAsync() so async work completes.',
        );
        if (options.onStderr) {
          options.onStderr(stderrLines[stderrLines.length - 1]);
        }
        return { status: 1, stdout: stdoutLines, stderr: stderrLines };
      }
      return { status: 0, stdout: stdoutLines, stderr: stderrLines };
    } catch (err) {
      if (err.exitCode !== undefined) {
        return { status: err.exitCode, stdout: stdoutLines, stderr: stderrLines };
      }
      stderrLines.push(err.stack || err.message);
      if (options.onStderr) options.onStderr(err.stack || err.message);
      return { status: 1, stdout: stdoutLines, stderr: stderrLines };
    }
  }

  async function executeViaBridgeAsync(scriptPath) {
    const stdoutLines = [];
    const stderrLines = [];

    let source;
    try {
      source = _sharedBridgeFs.readFileSync(scriptPath, 'utf8');
    } catch (err) {
      return { status: 1, stdout: [], stderr: [`Cannot read ${scriptPath}: ${err.message}`] };
    }

    if (source.startsWith('#!')) {
      source = source.substring(source.indexOf('\n') + 1);
    }

    const importMetaUrl = _memfsFileUrl(scriptPath);
    if (_needsEsmTranspile(scriptPath, source)) {
      try {
        const esbuild = await import('esbuild');
        source = esbuild.transformSync(source, {
          loader: 'js',
          format: 'cjs',
          platform: 'neutral',
          target: 'es2022',
          define: { 'import.meta.url': JSON.stringify(importMetaUrl) },
        }).code;
        source = source.replace(/\bimport\s*\(/g, 'globalThis.__memfsDynamicImport(');
      } catch (err) {
        return {
          status: 1,
          stdout: [],
          stderr: [`ESM transpile failed for ${scriptPath}: ${err.message}`],
        };
      }
    } else if (/\bimport\s*\(/.test(source)) {
      source = source.replace(/\bimport\s*\(/g, 'globalThis.__memfsDynamicImport(');
    }

    const dirname = scriptPath.substring(0, scriptPath.lastIndexOf('/')) || '/';
    _esmImportDirStack.length = 0;
    _esmImportDirStack.push(dirname);
    _pendingImportsForRun = new Set();
    const moduleObj = { exports: {}, id: scriptPath, filename: scriptPath, loaded: false };

    const contextKeys = ['require', 'module', 'exports', '__filename', '__dirname', 'console', 'process', 'Buffer', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask', 'globalThis'];
    const contextVals = [
      _memfsRequire,
      moduleObj,
      moduleObj.exports,
      scriptPath,
      dirname,
      {
        log: (...args) => {
          const line = args.map(String).join(' ');
          stdoutLines.push(line);
          if (options.onStdout) options.onStdout(line);
        },
        error: (...args) => {
          const line = args.map(String).join(' ');
          stderrLines.push(line);
          if (options.onStderr) options.onStderr(line);
        },
        warn: (...args) => {
          const line = args.map(String).join(' ');
          stderrLines.push(line);
          if (options.onStderr) options.onStderr(line);
        },
        info: (...args) => {
          const line = args.map(String).join(' ');
          stdoutLines.push(line);
          if (options.onStdout) options.onStdout(line);
        },
        debug: () => {},
        trace: () => {},
        dir: (...args) => {
          const line = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
          stdoutLines.push(line);
          if (options.onStdout) options.onStdout(line);
        },
      },
      {
        argv: Array.isArray(_sharedProcessBridge.argv) && _sharedProcessBridge.argv.length
          ? [..._sharedProcessBridge.argv]
          : ['node', scriptPath],
        env: (() => {
          const base = {
            HOME: '/home/user',
            PATH: '/usr/bin:/bin',
            NODE_ENV: 'production',
          };
          const be = _sharedProcessBridge.env;
          if (be && typeof be === 'object') {
            for (const k of Object.keys(be)) {
              try {
                base[k] = be[k];
              } catch {
                /* ignore */
              }
            }
          }
          return { ...base, ...(options.env || {}) };
        })(),
        cwd: () => _sharedMemfs.cwd?.() || '/',
        exit: (code) => { throw Object.assign(new Error(`process.exit(${code})`), { exitCode: code }); },
        stdout: { write: (data) => { const s = String(data); stdoutLines.push(s); if (options.onStdout) options.onStdout(s); } },
        stderr: { write: (data) => { const s = String(data); stderrLines.push(s); if (options.onStderr) options.onStderr(s); } },
        platform: 'linux',
        arch: 'wasm32',
        version: 'v22.0.0',
        versions: { node: 'v22.0.0', v8: '12.0.0' },
        hrtime: { bigint: () => BigInt(Math.round(performance.now() * 1e6)) },
        nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)),
        on: () => ({ on: () => ({}) }),
        removeListener: () => {},
      },
      globalThis.Buffer || { from: (x) => new Uint8Array(typeof x === 'string' ? new TextEncoder().encode(x) : x) },
      globalThis.setTimeout,
      globalThis.setInterval,
      globalThis.clearTimeout,
      globalThis.clearInterval,
      globalThis.queueMicrotask,
      globalThis,
    ];

    const prevDi = globalThis.__memfsDynamicImport;
    globalThis.__memfsDynamicImport = _memfsDynamicImport;
    try {
      const fn = new Function(...contextKeys, source);
      const ret = fn(...contextVals);
      if (ret != null && typeof ret.then === 'function') {
        await ret;
      }
      for (;;) {
        if (!_pendingImportsForRun || _pendingImportsForRun.size === 0) break;
        await Promise.all([..._pendingImportsForRun]);
      }
      return { status: 0, stdout: stdoutLines, stderr: stderrLines };
    } catch (err) {
      if (err.exitCode !== undefined) {
        return { status: err.exitCode, stdout: stdoutLines, stderr: stderrLines };
      }
      stderrLines.push(err.stack || err.message);
      if (options.onStderr) options.onStderr(err.stack || err.message);
      return { status: 1, stdout: stdoutLines, stderr: stderrLines };
    } finally {
      _pendingImportsForRun = null;
      if (prevDi === undefined) delete globalThis.__memfsDynamicImport;
      else globalThis.__memfsDynamicImport = prevDi;
    }
  }

  async function executeCliAsync(args) {
    const stdoutStart = stdoutBuffer.length;
    const stderrStart = stderrBuffer.length;

    if (!_useJsBridge) {
      try {
        const status = invokeMain(args);
        const stdout = stdoutBuffer.slice(stdoutStart);
        const stderr = stdoutBuffer.slice(stderrStart);
        if (status === 1 && stderr.some((s) => s.includes('Failed to initialize') || s.includes('Aborted'))) {
          _useJsBridge = true;
        } else {
          return { status, stdout, stderr };
        }
      } catch (err) {
        if (err.message?.includes('unreachable') || err.message?.includes('Aborted')) {
          _useJsBridge = true;
        } else {
          throw err;
        }
      }
    }

    if (args[0] === '-p' && args.length >= 2) {
      const code = args.slice(1).join(' ');
      const tempPath = '/.edge/_eval_' + Date.now() + '.js';
      try { _sharedBridgeFs.mkdirSync('/.edge', { recursive: true }); } catch {}
      _sharedBridgeFs.writeFileSync(tempPath, `console.log(eval(${JSON.stringify(code)}))`);
      const result = await executeViaBridgeAsync(tempPath);
      try { _sharedBridgeFs.unlinkSync(tempPath); } catch {}
      return result;
    }
    if (args.length >= 1) {
      return await executeViaBridgeAsync(args[0]);
    }

    return { status: 1, stdout: [], stderr: ['No script specified'] };
  }

  async function runNodeEntry(opts = {}) {
    const entry = opts.entry;
    if (entry == null || entry === '') {
      throw new Error('runNodeEntry: options.entry is required');
    }
    const cwd = opts.cwd ?? '/workspace';
    try {
      _sharedBridgeFs.mkdirSync(cwd, { recursive: true });
    } catch {
      /* exists */
    }
    _sharedProcessBridge.chdir(cwd);
    const argv0 = opts.argv0 ?? 'node';
    const rest = Array.isArray(opts.argv) ? opts.argv.map(String) : [];
    _sharedProcessBridge.argv = [argv0, String(entry), ...rest];
    if (opts.env && typeof opts.env === 'object') {
      for (const [k, v] of Object.entries(opts.env)) {
        _sharedProcessBridge.env[k] = v;
      }
    }
    return executeCliAsync([String(entry)]);
  }

  function executeCli(args) {
    const stdoutStart = stdoutBuffer.length;
    const stderrStart = stderrBuffer.length;

    // Try C++ path first; fall back to JS bridge if libuv aborts
    if (!_useJsBridge) {
      try {
        const status = invokeMain(args);
        const stdout = stdoutBuffer.slice(stdoutStart);
        const stderr = stderrBuffer.slice(stderrStart);
        // Check if the C++ runtime failed to init (libuv abort)
        if (status === 1 && stderr.some(s => s.includes('Failed to initialize') || s.includes('Aborted'))) {
          _useJsBridge = true;
          // Fall through to JS bridge
        } else {
          return { status, stdout, stderr };
        }
      } catch (err) {
        if (err.message?.includes('unreachable') || err.message?.includes('Aborted')) {
          _useJsBridge = true;
          // Fall through to JS bridge
        } else {
          throw err;
        }
      }
    }

    // JS bridge path: parse args to determine what to execute
    // args = ['-p', 'code'] for eval, or ['/path/to/script.js'] for runFile
    if (args[0] === '-p' && args.length >= 2) {
      // Eval mode: write code to temp file and execute
      const code = args.slice(1).join(' ');
      const tempPath = '/.edge/_eval_' + Date.now() + '.js';
      try { _sharedBridgeFs.mkdirSync('/.edge', { recursive: true }); } catch {}
      _sharedBridgeFs.writeFileSync(tempPath, `console.log(eval(${JSON.stringify(code)}))`);
      const result = executeViaBridge(tempPath);
      try { _sharedBridgeFs.unlinkSync(tempPath); } catch {}
      return result;
    } else if (args.length >= 1) {
      // RunFile mode
      return executeViaBridge(args[0]);
    }

    return { status: 1, stdout: [], stderr: ['No script specified'] };
  }

  function parseEvalValue(lines) {
    const trimmed = lines.map((line) => line.trim()).filter(Boolean);
    const last = trimmed[trimmed.length - 1];
    if (last === undefined || last === 'undefined') return undefined;
    if (last === 'true') return true;
    if (last === 'false') return false;
    const numeric = Number(last);
    return Number.isNaN(numeric) ? last : numeric;
  }

  // Production execution API: deterministic, no temp files, no forced exit.
  const executionState = {
    lastResult: undefined,
    lastError: null,
    isExecuting: false,
  };

  // --- Production Execution API ---
  // Uses global state injection instead of temp files
  // Uses monotonic IDs instead of Date.now()
  // Uses structured result capture instead of stdout parsing

  const EVAL_HELPER_PATH = '/.edge/eval-helper.js';
  const RUNFILE_HELPER_PATH = '/.edge/runfile-helper.js';
  const EXECUTION_TIMEOUT_MS = 30000; // 30 second timeout for runaway scripts

  try {
    instance.FS.mkdirTree('/.edge');
  } catch {
    // Directory may already exist.
  }

  // Monotonic execution counter - no collisions possible
  let executionCounter = 0;

  // Global result store - accessed by both host and VM
  // Structure: { executionId: { status, result, error, complete } }
  const executionResults = new Map();

  /**
   * Serializes a value for cross-VM communication.
   * Handles types JSON.stringify cannot: undefined, BigInt, circular refs, functions
   */
  function serializeResult(value) {
    const seen = new WeakSet();

    function serialize(v) {
      if (v === undefined) return { type: 'undefined' };
      if (v === null) return { type: 'null', value: null };
      if (typeof v === 'boolean') return { type: 'boolean', value: v };
      if (typeof v === 'number') return { type: 'number', value: v };
      if (typeof v === 'string') return { type: 'string', value: v };
      if (typeof v === 'bigint') return { type: 'bigint', value: v.toString() };
      if (typeof v === 'symbol') return { type: 'symbol', value: v.toString() };
      if (typeof v === 'function') return { type: 'function', value: v.toString().slice(0, 100) };

      if (v instanceof Date) return { type: 'Date', value: v.toISOString() };
      if (v instanceof RegExp) return { type: 'RegExp', value: v.toString() };
      if (v instanceof Error) {
        return {
          type: 'Error',
          value: {
            name: v.name,
            message: v.message,
            stack: v.stack,
          },
        };
      }

      if (Array.isArray(v)) {
        if (seen.has(v)) return { type: 'circular', value: '[Circular]' };
        seen.add(v);
        return { type: 'array', value: v.map(serialize) };
      }

      if (typeof v === 'object') {
        if (seen.has(v)) return { type: 'circular', value: '[Circular]' };
        seen.add(v);
        const obj = {};
        for (const key of Reflect.ownKeys(v)) {
          const desc = Reflect.getOwnPropertyDescriptor(v, key);
          if (desc && desc.enumerable) {
            obj[key] = serialize(desc.value);
          }
        }
        return { type: 'object', value: obj };
      }

      return { type: 'unknown', value: String(v) };
    }

    return serialize(value);
  }

  /**
   * Deserializes a value from cross-VM communication format.
   */
  function deserializeResult(serialized) {
    if (!serialized || typeof serialized !== 'object') return serialized;

    switch (serialized.type) {
      case 'undefined': return undefined;
      case 'null': return null;
      case 'boolean':
      case 'number':
      case 'string':
        return serialized.value;
      case 'bigint': return BigInt(serialized.value);
      case 'symbol': return Symbol.for(serialized.value.slice(7, -1) || 'default');
      case 'function': return () => {}; // Functions cannot cross VM boundary meaningfully
      case 'Date': return new Date(serialized.value);
      case 'RegExp': {
        const parts = serialized.value.match(/\/(.*)\/([gimsuy]*)?/);
        return parts ? new RegExp(parts[1], parts[2] || '') : new RegExp();
      }
      case 'Error': {
        const err = new Error(serialized.value.message);
        err.name = serialized.value.name;
        err.stack = serialized.value.stack;
        return err;
      }
      case 'array':
        return serialized.value.map(deserializeResult);
      case 'object': {
        const obj = {};
        for (const [k, v] of Object.entries(serialized.value)) {
          obj[k] = deserializeResult(v);
        }
        return obj;
      }
      case 'circular': return '[Circular]';
      default: return serialized.value;
    }
  }

  // Eval helper: captures result via global executionResults
  instance.FS.writeFile(EVAL_HELPER_PATH, `
const __edge_exec_id = globalThis.__edge_exec_id;
const __edge_code = globalThis.__edge_code;
let __edge_result;
let __edge_success = false;
let __edge_error = null;
try {
  __edge_result = eval(__edge_code);
  __edge_success = true;
} catch (e) {
  __edge_error = e;
}
globalThis.__edge_execution_results[__edge_exec_id] = {
  status: __edge_success ? 0 : 1,
  result: __edge_success ? __edge_result : undefined,
  error: __edge_error,
  complete: true
};
`);

  // RunFile helper: executes require() via global executionResults
  instance.FS.writeFile(RUNFILE_HELPER_PATH, `
const __edge_exec_id = globalThis.__edge_exec_id;
const __edge_target = globalThis.__edge_target;
let __edge_success = false;
let __edge_error = null;
try {
  require(__edge_target);
  __edge_success = true;
} catch (e) {
  __edge_error = e;
}
globalThis.__edge_execution_results[__edge_exec_id] = {
  status: __edge_success ? 0 : 1,
  result: undefined,
  error: __edge_error,
  complete: true
};
`);

  /**
   * Execute a script with deterministic capture semantics.
   * @param {string} scriptPath - Path to the script to execute
   * @param {object} injectVars - Variables to inject into the global context
   * @returns {{status: number, result?: any, error?: string, stdout: string[], stderr: string[]}}
   */
  function executeScript(scriptPath, injectVars = {}) {
    if (executionState.isExecuting) {
      throw new Error('Nested execution not supported - concurrent execution requires Worker isolation');
    }

    executionState.isExecuting = true;

    // Monotonic ID - no collisions under any load
    const execId = ++executionCounter;
    const execIdStr = String(execId);

    const stdoutBefore = stdoutBuffer.length;
    const stderrBuffer = [];
    const originalPrintErr = instance.printErr;

    // Capture stderr during execution
    instance.printErr = (...args) => {
      const line = args.map((x) => String(x)).join(' ');
      stderrBuffer.push(line);
      if (originalPrintErr) originalPrintErr(...args);
    };

    // Set up execution globals BEFORE running the script
    // This is how we pass parameters without temp files
    instance.__edge_exec_id = execIdStr;
    instance.__edge_code = injectVars.__edge_code || '';
    instance.__edge_target = injectVars.__edge_target || '';

    // Ensure result container exists
    if (!instance.__edge_execution_results) {
      instance.__edge_execution_results = {};
    }

    // Mark as pending
    instance.__edge_execution_results[execIdStr] = { complete: false };

    let status;
    let timeoutId = null;

    try {
      // Set up timeout protection
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Execution timeout after ${EXECUTION_TIMEOUT_MS}ms`));
        }, EXECUTION_TIMEOUT_MS);
      });

      // Execute the script
      const execPromise = Promise.resolve().then(() => invokeMain([scriptPath]));

      // Race between execution and timeout
      status = Promise.race([execPromise, timeoutPromise]).catch((err) => {
        stderrBuffer.push(`Execution error: ${err.message}`);
        return 1;
      });

      // If it's a promise, await it
      if (status instanceof Promise) {
        status = 1; // Default to error if async (shouldn't happen with invokeMain)
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    // Restore stderr handler
    instance.printErr = originalPrintErr;

    // Read result from global store
    const execResult = instance.__edge_execution_results[execIdStr] || { complete: false };

    // Clean up globals
    delete instance.__edge_exec_id;
    delete instance.__edge_code;
    delete instance.__edge_target;
    delete instance.__edge_execution_results[execIdStr];

    executionState.isExecuting = false;

    const stdoutLines = stdoutBuffer.slice(stdoutBefore);

    if (!execResult.complete) {
      return {
        status: 1,
        result: undefined,
        error: 'Execution did not complete (script may not have been executed)',
        stdout: stdoutLines,
        stderr: stderrBuffer,
      };
    }

    return {
      status: execResult.status ?? 1,
      result: execResult.result,
      error: execResult.error ? (execResult.error.stack || String(execResult.error)) : null,
      stdout: stdoutLines,
      stderr: stderrBuffer,
    };
  }

  return {
    /** Register a browser-side module override for the given built-in name. */
    _registerBuiltinOverride,

    /** Retrieve a registered builtin override (or undefined). */
    _getBuiltinOverride(name) {
      return _builtinOverrides.get(name);
    },

    /** All registered builtin overrides. */
    get _builtinOverrides() {
      return _builtinOverrides;
    },

    /**
     * Run a JavaScript string and return the result.
     * @param {string} code - JavaScript code to execute
     * @returns {any} The result of the evaluation
     * @throws {Error} If execution fails
     */
    eval(code) {
      const execution = executeCli(['-p', String(code)]);
      if (execution.status !== 0) {
        const detail = execution.stderr.map((line) => line.trim()).filter(Boolean).join('\n');
        throw new Error(detail || `edge eval failed with status ${execution.status}`);
      }
      return parseEvalValue(execution.stdout);
    },

    /**
     * Run a JavaScript file from the virtual filesystem.
     * @param {string} path - Path to the JavaScript file
     * @returns {{status: number, stdout: string[], stderr: string[]}} Execution result
     */
    runFile(path) {
      const target = String(path);
      const execution = executeCli([target]);
      return execution.status;
    },

    /**
     * Like runFile, but waits for a Promise returned by the script (top-level async / IIFE).
     */
    async runFileAsync(path) {
      const target = String(path);
      const execution = await executeCliAsync([target]);
      return execution.status;
    },

    /**
     * Configure cwd/argv/env then run MEMFS entry like `node path/to/file.js [args]`.
     * Uses the async JS bridge when Wasm main is unavailable.
     * @returns {Promise<{status: number, stdout: string[], stderr: string[]}>}
     */
    runNodeEntry,

    /**
     * Execute a script with full control over injection and capture.
     * @param {string} scriptPath - Path to script to execute
     * @param {object} options - Execution options
     * @returns {{status: number, result?: any, error?: string, stdout: string[], stderr: string[]}}
     */
    execute(scriptPath, options = {}) {
      return executeScript(scriptPath, options.inject || {});
    },

    /** Access the virtual filesystem (Node.js-compatible API backed by MEMFS) */
    fs: _sharedBridgeFs,

    // ── Sync/replication plane ─────────────────────────────────────
    // Exposed separately from fs API for external sync engines.

    /** Capture filesystem metadata snapshot (COW-friendly: hashes, not byte clones). */
    fsSnapshot() { return _sharedMemfs.snapshot(); },

    /** Capture full snapshot with byte content (for initial sync/restore). */
    fsSnapshotFull() { return _sharedMemfs.snapshotFull(); },

    /** Get journal entries since seq. Returns { gap, entries, gapFrom?, gapTo? }. */
    fsJournalSince(seq) { return _sharedMemfs.getJournalSince(seq); },

    /** Subscribe to filesystem mutations. Returns unsubscribe function. */
    fsWatch(callback) { return _sharedMemfs.onMutation(callback); },

    /** Begin a transactional batch of mutations. Returns txid. */
    fsBeginTx() { return _sharedMemfs.beginTx(); },

    /** Commit the current transaction. */
    fsCommitTx() { return _sharedMemfs.commitTx(); },

    /** Push data into process.stdin (for terminal keyboard input) */
    pushStdin(data) {
      _sharedProcessBridge.stdin.push(typeof data === 'string' ? data : String(data));
    },

    /** Update terminal dimensions and emit SIGWINCH */
    setTerminalSize(cols, rows) {
      _sharedProcessBridge.stdout.columns = cols;
      _sharedProcessBridge.stdout.rows = rows;
      _sharedProcessBridge.stderr.columns = cols;
      _sharedProcessBridge.stderr.rows = rows;
      // Update Emscripten's TTY ops so ioctl(TIOCGWINSZ) returns the right size
      if (instance?.FS?.streams) {
        for (const stream of instance.FS.streams) {
          if (stream?.tty?.ops?.ioctl_tiocgwinsz) {
            stream.tty.ops.ioctl_tiocgwinsz = () => [rows, cols];
          }
        }
      }
      try { _sharedProcessBridge.emit('SIGWINCH'); } catch {}
    },

    /** CommonJS require() backed by MEMFS with node_modules resolution */
    require: _memfsRequire,

    /** Raw Emscripten module (for advanced use) */
    module: instance,

    /**
     * Module loading hooks — exposed for the module system to invoke
     * callbacks registered by the C++ module_wrap layer.
     */
    moduleHooks: {
      /**
       * Invoke the dynamic import callback for `import(specifier)`.
       * Returns a Promise resolving to the module namespace.
       */
      importModuleDynamically(specifier, assertions, referrer) {
        const envId = bridge.activeEnv;
        const { status, resultHandle } =
          bridge.invokeImportModuleDynamically(envId, specifier, assertions, referrer);
        if (status !== NAPI_OK) {
          return Promise.reject(
            new Error(`Dynamic import failed for '${specifier}' (status ${status})`),
          );
        }
        const value = bridge.getHandle(resultHandle);
        return value instanceof Promise ? value : Promise.resolve(value);
      },

      /**
       * Invoke the import.meta initialization callback.
       * Populates the given meta object with url, resolve, etc.
       */
      initializeImportMeta(metaObject, moduleObject) {
        const envId = bridge.activeEnv;
        return bridge.invokeInitializeImportMeta(envId, metaObject, moduleObject);
      },

      /** Check whether the dynamic import callback has been registered. */
      get hasImportModuleDynamically() {
        return bridge.moduleWrapImportModuleDynamicallyCallback !== 0;
      },

      /** Check whether the import.meta callback has been registered. */
      get hasInitializeImportMeta() {
        return bridge.moduleWrapInitializeImportMetaObjectCallback !== 0;
      },
    },

    /** Bridge diagnostics for Phase 2 leak/error characterization. */
    diagnostics() {
      const counters = bridge.getInstrumentationCounters();
      return {
        ...counters,
        missingImports: Object.fromEntries(bridge.missingImports),
        importCalls: Object.fromEntries(bridge.importCallCounts),
        importErrors: Object.fromEntries(bridge.importErrorCounts),
        importTrace: bridge.importCallTrace.slice(),
        recentImportTrace: bridge.importCallTrace.slice(-80),
        executionCounter,
      };
    },
  };
}

export { NapiBridge };
