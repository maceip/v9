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
const StableTextEncoder = typeof globalThis.TextEncoder === 'function' ? globalThis.TextEncoder : null;
const StableTextDecoder = typeof globalThis.TextDecoder === 'function' ? globalThis.TextDecoder : null;

function encodeUtf8(value) {
  const str = String(value);
  if (StableTextEncoder) {
    try {
      return new StableTextEncoder().encode(str);
    } catch {
      // Fall through to legacy fallback.
    }
  }
  const escaped = unescape(encodeURIComponent(str));
  const out = new Uint8Array(escaped.length);
  for (let i = 0; i < escaped.length; i++) out[i] = escaped.charCodeAt(i);
  return out;
}

function decodeUtf8(bytes) {
  if (StableTextDecoder) {
    try {
      return new StableTextDecoder().decode(bytes);
    } catch {
      // Fall through to legacy fallback.
    }
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return decodeURIComponent(escape(binary));
}

function utf8ByteLength(value) {
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

    // Handle table: maps integer handles ↔ JS values
    // Handle 0 is reserved as "null pointer / invalid handle"
    // so all real napi_value handles are non-zero.
    // Handle 1 = undefined, 2 = null, 3 = global
    this.handles = [null, undefined, null, globalThis];
    this.handleFreeList = [];

    // Reference counting for prevent GC
    this.refs = new Map(); // handle → refcount
    this.wrappedNativePointers = new Map(); // handle -> native pointer (fallback)
    this.wrappedNativePointersByObject = new WeakMap(); // object -> native pointer
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

  getInstrumentationCounters() {
    return {
      activeHandles: this.getActiveHandleCount(),
      handleScopeDepth: this.handleScopes.length,
      freeHandleSlots: this.handleFreeList.length,
      activeRefs: this.refs.size,
      totalRefCount: sumMapValues(this.refs),
      callbackInfoCount: this.callbackInfos.size,
      wrappedPointerCount: this.wrappedNativePointers.size,
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
    const buffer = this.getMemoryBuffer();
    if (!buffer || !ptr) return;
    if (!this.isMemoryRangeValid(ptr, 4)) return;
    new DataView(buffer).setInt32(ptr, value, true);
  }

  /** Write a 64-bit float to Wasm memory */
  writeF64(ptr, value) {
    const buffer = this.getMemoryBuffer();
    if (!buffer || !ptr) return;
    if (!this.isMemoryRangeValid(ptr, 8)) return;
    new DataView(buffer).setFloat64(ptr, value, true);
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

      napi_coerce_to_string(env, valueHandle, resultPtr) {
        void env;
        const value = bridge.getHandle(valueHandle);
        bridge.writeI32(resultPtr, bridge.createHandle(String(value)));
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
          let success = Reflect.set(obj, name, value, obj);
          if (!success) {
            const desc = Object.getOwnPropertyDescriptor(obj, name);
            if (desc && desc.configurable) {
              Object.defineProperty(obj, name, {
                value,
                configurable: true,
                enumerable: true,
                writable: true,
              });
              success = true;
            }
          }
          if (!success) {
            // Some bootstrap paths probe read-only accessors; treat as a no-op.
            bridge.importCallTrace.push(
              `napi_set_named_property:noop:${name}:${objHandle}:${objType}`,
            );
            if (bridge.importCallTrace.length > 5000) bridge.importCallTrace.shift();
            bridge.setLastError(NAPI_OK, '');
            return NAPI_OK;
          }
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (error) {
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
          bridge.writeI32(resultPtr, bridge.createHandle(obj[name]));
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (error) {
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

      napi_is_date(env, valueHandle, resultPtr) {
        void env;
        bridge.writeI32(resultPtr, bridge.getHandle(valueHandle) instanceof Date ? 1 : 0);
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
        const obj = bridge.getHandle(objHandle);
        if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
          bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
          return NAPI_OBJECT_EXPECTED;
        }
        const key = bridge.getHandle(keyHandle);
        bridge.writeI32(resultPtr, bridge.createHandle(obj[key]));
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_get_element(env, objHandle, index, resultPtr) {
        void env;
        const obj = bridge.getHandle(objHandle);
        if (obj == null) {
          bridge.writeI32(resultPtr, 1); // undefined
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        }
        bridge.writeI32(resultPtr, bridge.createHandle(obj[index >>> 0]));
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      napi_set_property(env, objHandle, keyHandle, valueHandle) {
        void env;
        const obj = bridge.getHandle(objHandle);
        if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
          bridge.setLastError(NAPI_OBJECT_EXPECTED, 'Object expected');
          return NAPI_OBJECT_EXPECTED;
        }
        const key = bridge.getHandle(keyHandle);
        Reflect.set(obj, key, bridge.getHandle(valueHandle), obj);
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
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
          Reflect.set(obj, index >>> 0, bridge.getHandle(valueHandle), obj);
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
        void env; void finalizeCb; void finalizeHint;
        const ptr = nativePtr >>> 0;
        const value = bridge.getHandle(objectHandle);
        bridge.wrappedNativePointers.set(objectHandle, ptr);
        if (value && (typeof value === 'object' || typeof value === 'function')) {
          const hadObjectWrap = bridge.wrappedNativePointersByObject.has(value);
          bridge.wrappedNativePointersByObject.set(value, ptr);
          if (!hadObjectWrap) {
            bridge.wrappedNativePointersByObjectCount++;
          }
        }
        if (resultPtr) {
          // Mirror create_reference behavior: return a ref token keyed by object handle.
          bridge.refs.set(objectHandle, bridge.refs.get(objectHandle) ?? 0);
          bridge.writeI32(resultPtr, objectHandle);
        }
        return NAPI_OK;
      },

      napi_unwrap(env, objectHandle, resultPtr) {
        void env;
        const value = bridge.getHandle(objectHandle);
        let nativePtr = 0;
        if (value && (typeof value === 'object' || typeof value === 'function')) {
          nativePtr = bridge.wrappedNativePointersByObject.get(value) || 0;
        }
        if (!nativePtr) {
          nativePtr = bridge.wrappedNativePointers.get(objectHandle) || 0;
        }
        bridge.writePointer(resultPtr, nativePtr);
        return NAPI_OK;
      },

      napi_remove_wrap(env, objectHandle, resultPtr) {
        void env;
        const value = bridge.getHandle(objectHandle);
        let nativePtr = 0;
        if (value && (typeof value === 'object' || typeof value === 'function')) {
          nativePtr = bridge.wrappedNativePointersByObject.get(value) || 0;
          const had = bridge.wrappedNativePointersByObject.delete(value);
          if (had) {
            bridge.wrappedNativePointersByObjectCount = Math.max(
              0,
              bridge.wrappedNativePointersByObjectCount - 1,
            );
          }
        }
        if (!nativePtr) {
          nativePtr = bridge.wrappedNativePointers.get(objectHandle) || 0;
        }
        bridge.wrappedNativePointers.delete(objectHandle);
        if (resultPtr) bridge.writePointer(resultPtr, nativePtr);
        return NAPI_OK;
      },

      // --- Function Calls ---
      napi_call_function(env, thisHandle, fnHandle, argc, argvPtr, resultPtr) {
        const thisVal = bridge.getHandle(thisHandle);
        const fn = bridge.getHandle(fnHandle);
        if (typeof fn !== 'function') {
          if (resultPtr) bridge.writeI32(resultPtr, 1); // undefined
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        }
        const buffer = bridge.getMemoryBuffer();
        if (!buffer) {
          bridge.setLastError(NAPI_GENERIC_FAILURE, 'Wasm memory not initialized');
          return NAPI_GENERIC_FAILURE;
        }
        const view = new DataView(buffer);
        const args = [];
        for (let i = 0; i < argc; i++) {
          const argHandle = view.getInt32(argvPtr + i * 4, true);
          args.push(bridge.getHandle(argHandle));
        }
        if (typeof fn === 'function' && fn.name === 'lstat') {
          if ((args[0] == null) && bridge.lastMainArgPath) {
            args[0] = bridge.lastMainArgPath;
          }
        }
        try {
          const result = fn.apply(thisVal, args);
          if (resultPtr) {
            bridge.writeI32(resultPtr, bridge.createHandle(result));
          }
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (e) {
          const message = String(e?.message || e);
          if (
            message.includes('getter called on non-') ||
            message.includes('called on incompatible receiver')
          ) {
            if (resultPtr) bridge.writeI32(resultPtr, 1); // undefined
            bridge.setLastError(NAPI_OK, '');
            return NAPI_OK;
          }
          const fnName = typeof fn === 'function' ? (fn.name || 'anonymous') : String(fn);
          const thisType = thisVal === null ? 'null' : typeof thisVal;
          const thisCtor =
            thisVal && (typeof thisVal === 'object' || typeof thisVal === 'function')
              ? (thisVal.constructor?.name || 'Object')
              : '';
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
        bridge.refs.set(handle, initialRefcount);
        bridge.writeI32(resultPtr, handle);
        return NAPI_OK;
      },

      napi_reference_ref(env, ref, resultPtr) {
        const current = bridge.refs.get(ref) || 0;
        const next = current + 1;
        bridge.refs.set(ref, next);
        if (resultPtr) bridge.writeI32(resultPtr, next);
        return NAPI_OK;
      },

      napi_reference_unref(env, ref, resultPtr) {
        const current = bridge.refs.get(ref) || 0;
        const next = current > 0 ? current - 1 : 0;
        if (next === 0) {
          bridge.refs.delete(ref);
        } else {
          bridge.refs.set(ref, next);
        }
        if (resultPtr) bridge.writeI32(resultPtr, next);
        return NAPI_OK;
      },

      napi_get_reference_value(env, ref, resultPtr) {
        if (bridge.refs.has(ref)) {
          bridge.writeI32(resultPtr, ref);
          return NAPI_OK;
        }
        // Match N-API behavior where an empty weak reference yields nullptr.
        bridge.writeI32(resultPtr, 0);
        return NAPI_OK;
      },

      napi_delete_reference(env, ref) {
        bridge.refs.delete(ref);
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
        return NAPI_OK;
      },

      unofficial_napi_get_promise_details(env, promiseHandle, stateOutPtr, resultOutPtr, hasResultOutPtr) {
        void env;
        const value = bridge.getHandle(promiseHandle);
        const isPromise = value instanceof Promise;
        // 0 = pending, 1 = fulfilled, 2 = rejected (mirrors V8 Promise::PromiseState)
        if (stateOutPtr) bridge.writeI32(stateOutPtr, 0);
        if (resultOutPtr) bridge.writeI32(resultOutPtr, 1); // undefined
        if (hasResultOutPtr) bridge.writeI32(hasResultOutPtr, 0);
        if (!isPromise) {
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        }
        bridge.setLastError(NAPI_OK, '');
        return NAPI_OK;
      },

      unofficial_napi_create_env(moduleApiVersion, envOutPtr, scopeOutPtr) {
        const envId = bridge.nextEnvId++;
        const scopeId = bridge.nextEnvScopeId++;
        bridge.envByScope.set(scopeId, envId);
        if (envOutPtr) bridge.writePointer(envOutPtr, envId);
        if (scopeOutPtr) bridge.writePointer(scopeOutPtr, scopeId);
        return NAPI_OK;
      },

      unofficial_napi_create_env_with_options(moduleApiVersion, optionsPtr, envOutPtr, scopeOutPtr) {
        void optionsPtr;
        const envId = bridge.nextEnvId++;
        const scopeId = bridge.nextEnvScopeId++;
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
        void env;
        void filenameHandle;
        void lineOffset;
        void columnOffset;
        void cachedDataHandle;
        void produceCachedData;
        void parsingContextHandle;
        void contextExtensionsHandle;
        void hostDefinedOptionHandle;

        try {
          const source = String(bridge.getHandle(codeHandle) ?? '');
          const filename = String(bridge.getHandle(filenameHandle) ?? '');
          const paramsValue = bridge.getHandle(paramsHandle);
          const params = Array.isArray(paramsValue) ? paramsValue.map((x) => String(x)) : [];
          const compiled = new Function(...params, source);
          const result = {
            function: compiled,
            sourceURL: filename,
            sourceMapURL: undefined,
            cachedDataProduced: false,
            cachedDataRejected: false,
          };
          bridge.writeI32(resultOutPtr, bridge.createHandle(result));
          bridge.setLastError(NAPI_OK, '');
          return NAPI_OK;
        } catch (error) {
          bridge.setPendingException(error);
          return NAPI_PENDING_EXCEPTION;
        }
      },

      unofficial_napi_contextify_compile_function_for_cjs_loader(
        env,
        codeHandle,
        filenameHandle,
        isSeaMain,
        shouldDetectModule,
        resultOutPtr,
      ) {
        void env; void isSeaMain; void shouldDetectModule;
        try {
          const source = String(bridge.getHandle(codeHandle) ?? '');
          const filename = String(bridge.getHandle(filenameHandle) ?? '');
          const compiled = new Function(
            'exports',
            'require',
            'module',
            '__filename',
            '__dirname',
            source,
          );
          const result = {
            function: compiled,
            sourceURL: filename,
            sourceMapURL: undefined,
            cachedDataRejected: false,
            canParseAsESM: false,
          };
          bridge.writeI32(resultOutPtr, bridge.createHandle(result));
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
        return (...args) => {
          bridge.recordMissingImport(prop);
          bridge.importCallCounts.set(prop, (bridge.importCallCounts.get(prop) || 0) + 1);
          bridge.importCallTrace.push(prop);
          if (bridge.importCallTrace.length > 5000) {
            bridge.importCallTrace.shift();
          }
          if (bridge.strictUnknownImports) {
            throw new Error(`[napi] Missing import implementation: ${prop}`);
          }
          void args;
          return NAPI_OK;
        };
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
 * @returns {Promise<object>} EdgeJS runtime instance
 */
export async function initEdgeJS(options = {}) {
  const strictUnknownImportsOption =
    options.strictUnknownImports ??
    (typeof process !== 'undefined' && process.env?.EDGEJS_STRICT_IMPORTS === '1');
  const bridge = new NapiBridge(null, {
    logNapiErrors: options.logNapiErrors,
    strictUnknownImports: strictUnknownImportsOption,
  });

  const isNode = typeof process !== 'undefined' && !!process.versions?.node;

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
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const modulePath = options.modulePath || '../build/edge';
    const loaded = require(modulePath);
    if (typeof loaded === 'function') {
      EdgeJSModule = loaded;
    }
  }
  if (typeof EdgeJSModule !== 'function') {
    throw new TypeError('Could not load EdgeJS module factory');
  }

  const napiImports = bridge.getImportModule();
  const stdoutBuffer = [];
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

  const instance = await EdgeJSModule({
    // Inject N-API bridge imports.
    napi: napiImports,
    napiImports,
    noInitialRun: true,
    noExitRuntime: true,

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
      const envProxy = new Proxy(info.env || {}, {
        get(target, prop) {
          if (prop === 'uv_setup_args') {
            return (argc, argv) => argv;
          }
          if (prop === 'uv__hrtime') {
            return () => 0;
          }

          const value = target[prop];
          if (typeof value === 'function' && value.stub) {
            return () => 0;
          }
          if (value === undefined) {
            if (bridge.strictUnknownImports) {
              throw new Error(`[env] Missing import implementation: ${String(prop)}`);
            }
            return () => 0;
          }
          return value;
        },
      });

      const imports = { ...info, env: envProxy, napi: napiImports };
      const onInstantiated = (result) => {
        receiveInstance(result.instance, result.module);
        return result.instance.exports;
      };

      if (wasmBinary) {
        return WebAssembly.instantiate(wasmBinary, imports).then(onInstantiated);
      }

      const wasmUrl = options.wasmUrl || './edgejs.wasm';
      return fetch(wasmUrl)
        .then((res) => res.arrayBuffer())
        .then((buf) => WebAssembly.instantiate(buf, imports))
        .then(onInstantiated);
    },

    // Emscripten callbacks
    onRuntimeInitialized() {
      bridge.wasm = this;
      bridge.memory = this.HEAP8;
      console.log('[edgejs] Runtime initialized');
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
    printErr: options.onStderr || console.error,
  });

  bridge.wasm = instance;
  bridge.memory = instance.HEAP8;

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
      for (let i = 0; i < argvPointers.length; i++) {
        instance.HEAPU32[(argvPtr >> 2) + i] = argvPointers[i];
      }
      instance.HEAPU32[(argvPtr >> 2) + argvPointers.length] = 0;

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

  return {
    /** Run a JavaScript string */
    eval(code) {
      const before = stdoutBuffer.length;
      const evalScript = [
        'let __edge_eval_result;',
        `try { __edge_eval_result = eval(${JSON.stringify(String(code))}); }`,
        'catch (__edge_eval_error) {',
        "  console.error(__edge_eval_error && __edge_eval_error.stack ? __edge_eval_error.stack : String(__edge_eval_error));",
        '  process.exit(1);',
        '}',
        "if (typeof __edge_eval_result !== 'undefined') console.log(__edge_eval_result);",
        'process.exit(0);',
      ].join('\n');
      const evalPath = `/__edge_eval_${Date.now()}_${Math.floor(Math.random() * 1e9)}.js`;
      instance.FS.writeFile(evalPath, evalScript);
      const status = invokeMain([evalPath]);
      try {
        instance.FS.unlink(evalPath);
      } catch {
        // Best-effort cleanup.
      }
      if (status !== 0) {
        throw new Error(`edge eval failed with status ${status}`);
      }
      const lines = stdoutBuffer.slice(before).map((line) => line.trim()).filter(Boolean);
      const last = lines[lines.length - 1] ?? '';
      const numeric = Number(last);
      return Number.isNaN(numeric) ? last : numeric;
    },

    /** Run a JavaScript file from the virtual filesystem */
    runFile(path) {
      const target = String(path);
      const runnerScript = [
        `const __edge_target = ${JSON.stringify(target)};`,
        'try {',
        '  require(__edge_target);',
        '  process.exit(0);',
        '} catch (__edge_run_error) {',
        "  console.error(__edge_run_error && __edge_run_error.stack ? __edge_run_error.stack : String(__edge_run_error));",
        '  process.exit(1);',
        '}',
      ].join('\n');
      const runnerPath = `/__edge_run_${Date.now()}_${Math.floor(Math.random() * 1e9)}.js`;
      instance.FS.writeFile(runnerPath, runnerScript);
      const status = invokeMain([runnerPath]);
      try {
        instance.FS.unlink(runnerPath);
      } catch {
        // Best-effort cleanup.
      }
      return status;
    },

    /** Access the virtual filesystem */
    fs: instance.FS,

    /** Raw Emscripten module (for advanced use) */
    module: instance,

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
      };
    },
  };
}

export { NapiBridge };
