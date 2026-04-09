#!/bin/bash
# Build wolfSSL → Wasm for v9 in-browser TLS.
# Prerequisites: emsdk activated, wolfSSL cloned to /tmp/wolfssl
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WOLFSSL_SRC="${WOLFSSL_SRC:-/tmp/wolfssl}"
WOLFSSL_BUILD="${WOLFSSL_SRC}/build-wasm"

# Step 1: Build wolfSSL static library if not present
if [ ! -f "${WOLFSSL_BUILD}/libwolfssl.a" ]; then
  echo "Building wolfSSL..."
  mkdir -p "${WOLFSSL_BUILD}"
  cd "${WOLFSSL_BUILD}"
  emcmake cmake "${WOLFSSL_SRC}" \
    -DWOLFSSL_TLS13=yes \
    -DWOLFSSL_SNI=yes \
    -DWOLFSSL_ALPN=yes \
    -DWOLFSSL_OCSP=no \
    -DWOLFSSL_FILESYSTEM=no \
    -DWOLFSSL_EXAMPLES=no \
    -DWOLFSSL_CRYPT_TESTS=no \
    -DBUILD_SHARED_LIBS=OFF \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_FLAGS="-DWOLFSSL_USER_IO -DNO_FILESYSTEM -DWOLFSSL_NO_SOCK"
  emmake make -j$(nproc)
fi

# Step 2: Compile glue → .js + .wasm
echo "Compiling wolfssl-glue.c..."
cd "${SCRIPT_DIR}"
emcc wolfssl-glue.c \
  -I"${WOLFSSL_SRC}" \
  -I"${WOLFSSL_BUILD}" \
  -L"${WOLFSSL_BUILD}" \
  -lwolfssl \
  -o wolfssl.js \
  -DWOLFSSL_USER_IO -DNO_FILESYSTEM -DWOLFSSL_NO_SOCK \
  -s EXPORTED_FUNCTIONS='["_wssl_init","_wssl_new","_wssl_handshake","_wssl_write","_wssl_read","_wssl_shutdown","_wssl_free","_wssl_push_recv","_wssl_pull_send","_wssl_send_pending","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","stringToUTF8","UTF8ToString","HEAPU8"]' \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='WolfSSL' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=8388608 \
  -s ENVIRONMENT='web,worker' \
  -s FILESYSTEM=0 \
  -O2

echo "Done: wolfssl.js ($(wc -c < wolfssl.js) bytes) + wolfssl.wasm ($(wc -c < wolfssl.wasm) bytes)"
