# Reproducible EdgeJS / v9 Wasm toolchain for engineer laptops (Docker).
# Matches the successful Cory path: modern wasm-ld via emsdk `tot` by default
# (LLD 19 in 3.1.64 can SIGSEGV on some host kernels — see docs/BUILD_TOOLCHAIN.md).
#
# Build from repo root:
#   docker build -f docker/Dockerfile -t v9-wasm-toolchain .
#
# Run full native compile inside the container (repo bind-mounted):
#   docker run --rm -v "$PWD:/workspace" -w /workspace v9-wasm-toolchain \
#     bash -lc 'make fetch && make configure && make build'
#
# Optional: pin CI-like SDK (may still hit wasm-ld issues on some hosts):
#   docker build -f docker/Dockerfile --build-arg EMSDK_FLAVOR=3.1.64 -t v9-wasm-3164 .

# syntax=docker/dockerfile:1
ARG UBUNTU_TAG=24.04
FROM ubuntu:${UBUNTU_TAG}

ENV DEBIAN_FRONTEND=noninteractive \
    EMSDK=/opt/emsdk \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    python3 \
    build-essential \
    cmake \
    ninja-build \
    pkg-config \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

# Node.js 22 (same major as CI)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/* \
  && node -v && npm -v

RUN git clone --depth 1 https://github.com/emscripten-core/emsdk.git /opt/emsdk

WORKDIR /opt/emsdk

# Default: tot (~ LLD 23) — same workaround class as Cory EC2 for stable final link.
ARG EMSDK_FLAVOR=tot
RUN ./emsdk install "${EMSDK_FLAVOR}" \
  && ./emsdk activate "${EMSDK_FLAVOR}"

ENV PATH="/opt/emsdk:/opt/emsdk/upstream/emscripten:${PATH}"

COPY docker/entrypoint.sh /usr/local/bin/v9-toolchain-entrypoint.sh
RUN chmod +x /usr/local/bin/v9-toolchain-entrypoint.sh

WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/v9-toolchain-entrypoint.sh"]
CMD ["bash", "-lc", "make fetch && make configure && make build"]
