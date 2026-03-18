#ifndef WASI_POINTER_ASSERTIONS_H_
#define WASI_POINTER_ASSERTIONS_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#ifdef __cplusplus
#include <cstddef>
#include <cstdint>
#define WASI_STATIC_ASSERT static_assert
#else
#include <stddef.h>
#include <stdint.h>
#define WASI_STATIC_ASSERT _Static_assert
#endif

// Fundamental wasm32 assumptions used by the shim layer.
WASI_STATIC_ASSERT(sizeof(void*) == 4,
                   "wasm32 requires 4-byte pointers");
WASI_STATIC_ASSERT(sizeof(uintptr_t) == 4,
                   "wasm32 requires 32-bit uintptr_t");
WASI_STATIC_ASSERT(sizeof(size_t) == 4,
                   "wasm32 requires 32-bit size_t");
WASI_STATIC_ASSERT(sizeof(int32_t) == 4, "int32_t must be 4 bytes");
WASI_STATIC_ASSERT(sizeof(int64_t) == 8, "int64_t must be 8 bytes");

#undef WASI_STATIC_ASSERT

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_POINTER_ASSERTIONS_H_
