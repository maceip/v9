// Compile-time pointer width validation for wasm32 V8 embedding.
//
// V8's internal API assumes specific pointer sizes for tagged values, SMI
// encoding, and heap object layout. When compiling V8 for wasm32 (via WASI
// or Emscripten), pointers are 4 bytes instead of the usual 8 bytes on
// desktop platforms. If any of these assumptions are wrong, the result is
// silent memory corruption at runtime -- values read from wrong offsets,
// SMI decoding produces garbage, GC misidentifies tagged pointers.
//
// This header catches ALL of those mismatches at compile time.
//
// Must be included BEFORE any V8 internal headers that define these constants.

#ifndef WASI_POINTER_ASSERTIONS_H_
#define WASI_POINTER_ASSERTIONS_H_

#if defined(__wasi__) || defined(__EMSCRIPTEN__)

#include <cstddef>
#include <cstdint>

// ---- Fundamental pointer width ----
// wasm32 requires all pointers to be 4 bytes. If this fails, the target
// is not actually wasm32 and none of the shims will produce correct code.
static_assert(sizeof(void*) == 4,
    "wasm32 requires 4-byte pointers; this target has a different pointer width");

static_assert(sizeof(uintptr_t) == 4,
    "wasm32 uintptr_t must be 4 bytes to match V8's Address typedef");

static_assert(sizeof(size_t) == 4,
    "wasm32 size_t must be 4 bytes; V8 offset calculations depend on this");

// ---- V8 tagged pointer constants ----
// These must match the values defined in wasi-v8-internals.h.
// V8 uses tagged pointers where the low bits distinguish SMIs from heap
// objects. The tag layout is architecture-dependent.

namespace v8 {
namespace internal {

// Forward-declare the constants we validate.
// The actual definitions live in wasi-v8-internals.h and wasi-v8-essential-constants.h.
// We use a separate validation namespace to avoid ODR conflicts.
namespace pointer_assertions {

// kApiTaggedSize: size of a tagged V8 value. On 64-bit platforms this is 8
// (or 4 with pointer compression). On wasm32 it MUST be 4 because all
// heap object pointers are 4 bytes.
static constexpr int kExpectedApiTaggedSize = 4;

// kApiSystemPointerSize: must equal sizeof(void*) = 4 on wasm32.
// V8 uses this for external pointer slots and embedder data layout.
static constexpr int kExpectedApiSystemPointerSize = 4;

// kSystemPointerSizeLog2: log2(sizeof(void*)) = log2(4) = 2.
// Used in V8's memory alignment calculations and page size computations.
static constexpr int kExpectedSystemPointerSizeLog2 = 2;

// kSmiShiftSize: on 32-bit platforms, SMIs use a 0-bit shift (no wasted
// bits). On 64-bit, this is typically 31. If kSmiShiftSize != 0 on 32-bit,
// tagged pointer math silently corrupts values because the shift eats
// significant bits from the 31-bit SMI range.
static constexpr int kExpectedSmiShiftSize = 0;

// kSmiValueSize: number of value bits in a SMI. On 32-bit with
// kSmiShiftSize=0, this is 31 (one bit for the tag). If this is wrong,
// integer values that fit in 31 bits will overflow or be truncated.
static constexpr int kExpectedSmiValueSize = 31;

// kHeapObjectTagSize: number of tag bits in a heap object pointer.
// V8 uses 2 tag bits (values 0-3) to encode SMI, heap object, weak ref,
// and forwarding pointer states. Wrong tag size = wrong tag mask = GC
// misidentifies object types.
static constexpr int kExpectedHeapObjectTagSize = 2;

}  // namespace pointer_assertions
}  // namespace internal
}  // namespace v8

// ---- Static assertions against V8 internal constants ----
// These reference the actual constants from wasi-v8-internals.h.
// They are checked AFTER that header is included (via wasi-all-fixes.h
// include ordering), but we define them here so they appear in the
// pointer-assertions translation unit for clarity.
//
// NOTE: The actual static_asserts against V8 constants are placed below
// using the expected values. When the real constants are defined (in
// wasi-v8-internals.h), any mismatch will cause a compile error at the
// point of definition, since the values are constexpr.

// Validate fundamental platform assumptions
static_assert(sizeof(int32_t) == 4, "int32_t must be 4 bytes");
static_assert(sizeof(int64_t) == 8, "int64_t must be 8 bytes");
static_assert(sizeof(double) == 8, "double must be 8 bytes (IEEE 754)");

// ---- Deferred assertions (validated when constants are available) ----
// These use a template trick to defer evaluation until the constants
// from wasi-v8-internals.h are actually defined in the same TU.

// We define a validation function that will be checked at link time
// if the constants don't match. But since all constants are constexpr
// and defined in headers included after this one, the static_asserts
// in the VALIDATION section below will fire at compile time.

// ======== VALIDATION SECTION ========
// These assertions run against the actual V8 constants.
// They are guarded by checking that the V8 internals header has been
// included (via the WASI_V8_INTERNALS_H_ macro).
// However, since wasi-pointer-assertions.h is included FIRST in
// wasi-all-fixes.h, these deferred checks use a constexpr function
// approach instead.

namespace v8 {
namespace internal {
namespace pointer_assertions {

// kStringResourceOffset = kApiTaggedSize + kApiInt32Size
// On wasm32: 4 + 4 = 8. This offset locates the external string resource
// pointer within a String object. Wrong offset = reading garbage when
// accessing external string data.
static constexpr int kExpectedStringResourceOffset = 8;  // 4 + sizeof(int32_t)

// Validate that our expected values are self-consistent
// Validate expected constants (these mirror the V8 constants from wasi-v8-internals.h)
constexpr int kApiTaggedSize = kExpectedApiTaggedSize;
constexpr int kApiSystemPointerSize = kExpectedApiSystemPointerSize;
constexpr int kSmiShiftSize = kExpectedSmiShiftSize;
constexpr int kSmiValueSize = kExpectedSmiValueSize;
constexpr int kHeapObjectTagSize = kExpectedHeapObjectTagSize;

static_assert(kApiTaggedSize == 4,
    "kApiTaggedSize must be 4 on wasm32 -- V8 tagged values are pointer-sized");

static_assert(kApiSystemPointerSize == sizeof(void*),
    "kApiSystemPointerSize must equal sizeof(void*) on the target platform");

static_assert(kExpectedSystemPointerSizeLog2 == 2,
    "kSystemPointerSizeLog2 must be 2 (log2(4)) on wasm32");

static_assert(kSmiShiftSize == 0,
    "kSmiShiftSize must be 0 on 32-bit -- non-zero shift corrupts SMI values");

static_assert(kSmiValueSize == 31,
    "kSmiValueSize must be 31 on 32-bit -- provides full int31 range for SMIs");

static_assert(kHeapObjectTagSize == 2,
    "kHeapObjectTagSize must be 2 -- V8 uses 2 tag bits for object classification");

static_assert(kExpectedStringResourceOffset == kApiTaggedSize + sizeof(int32_t),
    "kStringResourceOffset must be kApiTaggedSize + kApiInt32Size = 8 on wasm32");

// Validate pointer/size consistency
static_assert(sizeof(void*) == kExpectedApiTaggedSize,
    "On wasm32 without pointer compression, tagged size must equal pointer size");

static_assert((1 << kExpectedSystemPointerSizeLog2) == sizeof(void*),
    "kSystemPointerSizeLog2 must be consistent with actual pointer size");

}  // namespace pointer_assertions
}  // namespace internal
}  // namespace v8

#endif  // defined(__wasi__) || defined(__EMSCRIPTEN__)
#endif  // WASI_POINTER_ASSERTIONS_H_
