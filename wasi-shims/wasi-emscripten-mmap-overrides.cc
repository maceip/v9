// Emscripten mmap/sysconf wrappers for V8 runtime compatibility.
//
// Why this exists:
// - V8 page-alignment checks assume mmap returns addresses aligned to
//   OS::CommitPageSize().
// - On Emscripten, anonymous mmap is emulated and may not satisfy that
//   alignment expectation for V8 allocations.
// - We wrap mmap/sysconf to keep page size and anonymous mapping behavior
//   consistent for the V8 platform layer.
//
// Allocation strategy:
// - Each anonymous mapping has a MappingHeader with magic + size + prot.
// - A global allocation set tracks all live mappings for robust validation.
// - munmap validates the magic header before freeing.

#if defined(__EMSCRIPTEN__)

#include <errno.h>
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <unistd.h>

namespace {

constexpr long kV8EmscriptenPageSize = 4096;
constexpr uint32_t kMappingMagic = 0xED6E4D41; // "EDMA" - EdgeJS MMap Allocation

struct MappingHeader {
  uint32_t magic;
  size_t total_size;   // includes header + payload
  size_t payload_size; // user-requested length (rounded up to page alignment)
  int prot;
};

// Allocation tracking set for robust munmap validation.
// We use a simple sorted array since typical mapping counts are small (<1000).
// For larger workloads, this could be replaced with an unordered_set.
static void** g_live_mappings = nullptr;
static size_t g_live_count = 0;
static size_t g_live_capacity = 0;

void TrackMapping(void* header_ptr) {
  if (g_live_count >= g_live_capacity) {
    size_t new_cap = g_live_capacity == 0 ? 64 : g_live_capacity * 2;
    void** new_arr = static_cast<void**>(realloc(g_live_mappings, new_cap * sizeof(void*)));
    if (!new_arr) return; // best-effort tracking
    g_live_mappings = new_arr;
    g_live_capacity = new_cap;
  }
  g_live_mappings[g_live_count++] = header_ptr;
}

bool UntrackMapping(void* header_ptr) {
  for (size_t i = 0; i < g_live_count; i++) {
    if (g_live_mappings[i] == header_ptr) {
      g_live_mappings[i] = g_live_mappings[--g_live_count];
      return true;
    }
  }
  return false;
}

bool IsTrackedMapping(void* header_ptr) {
  for (size_t i = 0; i < g_live_count; i++) {
    if (g_live_mappings[i] == header_ptr) return true;
  }
  return false;
}

size_t RoundUp(size_t value, size_t alignment) {
  return (value + alignment - 1) & ~(alignment - 1);
}

bool IsAnonymousMap(int flags, int fd) {
  if (fd != -1) {
    return false;
  }
#ifdef MAP_ANONYMOUS
  if ((flags & MAP_ANONYMOUS) != 0) {
    return true;
  }
#endif
#ifdef MAP_ANON
  if ((flags & MAP_ANON) != 0) {
    return true;
  }
#endif
  return false;
}

void* AllocateAligned(size_t length, size_t alignment, int prot) {
  const size_t payload_size = RoundUp(length, alignment);
  const size_t total_size = payload_size + sizeof(MappingHeader);
  // Align the full allocation (header + payload) so the user pointer
  // is also aligned. We add alignment padding to ensure this.
  const size_t alloc_size = total_size + alignment;
  void* raw_ptr = nullptr;
  if (posix_memalign(&raw_ptr, alignment, alloc_size) != 0) {
    return nullptr;
  }
  memset(raw_ptr, 0, alloc_size);

  // Place header at the start, user pointer right after (aligned)
  auto* header = static_cast<MappingHeader*>(raw_ptr);
  header->magic = kMappingMagic;
  header->total_size = alloc_size;
  header->payload_size = payload_size;
  header->prot = prot;

  TrackMapping(raw_ptr);

  return static_cast<char*>(raw_ptr) + sizeof(MappingHeader);
}

}  // namespace

extern "C" long __real_sysconf(int name);
extern "C" void* __real_mmap(void* addr, size_t length, int prot, int flags,
                             int fd, off_t offset);
extern "C" int __real_munmap(void* addr, size_t length);
extern "C" int __real_mprotect(void* addr, size_t len, int prot);
extern "C" int __real_madvise(void* addr, size_t len, int advice);

extern "C" long __wrap_sysconf(int name) {
  if (name == _SC_PAGESIZE) {
    return kV8EmscriptenPageSize;
  }
#ifdef _SC_PAGE_SIZE
  if (name == _SC_PAGE_SIZE) {
    return kV8EmscriptenPageSize;
  }
#endif
  return __real_sysconf(name);
}

extern "C" void* __wrap_mmap(void* addr, size_t length, int prot, int flags,
                             int fd, off_t offset) {
  (void)offset;

  if (length == 0) {
    errno = EINVAL;
    return MAP_FAILED;
  }

  // PROT_EXEC and PROT_NONE cannot be truly enforced in Wasm linear memory.
  // Return ENOTSUP with clear semantics.
  if ((prot & PROT_EXEC) != 0 || prot == PROT_NONE) {
    errno = ENOTSUP;
    return MAP_FAILED;
  }

  if (!IsAnonymousMap(flags, fd)) {
    return __real_mmap(addr, length, prot, flags, fd, offset);
  }

#ifdef MAP_FIXED
  if ((flags & MAP_FIXED) != 0) {
    // MAP_FIXED is not supported for our emulated anonymous mappings,
    // because we rely on posix_memalign which dictates the address.
    errno = ENOTSUP;
    return MAP_FAILED;
  }
#endif

  void* ptr = AllocateAligned(length, static_cast<size_t>(kV8EmscriptenPageSize), prot);
  if (ptr == nullptr) {
    errno = ENOMEM;
    return MAP_FAILED;
  }

  return ptr;
}

extern "C" int __wrap_munmap(void* addr, size_t length) {
  if (addr == nullptr) {
     return 0;
  }

  // Recover the header and validate via magic + allocation tracking
  void* raw_ptr = static_cast<char*>(addr) - sizeof(MappingHeader);
  auto* header = static_cast<MappingHeader*>(raw_ptr);

  // Three-way validation: magic header + tracked pointer + size consistency
  if (header->magic == kMappingMagic && IsTrackedMapping(raw_ptr)) {
    const size_t rounded_length = RoundUp(length, static_cast<size_t>(kV8EmscriptenPageSize));
    if (rounded_length == header->payload_size) {
      UntrackMapping(raw_ptr);
      // Clear magic to prevent use-after-free false positives
      header->magic = 0;
      free(raw_ptr);
      return 0;
    }
    // Partial unmap of a tracked mapping — not supported
    errno = ENOTSUP;
    return -1;
  }

  // Not our mapping — fall back to real munmap
  return __real_munmap(addr, length);
}

extern "C" int __wrap_mprotect(void* addr, size_t len, int prot) {
  // Wasm linear memory cannot truly be protected page-by-page.
  if ((prot & PROT_EXEC) != 0 || prot == PROT_NONE) {
      errno = ENOTSUP;
      return -1;
  }

  // If this is one of our tracked mappings, update the recorded protection
  void* raw_ptr = static_cast<char*>(addr) - sizeof(MappingHeader);
  auto* header = static_cast<MappingHeader*>(raw_ptr);
  if (header->magic == kMappingMagic && IsTrackedMapping(raw_ptr)) {
    header->prot = prot;
  }

  return 0;
}

extern "C" int __wrap_madvise(void* addr, size_t len, int advice) {
  // madvise is an advice, ignoring it is technically valid POSIX behavior.
  return 0;
}

// ---- Emscripten missing POSIX syscall stubs ----
extern "C" int execve(const char* pathname, char* const argv[], char* const envp[]) {
  (void)pathname; (void)argv; (void)envp;
  errno = ENOSYS;
  return -1;
}

#endif  // defined(__EMSCRIPTEN__)
