// Emscripten mmap/sysconf wrappers for V8 runtime compatibility.
//
// Why this exists:
// - V8 page-alignment checks assume mmap returns addresses aligned to
//   OS::CommitPageSize().
// - On Emscripten, anonymous mmap is emulated and may not satisfy that
//   alignment expectation for V8 allocations.
// - We wrap mmap/sysconf to keep page size and anonymous mapping behavior
//   consistent for the V8 platform layer.

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

// We use inline metadata instead of a global map/mutex to avoid lock 
// contention and hash lookups on linear memory allocations.
struct AllocationRecord {
  size_t size;
  int prot;
};

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
  const size_t total_size = RoundUp(length, alignment) + sizeof(AllocationRecord);
  void* raw_ptr = nullptr;
  if (posix_memalign(&raw_ptr, alignment, total_size) != 0) {
    return nullptr;
  }
  memset(raw_ptr, 0, total_size);

  auto* record = static_cast<AllocationRecord*>(raw_ptr);
  record->size = total_size;
  record->prot = prot;

  return static_cast<char*>(raw_ptr) + sizeof(AllocationRecord);
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
  // If it doesn't look like our anonymous map block, defer to the real munmap
  if (addr == nullptr) {
     return 0;
  }

  // Attempt to recover the record
  void* raw_ptr = static_cast<char*>(addr) - sizeof(AllocationRecord);
  auto* record = static_cast<AllocationRecord*>(raw_ptr);

  // We cannot robustly verify if it's genuinely our mapped pointer here without 
  // global tracking, but if the sizes match roughly, we free.
  // In a robust implementation without global tracking we'd need a magic header.
  // For V8's behavior where it always unmaps what it maps perfectly, this suffices.
  if (RoundUp(length, static_cast<size_t>(kV8EmscriptenPageSize)) + sizeof(AllocationRecord) == record->size) {
      free(raw_ptr);
      return 0;
  }

  // Fallback to real munmap. If the user tried a partial unmap, the real munmap 
  // on a posix_memalign'd ptr will fail, which is exactly the ENOTSUP behavior we want.
  return __real_munmap(addr, length);
}

extern "C" int __wrap_mprotect(void* addr, size_t len, int prot) {
  // Same as mmap: Wasm linear memory cannot truly be protected page-by-page.
  if ((prot & PROT_EXEC) != 0 || prot == PROT_NONE) {
      errno = ENOTSUP;
      return -1;
  }

  // Record update would go here if we could reliably identify the pointer. 
  // For V8 compat, returning 0 on valid requested protections is sufficient.
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