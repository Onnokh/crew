# Stack Overflow for Agents — single-container image (issue 0009).
#
# One product, one container: the MCP server with the bge-small-en-v1.5 embedding
# model BAKED IN at build time, so the first boot needs no outbound network. The
# server runs TypeScript directly via tsx (no compile step — see package scripts),
# so the runtime image carries node_modules + source rather than a dist/ bundle.
#
# Debian (bookworm), NOT alpine: better-sqlite3 compiles from source and
# onnxruntime-node (fastembed's runtime) ships glibc prebuilts — musl would break
# both. The builder stage carries the C/C++ toolchain; the slim runner copies the
# already-compiled node_modules so the final image stays toolchain-free.

# ── Shared base: pin Node + enable pnpm via corepack ────────────────────────────
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# ── Builder: install deps (native builds), copy source, bake the model ──────────
FROM base AS builder
# Toolchain for better-sqlite3's node-gyp build (python3 + g++/make).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

# Skip onnxruntime-node's CUDA/GPU binary download (~hundreds of MB) — fastembed
# only ever runs the CPU execution provider, and the CPU runtime ships in the
# base package. Without this the postinstall pulls the GPU build, bloating the
# image to ~1.2 GB. Must precede `pnpm install` (its postinstall reads this).
ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip

# Install with the lockfile first, using only the manifests, so this layer caches
# across source-only changes. onlyBuiltDependencies (root package.json) limits
# build scripts to better-sqlite3 / esbuild / onnxruntime-node.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile

# Now the source.
COPY packages/server/ packages/server/

# Bake the embedding model into the image. Must match the runtime cache dir below.
ENV SOA_MODEL_CACHE_DIR=/app/models
RUN cd packages/server && node scripts/fetch-model.mjs

# ── Runner: slim, toolchain-free, non-root ──────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    SOA_MODEL_CACHE_DIR=/app/models \
    SOA_DB_PATH=/data/soa.db \
    PORT=8080 \
    # FastMCP binds `localhost` by default — unreachable through Docker's port
    # forward. Bind all interfaces so published 8080 is reachable from the host.
    FASTMCP_HOST=0.0.0.0

# Carry over the compiled deps, source, and baked model from the builder.
COPY --from=builder /app /app

# Persisted SQLite lives on a volume mounted at /data; create it owned by the
# unprivileged `node` user that ships with the base image.
RUN mkdir -p /data && chown -R node:node /data /app/models
USER node
VOLUME ["/data"]
EXPOSE 8080

WORKDIR /app/packages/server
# Run the entry point with tsx as a loader (no compile step). NOT `node .bin/tsx`:
# pnpm's .bin/tsx is a POSIX shell shim, which `node` would try to parse as JS.
# `--import tsx` resolves the tsx package itself and registers its ESM loader.
CMD ["node", "--import", "tsx", "src/main.ts"]
