# Testing Patterns

**Analysis Date:** 2026-03-18

## Test Framework

**Runner:**
- Node.js native execution (no test framework like Jest or Vitest)
- Tests run as standalone `.mjs` files via `node`
- Config: None — tests self-contained in files

**Assertion Library:**
- Custom assertion helpers defined in test files themselves
- No external assertion library (no chai, assert, or jest)

**Run Commands:**
```bash
npm test                    # Run all tests (test-basic.mjs + test-napi-bridge.mjs)
npm run test:basic         # Run basic smoke tests only
npm run test:napi          # Run N-API bridge extended tests only
make test                  # Via Makefile
```

Test scripts defined in `/home/pooppoop/v9/package.json` (lines 14-16):
```json
"test": "node tests/test-basic.mjs && node tests/test-napi-bridge.mjs",
"test:basic": "node tests/test-basic.mjs",
"test:napi": "node tests/test-napi-bridge.mjs"
```

## Test File Organization

**Location:**
- Separate from source code: `/home/pooppoop/v9/tests/` directory
- Source code in `/home/pooppoop/v9/napi-bridge/`
- Tests do NOT live alongside implementation

**Naming:**
- Descriptive prefixed names: `test-basic.mjs`, `test-napi-bridge.mjs`
- `.mjs` extension to ensure ES module parsing

**Structure:**
```
tests/
├── test-basic.mjs              # 75 lines
└── test-napi-bridge.mjs        # 354 lines
```

## Test Structure

**Suite Organization:**
```javascript
// From test-basic.mjs (lines 10-24)
let passed = 0;
let failed = 0;

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

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}
```

**Patterns:**
- Manual test runner using `test()` helper function
- Pass/fail counter tracking
- Test sections announced with `console.log()`: `console.log('NapiBridge Handle Table:');`
- Exit code reflects pass/fail: `process.exit(failed > 0 ? 1 : 0);` (line 75 of `/home/pooppoop/v9/tests/test-basic.mjs`)

**Setup Pattern:**
- Global setup before test sections
- Example: Memory buffer initialization (line 40 of `/home/pooppoop/v9/tests/test-napi-bridge.mjs`):
```javascript
const memoryBuffer = new ArrayBuffer(4096);
bridge.memory = { buffer: memoryBuffer };
```

**Teardown Pattern:**
- No explicit teardown — relies on garbage collection
- Handle scope cleanup tested within tests: `bridge.openHandleScope(); ... bridge.closeHandleScope();` (lines 57-64 of `/home/pooppoop/v9/tests/test-basic.mjs`)

**Assertion Pattern:**
```javascript
// Simple assertion
assert(bridge.getHandle(0) === undefined);

// Custom assertion helper with message
function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
}
assertEq(bridge.getHandle(h1), 42);
```

## Mocking

**Framework:** No mocking framework used

**Patterns:**
- Object literals serve as mock objects:
```javascript
// From test-napi-bridge.mjs line 40-41
const memoryBuffer = new ArrayBuffer(4096);
bridge.memory = { buffer: memoryBuffer };
```

- Manual mock functions:
```javascript
// From test-napi-bridge.mjs line 249-250
const obj = { existsKey: true };
const objHandle = bridge.createHandle(obj);
```

**What to Mock:**
- External dependencies (Wasm module): Pass `null` to NapiBridge constructor and mock memory
- File I/O: Not tested (no filesystem operations in bridge)
- Network operations: Stubbed in JSPI adapter tests (not exercised in current test suite)

**What NOT to Mock:**
- Handle table operations — tested directly
- N-API function implementations — tested end-to-end through imports
- Memory buffer operations — use real ArrayBuffer

## Fixtures and Factories

**Test Data:**
- Inline fixture creation:
```javascript
// From test-napi-bridge.mjs lines 189-195
const encoder = new TextEncoder();
const bytes = encoder.encode('test');
const src = new Uint8Array(memoryBuffer, 1200, bytes.length + 1);
src.set(bytes);
src[bytes.length] = 0;
```

- Factory method in test helper:
```javascript
// From test-basic.mjs line 34
const bridge = new NapiBridge(null);
```

**Location:**
- No centralized fixtures — data created ad-hoc in test functions
- Reusable object templates embedded in tests (e.g., `{ existsKey: true }` at line 249)
- Memory layout hardcoded: Different offset pointers (1200, 1300, etc.) for each test to avoid conflicts

## Coverage

**Requirements:** Not enforced

**View Coverage:** No coverage tooling configured

Current tests cover:
- Handle table allocation/freeing (test-basic.mjs)
- N-API import object generation (test-napi-bridge.mjs)
- Value creation (int32, double, object, array, strings)
- Type checking via `napi_typeof`
- Property access (get/set/has named properties)
- Function calls with argument marshaling
- Handle scopes and reference counting
- Memory helpers (readString, writeI32, writeF64)
- Error handling and exception pending state

## Test Types

**Unit Tests:**
- Scope: Individual N-API functions
- Approach: Black-box testing of imports object
- Example: `test('napi_create_int32 creates handle for integer', ...)` (line 60)
- Test only the function behavior, not implementation details

**Integration Tests:**
- Scope: Multiple N-API functions working together (roundtrips)
- Approach: Test encoding/decoding cycles
- Example: String creation + value reading roundtrip (lines 189-216 of test-napi-bridge.mjs)
- Named property set + get roundtrip (lines 221-246)

**E2E Tests:**
- Framework: Not used
- Note: Would require actual Wasm module loading; current tests mock the memory interface

## Common Patterns

**Async Testing:**
Not used — all tests are synchronous

**Error Testing:**
```javascript
// From test-basic.mjs line 36
test('well-known handles: undefined=0, null=1, global=2', () => {
  assert(bridge.getHandle(0) === undefined);
  assert(bridge.getHandle(1) === null);
  assert(bridge.getHandle(2) === globalThis);
});
```

- Errors throw from assertion helpers and caught by test runner
- No explicit "should throw" pattern — errors are failures
- Error message preservation: `throw new Error(msg || 'Assertion failed')`

**Memory Operations Testing:**
```javascript
// From test-napi-bridge.mjs lines 159-164
test('napi_get_value_int32 reads integer', () => {
  const handle = bridge.createHandle(123);
  const resultPtr = 900;
  imports.napi_get_value_int32(0, handle, resultPtr);
  assertEq(new Int32Array(memoryBuffer, resultPtr, 1)[0], 123);
});
```

- Direct ArrayBuffer manipulation to verify memory writes
- Typed array views for reading back values
- Pointer arithmetic for memory layout (offset by 4 bytes per I32, 8 bytes per F64)

**Floating Point Assertion:**
```javascript
// From test-napi-bridge.mjs lines 170-171
const val = new Float64Array(memoryBuffer, resultPtr, 1)[0];
assert(Math.abs(val - 2.718) < 0.001);  // Tolerance for floating point
```

## Test Quality Observations

**Strengths:**
- Comprehensive coverage of N-API bridge functionality
- Clear test names describing expected behavior
- Both positive (success path) and edge case tests (e.g., handle reuse at line 66-71 of test-basic.mjs)
- Memory layout tests verify actual byte-level correctness

**Gaps:**
- No coverage of JSPI adapter functions (`wrapAsyncImport`, `createIOImports`)
- No coverage of browser-builtins module (crypto, path bridges)
- No error condition tests (invalid handles, out-of-bounds memory access)
- No concurrent/race condition tests
- No coverage of exception handling paths in N-API (napi_throw_error tested at line 315, but not exception state transitions)

---

*Testing analysis: 2026-03-18*
