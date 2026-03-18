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

#include <mutex>
#include <unordered_map>

namespace {

constexpr long kV8EmscriptenPageSize = 4096;

struct AllocationRecord {
  void* base = nullptr;
  size_t size = 0;
};

std::unordered_map<void*, AllocationRecord>& AllocationTable() {
  static auto* table = new std::unordered_map<void*, AllocationRecord>();
  return *table;
}

std::mutex& AllocationMutex() {
  static auto* mutex = new std::mutex();
  return *mutex;
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

void* AllocateAligned(size_t length, size_t alignment) {
  const size_t size = RoundUp(length, alignment);
  void* ptr = nullptr;
  if (posix_memalign(&ptr, alignment, size) != 0) {
    return nullptr;
  }
  memset(ptr, 0, size);
  return ptr;
}

bool ContainsRange(uintptr_t start, uintptr_t end, uintptr_t ptr, size_t len) {
  const uintptr_t range_end = ptr + len;
  return ptr >= start && range_end <= end;
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
  (void)prot;
  (void)offset;

  if (length == 0) {
    errno = EINVAL;
    return MAP_FAILED;
  }

  if (!IsAnonymousMap(flags, fd)) {
    return __real_mmap(addr, length, prot, flags, fd, offset);
  }

#ifdef MAP_FIXED
  if ((flags & MAP_FIXED) != 0) {
    return addr;
  }
#endif

  void* ptr = AllocateAligned(length, static_cast<size_t>(kV8EmscriptenPageSize));
  if (ptr == nullptr) {
    errno = ENOMEM;
    return MAP_FAILED;
  }

  std::lock_guard<std::mutex> lock(AllocationMutex());
  AllocationTable()[ptr] = AllocationRecord{
      ptr, RoundUp(length, static_cast<size_t>(kV8EmscriptenPageSize))};
  return ptr;
}

extern "C" int __wrap_munmap(void* addr, size_t length) {
  std::lock_guard<std::mutex> lock(AllocationMutex());
  auto& table = AllocationTable();

  auto it = table.find(addr);
  if (it != table.end()) {
    if (length >= it->second.size) {
      free(it->second.base);
      table.erase(it);
    }
    return 0;
  }

  const uintptr_t ptr = reinterpret_cast<uintptr_t>(addr);
  for (const auto& [base, record] : table) {
    const uintptr_t start = reinterpret_cast<uintptr_t>(base);
    const uintptr_t end = start + record.size;
    if (ContainsRange(start, end, ptr, length)) {
      // Partial unmap is treated as success for emulated anonymous mappings.
      return 0;
    }
  }

  return __real_munmap(addr, length);
}

extern "C" int __wrap_mprotect(void* addr, size_t len, int prot) {
  (void)prot;
  std::lock_guard<std::mutex> lock(AllocationMutex());
  auto& table = AllocationTable();
  const uintptr_t ptr = reinterpret_cast<uintptr_t>(addr);

  for (const auto& [base, record] : table) {
    const uintptr_t start = reinterpret_cast<uintptr_t>(base);
    const uintptr_t end = start + record.size;
    if (ContainsRange(start, end, ptr, len)) {
      return 0;
    }
  }

  return __real_mprotect(addr, len, prot);
}

extern "C" int __wrap_madvise(void* addr, size_t len, int advice) {
  (void)advice;
  std::lock_guard<std::mutex> lock(AllocationMutex());
  auto& table = AllocationTable();
  const uintptr_t ptr = reinterpret_cast<uintptr_t>(addr);

  for (const auto& [base, record] : table) {
    const uintptr_t start = reinterpret_cast<uintptr_t>(base);
    const uintptr_t end = start + record.size;
    if (ContainsRange(start, end, ptr, len)) {
      return 0;
    }
  }

  return __real_madvise(addr, len, advice);
}

#endif  // defined(__EMSCRIPTEN__)
