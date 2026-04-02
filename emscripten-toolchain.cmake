# Emscripten Toolchain for EdgeJS
# Replaces wasix/wasix-toolchain.cmake from upstream EdgeJS
#
# Usage:
#   cmake -DCMAKE_TOOLCHAIN_FILE=../emscripten-toolchain.cmake ..
#
# This file mirrors the structure of EdgeJS's wasix-toolchain.cmake
# but targets Emscripten instead of WASIX.

# ---- Emscripten SDK Detection ----
if(NOT DEFINED ENV{EMSDK})
    message(FATAL_ERROR "EMSDK environment variable not set. Run: source emsdk_env.sh")
endif()

set(EMSDK_DIR "$ENV{EMSDK}")
set(EMSCRIPTEN_ROOT "${EMSDK_DIR}/upstream/emscripten")

# ---- System identification ----
set(CMAKE_SYSTEM_NAME Emscripten)
set(CMAKE_SYSTEM_PROCESSOR wasm32)
set(CMAKE_CROSSCOMPILING TRUE)
# Avoid CMake link checks inheriting Emscripten export constraints.
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)
set(EDGE_IS_EMSCRIPTEN_TARGET ON)
set(EDGE_ALLOW_UNDEFINED_IMPORTS ON CACHE BOOL "" FORCE)
set(UNDEFINED_SYMBOLS_FLAG "-sERROR_ON_UNDEFINED_SYMBOLS=0")

# ---- Compilers ----
if(WIN32 OR CMAKE_HOST_SYSTEM_NAME STREQUAL "Windows")
    set(_BAT ".bat")
else()
    set(_BAT "")
endif()
set(CMAKE_C_COMPILER "${EMSCRIPTEN_ROOT}/emcc${_BAT}")
set(CMAKE_CXX_COMPILER "${EMSCRIPTEN_ROOT}/em++${_BAT}")
set(CMAKE_AR "${EMSCRIPTEN_ROOT}/emar${_BAT}")
set(CMAKE_RANLIB "${EMSCRIPTEN_ROOT}/emranlib${_BAT}")
set(CMAKE_STRIP "${EMSCRIPTEN_ROOT}/emstrip${_BAT}")

# ---- Wasm feature flags ----
# Match EdgeJS's WASIX build features, adapted for Emscripten
set(WASM_FEATURES
    "-msimd128"
    "-mbulk-memory"
    "-matomics"
    "-mtail-call"
    "-fwasm-exceptions"
)
string(JOIN " " WASM_FEATURES_STR ${WASM_FEATURES})

# ---- Compiler flags ----
set(CMAKE_C_FLAGS_INIT "${WASM_FEATURES_STR} -pthread")
set(CMAKE_CXX_FLAGS_INIT "${WASM_FEATURES_STR} -pthread -std=c++20")

# ---- N-API Provider ----
# In browser mode, N-API is provided by the browser's JS engine
# This matches EdgeJS's WASIX mode where EDGE_NAPI_PROVIDER=imports
set(EDGE_NAPI_PROVIDER "imports" CACHE STRING "N-API provider: browser JS engine")

# ---- Exported functions ----
# Core exports needed by the N-API browser bridge
set(EXPORTED_FUNCTIONS
    "_main"
    "_malloc"
    "_free"
)

# ---- Emscripten-specific link flags ----
set(EMSCRIPTEN_LINK_FLAGS
    "-sALLOW_MEMORY_GROWTH=1"
    "-sMAXIMUM_MEMORY=4GB"
    "-sINITIAL_MEMORY=128MB"
    "-sSTACK_SIZE=8MB"
    "-sSHARED_MEMORY=1"
    "-pthread"
    "-sJSPI=1"
    "-sWASM_BIGINT=0"
    "-sMODULARIZE=1"
    "-sEXPORT_NAME='EdgeJSModule'"
    "-sFILESYSTEM=1"
    "-sFORCE_FILESYSTEM=1"
    "-sALLOW_UNIMPLEMENTED_SYSCALLS=1"
    "${UNDEFINED_SYMBOLS_FLAG}"
    # Work around LLD wasm crashes on very large links (ImportSection::addImport SIGSEGV)
    # without GC — see llvm/llvm-project#53987 and similar import-table bugs.
    "-Wl,--gc-sections"
    "--js-library=${CMAKE_CURRENT_LIST_DIR}/wasi-shims/napi-emscripten-library.js"
    "-Wl,--wrap=sysconf"
    "-Wl,--wrap=mmap"
    "-Wl,--wrap=munmap"
    "-Wl,--wrap=mprotect"
    "-Wl,--wrap=madvise"
    "-sEXPORTED_FUNCTIONS=['_main','_malloc','_free']"
    "-Wl,--export-if-defined=napi_module_register"
    "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','addFunction','dynCall','UTF8ToString','stringToUTF8','FS','HEAPU8','HEAP32']"
)
string(JOIN " " CMAKE_EXE_LINKER_FLAGS_INIT ${EMSCRIPTEN_LINK_FLAGS})

# ---- Definitions ----
# Tell EdgeJS we're in browser/Emscripten mode
add_definitions(
    -DEDGE_PLATFORM_EMSCRIPTEN=1
    -DEDGE_NAPI_PROVIDER_IMPORTS=1
    -DV8_JITLESS_MODE=1
)

# ---- Find paths ----
set(CMAKE_FIND_ROOT_PATH "${EMSCRIPTEN_ROOT}/cache/sysroot")
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
