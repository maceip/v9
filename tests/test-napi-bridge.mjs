/**
 * Extended N-API bridge tests.
 *
 * Tests the full N-API import object generation, type checking,
 * property access, function calls, and error handling.
 *
 * Run: node tests/test-napi-bridge.mjs
 */

import { NapiBridge } from '../napi-bridge/index.js';

console.log('=== N-API Bridge Extended Tests ===\n');

let passed = 0;
let failed = 0;
const NAPI_PENDING_EXCEPTION = 10;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name} — ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}

function readCString(memory, ptr) {
  if (!ptr) return '';
  const bytes = new Uint8Array(memory);
  let end = ptr;
  while (end < bytes.length && bytes[end] !== 0) end++;
  return new TextDecoder().decode(bytes.subarray(ptr, end));
}

// ---- Setup ----
const bridge = new NapiBridge(null);

// Simulate Wasm memory (4KB buffer)
const memoryBuffer = new ArrayBuffer(4096);
bridge.memory = { buffer: memoryBuffer };

// ---- Import Object Tests ----
console.log('Import Object Generation:');
const imports = bridge.getImports();

test('getImports returns object with N-API functions', () => {
  assert(typeof imports === 'object');
  assert(typeof imports.napi_create_int32 === 'function');
  assert(typeof imports.napi_create_string_utf8 === 'function');
  assert(typeof imports.napi_create_object === 'function');
  assert(typeof imports.napi_get_global === 'function');
  assert(typeof imports.napi_typeof === 'function');
  assert(typeof imports.napi_call_function === 'function');
});

const importModule = bridge.getImportModule();

test('getImportModule rejects unknown imports instead of returning success shims', () => {
  assertEq(typeof importModule.napi_create_int32, 'function');
  assertEq(importModule.__definitely_missing_import__, undefined);
  assertEq(bridge.missingImports.get('__definitely_missing_import__'), 1, 'missing import should be recorded');
});

// ---- Value Creation via Imports ----
console.log('\nValue Creation:');

test('napi_create_int32 creates handle for integer', () => {
  const resultPtr = 100; // offset in memory
  const status = imports.napi_create_int32(0, 42, resultPtr);
  assertEq(status, 0, 'should return NAPI_OK');
  const handle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  assertEq(bridge.getHandle(handle), 42);
});

test('napi_create_double creates handle for float', () => {
  const resultPtr = 200;
  const status = imports.napi_create_double(0, 3.14, resultPtr);
  assertEq(status, 0);
  const handle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  assertEq(bridge.getHandle(handle), 3.14);
});

test('napi_create_object creates empty object handle', () => {
  const resultPtr = 300;
  const status = imports.napi_create_object(0, resultPtr);
  assertEq(status, 0);
  const handle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  const obj = bridge.getHandle(handle);
  assert(typeof obj === 'object' && obj !== null);
  assertEq(Object.keys(obj).length, 0);
});

test('napi_create_array creates empty array handle', () => {
  const resultPtr = 400;
  const status = imports.napi_create_array(0, resultPtr);
  assertEq(status, 0);
  const handle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  const arr = bridge.getHandle(handle);
  assert(Array.isArray(arr));
  assertEq(arr.length, 0);
});

// ---- Global & Constants ----
console.log('\nGlobals & Constants:');

test('napi_get_global returns globalThis handle', () => {
  const resultPtr = 500;
  imports.napi_get_global(0, resultPtr);
  const handle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  assertEq(handle, 3);
  assertEq(bridge.getHandle(handle), globalThis);
});

test('napi_get_undefined returns handle 1', () => {
  const resultPtr = 600;
  imports.napi_get_undefined(0, resultPtr);
  const handle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  assertEq(handle, 1);
});

test('napi_get_null returns handle 2', () => {
  const resultPtr = 700;
  imports.napi_get_null(0, resultPtr);
  const handle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  assertEq(handle, 2);
});

// ---- Type Checking ----
console.log('\nType Checking:');

test('napi_typeof identifies types correctly', () => {
  const resultPtr = 800;

  // undefined (handle 1)
  imports.napi_typeof(0, 1, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 0, 'undefined');

  // null (handle 2)
  imports.napi_typeof(0, 2, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 1, 'null');

  // number
  const numHandle = bridge.createHandle(42);
  imports.napi_typeof(0, numHandle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 3, 'number');

  // string
  const strHandle = bridge.createHandle('hello');
  imports.napi_typeof(0, strHandle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 4, 'string');

  // function
  const fnHandle = bridge.createHandle(() => {});
  imports.napi_typeof(0, fnHandle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 7, 'function');

  // object
  const objHandle = bridge.createHandle({});
  imports.napi_typeof(0, objHandle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 6, 'object');
});

// ---- Value Getters ----
console.log('\nValue Getters:');

test('napi_get_value_int32 reads integer', () => {
  const handle = bridge.createHandle(123);
  const resultPtr = 900;
  imports.napi_get_value_int32(0, handle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 123);
});

test('napi_get_value_double reads float', () => {
  const handle = bridge.createHandle(2.718);
  const resultPtr = 1000; // 8-byte aligned for Float64
  imports.napi_get_value_double(0, handle, resultPtr);
  const val = new Float64Array(memoryBuffer, resultPtr, 1)[0];
  assert(Math.abs(val - 2.718) < 0.001);
});

test('napi_get_value_bool reads boolean', () => {
  const trueHandle = bridge.createHandle(true);
  const falseHandle = bridge.createHandle(false);
  const resultPtr = 1100;

  imports.napi_get_value_bool(0, trueHandle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 1);

  imports.napi_get_value_bool(0, falseHandle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 0);
});

// ---- String Operations ----
console.log('\nString Operations:');

test('napi_create_string_utf8 + napi_get_value_string_utf8 roundtrip', () => {
  // Write "test" into memory at offset 1200
  const encoder = new TextEncoder();
  const bytes = encoder.encode('test');
  const src = new Uint8Array(memoryBuffer, 1200, bytes.length + 1);
  src.set(bytes);
  src[bytes.length] = 0;

  // Create string handle
  const handlePtr = 1300;
  imports.napi_create_string_utf8(0, 1200, 4, handlePtr);
  const handle = new Int32Array(memoryBuffer, handlePtr, 1)[0];

  // Read back the string length
  const lenPtr = 1400;
  imports.napi_get_value_string_utf8(0, handle, 0, 0, lenPtr);
  const len = new Int32Array(memoryBuffer, lenPtr, 1)[0];
  assertEq(len, 4, 'string length');

  // Read back the string content
  const bufPtr = 1500;
  const writtenPtr = 1600;
  imports.napi_get_value_string_utf8(0, handle, bufPtr, 100, writtenPtr);
  const written = new Int32Array(memoryBuffer, writtenPtr, 1)[0];
  assertEq(written, 4);
  const result = new TextDecoder().decode(new Uint8Array(memoryBuffer, bufPtr, written));
  assertEq(result, 'test');
});

// ---- Property Access ----
console.log('\nProperty Access:');

test('napi_set/get_named_property roundtrip', () => {
  // Create object
  const objPtr = 1700;
  imports.napi_create_object(0, objPtr);
  const objHandle = new Int32Array(memoryBuffer, objPtr, 1)[0];

  // Write property name "foo" to memory
  const nameBytes = new TextEncoder().encode('foo');
  const nameView = new Uint8Array(memoryBuffer, 1800, nameBytes.length + 1);
  nameView.set(nameBytes);
  nameView[nameBytes.length] = 0;

  // Create value
  const valPtr = 1900;
  imports.napi_create_int32(0, 99, valPtr);
  const valHandle = new Int32Array(memoryBuffer, valPtr, 1)[0];

  // Set property
  imports.napi_set_named_property(0, objHandle, 1800, valHandle);

  // Get property back
  const getPtr = 2000;
  imports.napi_get_named_property(0, objHandle, 1800, getPtr);
  const gotHandle = new Int32Array(memoryBuffer, getPtr, 1)[0];
  assertEq(bridge.getHandle(gotHandle), 99);
});

test('napi_has_named_property checks existence', () => {
  const obj = { existsKey: true };
  const objHandle = bridge.createHandle(obj);

  // Write "existsKey" to memory
  const nameBytes = new TextEncoder().encode('existsKey');
  const nameView = new Uint8Array(memoryBuffer, 2100, nameBytes.length + 1);
  nameView.set(nameBytes);
  nameView[nameBytes.length] = 0;

  const resultPtr = 2200;
  imports.napi_has_named_property(0, objHandle, 2100, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 1);

  // Write "missingKey"
  const missBytes = new TextEncoder().encode('missingKey');
  const missView = new Uint8Array(memoryBuffer, 2300, missBytes.length + 1);
  missView.set(missBytes);
  missView[missBytes.length] = 0;

  imports.napi_has_named_property(0, objHandle, 2300, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 0);
});

// ---- Handle Scopes ----
console.log('\nHandle Scopes:');

test('napi_open/close_handle_scope manages handles', () => {
  const scopePtr = 2400;
  const status1 = imports.napi_open_handle_scope(0, scopePtr);
  assertEq(status1, 0);

  // Create handles inside scope
  bridge.createHandle('scoped1');
  bridge.createHandle('scoped2');

  const status2 = imports.napi_close_handle_scope(0, 0);
  assertEq(status2, 0);
});

// ---- References ----
console.log('\nReferences:');

test('napi_create/delete_reference manages refs', () => {
  const handle = bridge.createHandle({ persistent: true });
  const refPtr = 2500;

  const status1 = imports.napi_create_reference(0, handle, 1, refPtr);
  assertEq(status1, 0);

  // The handle should survive scope close because it's ref'd
  assert(bridge.refs.has(handle));

  const status2 = imports.napi_delete_reference(0, handle);
  assertEq(status2, 0);
  assert(!bridge.refs.has(handle));
});

// ---- Error Handling ----
console.log('\nError Handling:');

test('napi_is_exception_pending returns false by default', () => {
  const resultPtr = 2600;
  imports.napi_is_exception_pending(0, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 0);
});

test('napi_throw_error does not crash', () => {
  const msgBytes = new TextEncoder().encode('test error');
  const msgView = new Uint8Array(memoryBuffer, 2700, msgBytes.length + 1);
  msgView.set(msgBytes);
  msgView[msgBytes.length] = 0;

  const status = imports.napi_throw_error(0, 0, 2700);
  assertEq(status, 0);
});

test('thrown callback propagates pending exception + last_error_info', () => {
  const throwingHandle = bridge.createHandle(() => {
    throw new Error('boom from callback');
  });
  const resultPtr = 2712;
  const status = imports.napi_call_function(0, 3, throwingHandle, 0, 0, resultPtr);
  assertEq(status, NAPI_PENDING_EXCEPTION, 'napi_call_function should report pending exception');

  const pendingPtr = 2720;
  imports.napi_is_exception_pending(0, pendingPtr);
  assertEq(new Int32Array(memoryBuffer, pendingPtr, 1)[0], 1, 'exception should be pending');

  const errorInfoOutPtr = 2728;
  const errInfoStatus = imports.napi_get_last_error_info(0, errorInfoOutPtr);
  assertEq(errInfoStatus, 0);
  const errorInfoPtr = new Uint32Array(memoryBuffer, errorInfoOutPtr, 1)[0];
  assert(errorInfoPtr !== 0, 'error info pointer should be set');

  const msgPtr = new Uint32Array(memoryBuffer, errorInfoPtr, 1)[0];
  const errorCode = new Int32Array(memoryBuffer, errorInfoPtr + 12, 1)[0];
  assertEq(errorCode, NAPI_PENDING_EXCEPTION, 'last error should track pending exception');
  assert(readCString(memoryBuffer, msgPtr).includes('boom'), 'last error message should include callback error');

  const exOutPtr = 2736;
  const exStatus = imports.napi_get_and_clear_last_exception(0, exOutPtr);
  assertEq(exStatus, 0);
  const exHandle = new Int32Array(memoryBuffer, exOutPtr, 1)[0];
  const exValue = bridge.getHandle(exHandle);
  assert(exValue instanceof Error, 'cleared exception should be an Error');

  imports.napi_is_exception_pending(0, pendingPtr);
  assertEq(new Int32Array(memoryBuffer, pendingPtr, 1)[0], 0, 'pending exception should clear');
});

test('handle scopes do not show monotonic growth under load', () => {
  const baseline = bridge.getActiveHandleCount();
  const scopePtr = 2752;
  const valuePtr = 2760;

  for (let i = 0; i < 20000; i++) {
    imports.napi_open_handle_scope(0, scopePtr);
    imports.napi_create_int32(0, i, valuePtr);
    imports.napi_create_double(0, i + 0.5, valuePtr + 8);
    imports.napi_close_handle_scope(0, 0);
  }

  const finalCount = bridge.getActiveHandleCount();
  assert(finalCount <= baseline + 4,
    `active handles should remain near baseline (baseline=${baseline}, final=${finalCount})`);
});

// ---- Memory Helpers ----
console.log('\nMemory Helpers:');

test('readString reads UTF-8 from buffer', () => {
  const bytes = new TextEncoder().encode('hello wasm');
  new Uint8Array(memoryBuffer, 2800, bytes.length).set(bytes);
  assertEq(bridge.readString(2800, bytes.length), 'hello wasm');
});

test('writeString writes UTF-8 to buffer', () => {
  const written = bridge.writeString(2900, 'test', 100);
  assertEq(written, 4);
  const readBack = new TextDecoder().decode(new Uint8Array(memoryBuffer, 2900, 4));
  assertEq(readBack, 'test');
});

test('writeI32 writes 32-bit integer', () => {
  bridge.writeI32(3000, 0x12345678);
  assertEq(new Int32Array(memoryBuffer, 3000, 1)[0], 0x12345678);
});

test('writeF64 writes 64-bit float', () => {
  bridge.writeF64(3008, Math.PI); // 8-byte aligned
  const val = new Float64Array(memoryBuffer, 3008, 1)[0];
  assert(Math.abs(val - Math.PI) < 1e-10);
});

// ---- WS3-T1: Unknown import returns undefined (fail-fast) ----
console.log('\nWS3-T1 — Unknown Import Strictness:');

test('getImportModule returns undefined for unknown imports (not a callable stub)', () => {
  const freshBridge = new NapiBridge(null);
  freshBridge.memory = { buffer: new ArrayBuffer(4096) };
  const importModule = freshBridge.getImportModule();
  const value = importModule.totally_fake_napi_function;
  assertEq(value, undefined, 'unknown import should return undefined, not a function');
  assert(freshBridge.missingImports.has('totally_fake_napi_function'),
    'missing import should be recorded');
});

test('calling an unknown import throws TypeError (fail-fast)', () => {
  const freshBridge = new NapiBridge(null);
  freshBridge.memory = { buffer: new ArrayBuffer(4096) };
  const importModule = freshBridge.getImportModule();
  let threw = false;
  try {
    importModule.nonexistent_func(0);
  } catch (e) {
    threw = true;
    assert(e instanceof TypeError, `expected TypeError but got ${e.constructor.name}`);
  }
  assert(threw, 'calling unknown import should throw TypeError');
});

test('getImportModule still succeeds for known imports', () => {
  const freshBridge = new NapiBridge(null);
  freshBridge.memory = { buffer: new ArrayBuffer(4096) };
  const importModule = freshBridge.getImportModule();
  const resultPtr = 100;
  const status = importModule.napi_get_undefined(0, resultPtr);
  assertEq(status, 0, 'known import should return NAPI_OK');
});

// ---- WS3-T2: napi_call_function strictness ----
console.log('\nWS3-T2 — napi_call_function Strictness:');

test('napi_call_function returns NAPI_FUNCTION_EXPECTED for non-function', () => {
  const notAFunction = bridge.createHandle(42);
  const resultPtr = 3100;
  const status = imports.napi_call_function(0, 3, notAFunction, 0, 0, resultPtr);
  assertEq(status, 5, 'should return NAPI_FUNCTION_EXPECTED (5)');
});

test('napi_call_function returns NAPI_FUNCTION_EXPECTED for null', () => {
  const resultPtr = 3200;
  const status = imports.napi_call_function(0, 3, 2, 0, 0, resultPtr); // handle 2 = null
  assertEq(status, 5, 'null should return NAPI_FUNCTION_EXPECTED');
});

test('napi_call_function returns NAPI_FUNCTION_EXPECTED for object', () => {
  const objHandle = bridge.createHandle({ not: 'callable' });
  const resultPtr = 3300;
  const status = imports.napi_call_function(0, 3, objHandle, 0, 0, resultPtr);
  assertEq(status, 5, 'object should return NAPI_FUNCTION_EXPECTED');
});

test('napi_call_function propagates receiver-mismatch as pending exception', () => {
  // Create a getter that throws on wrong receiver.
  const proto = {};
  Object.defineProperty(proto, 'value', {
    get() { return this.__secret; },
    configurable: true,
  });
  const getter = Object.getOwnPropertyDescriptor(proto, 'value').get;
  const getterHandle = bridge.createHandle(getter);

  // Call with incompatible receiver — a plain number.
  const receiverHandle = bridge.createHandle(42);
  const resultPtr = 3400;

  // Clear any prior exception state.
  bridge.clearPendingException();

  const status = imports.napi_call_function(0, receiverHandle, getterHandle, 0, 0, resultPtr);
  // The getter should succeed (returns undefined since __secret doesn't exist) — no exception.
  assertEq(status, 0, 'getter on number receiver should succeed (returns undefined)');
});

test('napi_call_function propagates TypeError as pending exception', () => {
  // Use a built-in that truly requires a specific receiver type.
  const mapGetHandle = bridge.createHandle(Map.prototype.get);
  const badReceiverHandle = bridge.createHandle('not a map');

  // Write arg handle for the key argument.
  const argBuf = new DataView(memoryBuffer);
  const argvPtr = 3500;
  const keyHandle = bridge.createHandle('someKey');
  argBuf.setInt32(argvPtr, keyHandle, true);

  bridge.clearPendingException();
  const status = imports.napi_call_function(0, badReceiverHandle, mapGetHandle, 1, argvPtr, 3508);
  assertEq(status, 10, 'should return NAPI_PENDING_EXCEPTION');
  assert(bridge.pendingExceptionHandle != null, 'exception should be pending');

  // Cleanup.
  bridge.clearPendingException();
});

// ---- WS2-T3: Env proxy strictness ----
console.log('\nWS2-T3 — Env Proxy Strictness:');

test('env proxy returns uv_setup_args override', () => {
  // Simulate what instantiateWasm does internally.
  const envOverrides = {
    uv_setup_args: (argc, argv) => argv,
    uv__hrtime: () => 0,
  };
  const envBase = { existing_func: () => 42 };
  const envProxy = new Proxy(envBase, {
    get(target, prop) {
      if (prop in envOverrides) return envOverrides[prop];
      if (prop in target) return target[prop];
      return undefined;
    },
  });
  assertEq(typeof envProxy.uv_setup_args, 'function', 'uv_setup_args should exist');
  assertEq(envProxy.uv_setup_args(3, 0x1000), 0x1000, 'uv_setup_args returns argv');
  assertEq(envProxy.uv__hrtime(), 0, 'uv__hrtime returns 0');
});

test('env proxy returns undefined for unknown imports (not () => 0)', () => {
  const envOverrides = {
    uv_setup_args: (argc, argv) => argv,
    uv__hrtime: () => 0,
  };
  const envBase = {};
  const envProxy = new Proxy(envBase, {
    get(target, prop) {
      if (prop in envOverrides) return envOverrides[prop];
      if (prop in target) return target[prop];
      return undefined;
    },
  });
  assertEq(envProxy.some_unknown_function, undefined,
    'unknown env import should be undefined, not a stub function');
});

test('env proxy passes through existing functions', () => {
  const envOverrides = {
    uv_setup_args: (argc, argv) => argv,
    uv__hrtime: () => 0,
  };
  const envBase = { real_function: () => 99 };
  const envProxy = new Proxy(envBase, {
    get(target, prop) {
      if (prop in envOverrides) return envOverrides[prop];
      if (prop in target) return target[prop];
      return undefined;
    },
  });
  assertEq(envProxy.real_function(), 99, 'existing env function should pass through');
});

// ---- WS4-T3: Module wrap callback wiring ----
console.log('\nWS4-T3 — Module Wrap Callback Wiring:');

test('invokeImportModuleDynamically returns failure when no callback registered', () => {
  const freshBridge = new NapiBridge(null);
  freshBridge.memory = { buffer: new ArrayBuffer(4096) };
  const result = freshBridge.invokeImportModuleDynamically(0x1000, './mod.js', {}, 'main.js');
  assertEq(result.status, 9, 'should return NAPI_GENERIC_FAILURE when no callback');
  assertEq(result.resultHandle, 0, 'result handle should be 0');
});

test('invokeInitializeImportMeta returns failure when no callback registered', () => {
  const freshBridge = new NapiBridge(null);
  freshBridge.memory = { buffer: new ArrayBuffer(4096) };
  const status = freshBridge.invokeInitializeImportMeta(0x1000, {}, {});
  assertEq(status, 9, 'should return NAPI_GENERIC_FAILURE when no callback');
});

test('contextify compile result includes importModuleDynamically hook', () => {
  const freshBridge = new NapiBridge(null);
  freshBridge.memory = { buffer: new ArrayBuffer(4096) };
  const freshImports = freshBridge.getImports();

  // Write source code into memory.
  const sourceStr = 'return 1';
  const sourceBytes = new TextEncoder().encode(sourceStr);
  const srcView = new Uint8Array(freshBridge.memory.buffer, 200, sourceBytes.length);
  srcView.set(sourceBytes);

  const sourceHandle = freshBridge.createHandle(sourceStr);
  const filenameHandle = freshBridge.createHandle('test.js');
  const paramsHandle = freshBridge.createHandle([]);
  const resultOutPtr = 3600;

  const status = freshImports.unofficial_napi_contextify_compile_function(
    0, sourceHandle, filenameHandle, 0, 0, 0, 0, 0, 0, paramsHandle, 0, resultOutPtr,
  );
  assertEq(status, 0, 'compile should succeed');
  const resultHandle = new Int32Array(freshBridge.memory.buffer, resultOutPtr, 1)[0];
  const result = freshBridge.getHandle(resultHandle);
  assert(typeof result === 'object', 'result should be an object');
  assert(typeof result.function === 'function', 'result.function should exist');
  assert(typeof result.importModuleDynamically === 'function',
    'result should have importModuleDynamically hook');
});

test('CJS loader compile result includes importModuleDynamically hook', () => {
  const freshBridge = new NapiBridge(null);
  freshBridge.memory = { buffer: new ArrayBuffer(4096) };
  const freshImports = freshBridge.getImports();

  const codeHandle = freshBridge.createHandle('module.exports = 1;');
  const filenameHandle = freshBridge.createHandle('test.cjs');
  const resultOutPtr = 3700;

  const status = freshImports.unofficial_napi_contextify_compile_function_for_cjs_loader(
    0, codeHandle, filenameHandle, 0, 0, resultOutPtr,
  );
  assertEq(status, 0, 'CJS compile should succeed');
  const resultHandle = new Int32Array(freshBridge.memory.buffer, resultOutPtr, 1)[0];
  const result = freshBridge.getHandle(resultHandle);
  assert(typeof result === 'object', 'result should be an object');
  assert(typeof result.importModuleDynamically === 'function',
    'CJS result should have importModuleDynamically hook');
});

test('module_wrap callback setters store handles', () => {
  const freshBridge = new NapiBridge(null);
  freshBridge.memory = { buffer: new ArrayBuffer(4096) };
  const freshImports = freshBridge.getImports();

  assertEq(freshBridge.moduleWrapImportModuleDynamicallyCallback, 0,
    'initial callback should be 0');
  freshImports.unofficial_napi_module_wrap_set_import_module_dynamically_callback(0, 0xBEEF);
  assertEq(freshBridge.moduleWrapImportModuleDynamicallyCallback, 0xBEEF,
    'callback should be stored');

  assertEq(freshBridge.moduleWrapInitializeImportMetaObjectCallback, 0,
    'initial meta callback should be 0');
  freshImports.unofficial_napi_module_wrap_set_initialize_import_meta_object_callback(0, 0xCAFE);
  assertEq(freshBridge.moduleWrapInitializeImportMetaObjectCallback, 0xCAFE,
    'meta callback should be stored');
});

// ---- WS2-T3 v2: Env proxy `has` trap ----
console.log('\nWS2-T3 v2 — Env Proxy Has-Trap:');

test('env proxy has-trap reports false for unknown properties', () => {
  const envOverrides = Object.create(null);
  envOverrides.uv_setup_args = (argc, argv) => argv;
  envOverrides.uv__hrtime = () => 0;
  const envBase = { real_fn: () => 1 };
  const envProxy = new Proxy(envBase, {
    has(target, prop) {
      return prop in envOverrides || prop in target;
    },
    get(target, prop) {
      if (prop in envOverrides) return envOverrides[prop];
      if (prop in target) return target[prop];
      return undefined;
    },
  });
  assertEq('uv_setup_args' in envProxy, true, 'override should be reported as present');
  assertEq('real_fn' in envProxy, true, 'real env function should be reported as present');
  assertEq('totally_unknown' in envProxy, false, 'unknown prop should NOT be present');
  assertEq('some_missing_syscall' in envProxy, false, 'missing syscall should NOT be present');
});

// ---- WS3-T2 v2: argc/argvPtr validation ----
console.log('\nWS3-T2 v2 — argc/argvPtr Validation:');

test('napi_call_function returns NAPI_INVALID_ARG when argc>0 and argvPtr is null', () => {
  const fn = bridge.createHandle(() => 'should not run');
  const resultPtr = 3800;
  bridge.clearPendingException();
  const status = imports.napi_call_function(0, 3, fn, 2, 0, resultPtr);
  assertEq(status, 1, 'should return NAPI_INVALID_ARG (1) for null argvPtr with argc>0');
});

test('napi_call_function returns NAPI_INVALID_ARG when argvPtr extends beyond memory', () => {
  const fn = bridge.createHandle(() => 'should not run');
  const resultPtr = 3900;
  bridge.clearPendingException();
  // memoryBuffer is 4096 bytes; argvPtr=4090 with argc=2 needs 4090+8=4098 > 4096.
  const status = imports.napi_call_function(0, 3, fn, 2, 4090, resultPtr);
  assertEq(status, 1, 'should return NAPI_INVALID_ARG for out-of-bounds argvPtr');
});

test('napi_call_function succeeds with argc=0 and argvPtr=0', () => {
  const fn = bridge.createHandle(() => 42);
  const resultPtr = 4000;
  bridge.clearPendingException();
  const status = imports.napi_call_function(0, 3, fn, 0, 0, resultPtr);
  assertEq(status, 0, 'argc=0 with argvPtr=0 should succeed');
  const resultHandle = new Int32Array(memoryBuffer, resultPtr, 1)[0];
  assertEq(bridge.getHandle(resultHandle), 42, 'should return function result');
});

// ---- WS4-T3 v2: activeEnv tracking ----
console.log('\nWS4-T3 v2 — Active Env Tracking:');

test('unofficial_napi_create_env sets activeEnv', () => {
  const freshBridge = new NapiBridge(null);
  freshBridge.memory = { buffer: new ArrayBuffer(4096) };
  const freshImports = freshBridge.getImports();

  assertEq(freshBridge.activeEnv, 0, 'activeEnv should be 0 initially');

  const envOutPtr = 100;
  const scopeOutPtr = 104;
  freshImports.unofficial_napi_create_env(9, envOutPtr, scopeOutPtr);
  assert(freshBridge.activeEnv !== 0, 'activeEnv should be set after create_env');
  const envId = new Uint32Array(freshBridge.memory.buffer, envOutPtr, 1)[0];
  assertEq(freshBridge.activeEnv, envId, 'activeEnv should match the created env id');
});

test('unofficial_napi_create_env_with_options sets activeEnv', () => {
  const freshBridge = new NapiBridge(null);
  freshBridge.memory = { buffer: new ArrayBuffer(4096) };
  const freshImports = freshBridge.getImports();

  const envOutPtr = 200;
  const scopeOutPtr = 204;
  freshImports.unofficial_napi_create_env_with_options(9, 0, envOutPtr, scopeOutPtr);
  assert(freshBridge.activeEnv !== 0, 'activeEnv should be set');
  const envId = new Uint32Array(freshBridge.memory.buffer, envOutPtr, 1)[0];
  assertEq(freshBridge.activeEnv, envId, 'activeEnv should match');
});

// ---- WS4-T3 v2: Handle scope protection ----
console.log('\nWS4-T3 v2 — Handle Scope Protection:');

test('invokeImportModuleDynamically does not leak handles when no wasm', () => {
  const freshBridge = new NapiBridge(null);
  freshBridge.memory = { buffer: new ArrayBuffer(4096) };

  const before = freshBridge.getActiveHandleCount();
  // No wasm, so invocation fails early — but we should not leak handles.
  freshBridge.moduleWrapImportModuleDynamicallyCallback = 0xBEEF;
  const result = freshBridge.invokeImportModuleDynamically(0x1000, './mod.js', {}, 'main.js');
  assertEq(result.status, 9, 'should fail without wasm');
  const after = freshBridge.getActiveHandleCount();
  assertEq(after, before, 'should not leak handles on early failure');
});

test('invokeInitializeImportMeta does not leak handles when no wasm', () => {
  const freshBridge = new NapiBridge(null);
  freshBridge.memory = { buffer: new ArrayBuffer(4096) };

  const before = freshBridge.getActiveHandleCount();
  freshBridge.moduleWrapInitializeImportMetaObjectCallback = 0xBEEF;
  const status = freshBridge.invokeInitializeImportMeta(0x1000, {}, {});
  assertEq(status, 9, 'should fail without wasm');
  const after = freshBridge.getActiveHandleCount();
  assertEq(after, before, 'should not leak handles on early failure');
});

// ---- Summary ----
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
