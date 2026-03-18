# Coding Conventions

**Analysis Date:** 2026-03-18

## Naming Patterns

**Files:**
- Lowercase with hyphens for multi-word names: `napi-bridge/`, `test-basic.mjs`, `browser-builtins.js`
- Suffixes: `.js` for CommonJS/ES modules, `.mjs` for ES modules explicitly
- Test files use descriptive names with `test-` prefix: `test-basic.mjs`, `test-napi-bridge.mjs`

**Functions:**
- Camel case for all function names: `createHandle()`, `openHandleScope()`, `writeString()`
- Descriptive action-oriented names (verb + noun pattern): `createHandle`, `freeHandle`, `readString`, `writeI32`, `closeHandleScope`
- Private helper functions use same camel case, no leading underscore or trailing underscore convention enforced

**Variables:**
- Camel case for all variable names: `wasmModule`, `resultPtr`, `handleFreeList`, `currentScope`
- Constants use UPPER_SNAKE_CASE: `NAPI_OK`, `NAPI_INVALID_ARG`, `NAPI_OBJECT_EXPECTED`, `NAPI_UNDEFINED`
- Descriptive names over abbreviations: `memoryBuffer` not `buf`, `byteLength` not `len` (though `len` is used for lengths)

**Types/Classes:**
- Pascal case for class names: `NapiBridge`
- No interface/type naming suffix conventions (class-based approach without TypeScript)

## Code Style

**Formatting:**
- No detected linting config (ESLint/Prettier)
- Manual formatting conventions observed:
  - 2-space indentation consistently applied
  - Opening braces on same line (K&R style): `if (handle <= 2) return;`
  - Methods separated by single blank line within classes
  - Comments precede code blocks

**Linting:**
- Basic syntax check via `node --check` in Makefile (line 188 of `/home/pooppoop/v9/Makefile`)
- No formal ESLint or Prettier configuration
- Manual code review approach

## Import Organization

**Order:**
1. Standard library imports (if any)
2. Internal module imports
3. No strict grouping enforced

**Path Aliases:**
- Not used — absolute paths and relative imports only
- Relative imports within same package: `import { NapiBridge } from '../napi-bridge/index.js'`
- No barrel files or re-export patterns observed

**Examples from codebase:**
```javascript
// From test-basic.mjs
import { NapiBridge } from '../napi-bridge/index.js';

// From jspi-adapter.js
export function wrapAsyncImport(asyncFn) { ... }
```

## Error Handling

**Patterns:**
- Range validation with early return: `if (handle < 0 || handle >= this.handles.length) { throw new Error(...) }`
- Error codes returned as status codes: `return NAPI_PENDING_EXCEPTION;` (line 287 of `/home/pooppoop/v9/napi-bridge/index.js`)
- Try-catch for exception handling in function calls: `try { ... } catch (e) { ... return NAPI_PENDING_EXCEPTION; }` (lines 280-288 of `/home/pooppoop/v9/napi-bridge/index.js`)
- Guard clauses for missing state: `if (!this.memory) return '';` (line 127 of `/home/pooppoop/v9/napi-bridge/index.js`)
- Errors logged to console before returning error code: `console.error(...); return -1;`

## Logging

**Framework:** Native `console` object — no logging library

**Patterns:**
- `console.log()` for informational messages: `console.log('[edgejs] Runtime initialized')`
- `console.error()` for error conditions: `console.error('[napi] Error: ${msg}')`
- `console.warn()` for warnings: `console.warn('[jspi] WebAssembly.Suspending not available, using sync fallback')`
- Bracket notation for context tags: `[edgejs]`, `[napi]`, `[jspi]` prefix in messages
- No structured logging; all logs are human-readable strings

## Comments

**When to Comment:**
- File-level JSDoc blocks document module purpose, architecture notes, and external references
- Inline comments explain non-obvious logic: `// Check if value is already a well-known handle` (line 67 of `/home/pooppoop/v9/napi-bridge/index.js`)
- Section dividers use comment blocks: `// --- Handle Management ---` (line 63)
- Skip state comments: `// Set when module initializes` (line 49)
- Algorithm explanation for complex operations: String reading with null terminator handling (lines 186-188)

**JSDoc/TSDoc:**
- Single-line JSDoc for method documentation: `/** Allocate a handle for a JS value, return integer handle */` (line 65)
- Parameter descriptions included: `@param {Function} asyncFn - An async function to wrap` (line 25 of `/home/pooppoop/v9/napi-bridge/jspi-adapter.js`)
- Return type documented: `@returns {WebAssembly.Suspending} - JSPI-wrapped import` (line 26)
- Multiline JSDoc for complex functions with context explanation
- Example: Lines 157-160 of `/home/pooppoop/v9/napi-bridge/index.js` for `getImports()` method

## Function Design

**Size:**
- Methods range 2-40 lines, most 5-15 lines
- Larger methods (30-40 lines) are for complex marshaling like `napi_call_function` (lines 272-289)
- Preference for small, focused methods

**Parameters:**
- Positional parameters follow N-API convention: `(env, ...args, resultPtr)`
- Memory pointers passed as numbers (32-bit integers): `writeI32(ptr, value)`
- No parameter validation in function signature; validation happens in method body

**Return Values:**
- Status code convention: Functions return integer codes (0 = success): `return NAPI_OK;`
- Results written to memory pointer: Output stored at `resultPtr` rather than returned
- Void methods used only for setup/initialization

## Module Design

**Exports:**
- Named exports for utility functions: `export function wrapAsyncImport(asyncFn)` (line 28 of `/home/pooppoop/v9/napi-bridge/jspi-adapter.js`)
- Named exports for constants and factories: `export function createIOImports()` (line 59)
- Default export of class rarely used: Only `export { NapiBridge }` for named export (line 450 of `/home/pooppoop/v9/napi-bridge/index.js`)
- All exports explicit, no barrel files

**Barrel Files:**
- Not used — each module exports its own interface
- Direct imports from specific files: `import { NapiBridge } from '../napi-bridge/index.js'`

## Type System

**Types:**
- No TypeScript or type annotations
- Type information conveyed through JSDoc when critical
- Runtime type checking in methods: `typeof value === 'string'` and switch statements for type coercion
- Magic numbers documented with named constants: `NAPI_UNDEFINED = 0`, `NAPI_NULL = 1`, `NAPI_NUMBER = 3`

---

*Convention analysis: 2026-03-18*
