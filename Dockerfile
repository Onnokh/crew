# Crew — single-container image (issue 0009).
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

# ── Shared base: pin Node ────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS base
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
# image to ~1.2 GB. Must precede `npm ci` (its postinstall reads this).
ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip

# Install with the lockfile first, using only the manifests, so this layer caches
# across source-only changes. `npm ci` validates the lockfile against EVERY
# workspace manifest, so both must be present even though only the server builds
# here.
COPY package-lock.json package.json tsconfig.base.json ./
COPY packages/server/package.json packages/server/
COPY packages/console/package.json packages/console/
RUN npm ci

# Now the source.
COPY packages/server/ packages/server/

# Bake the embedding model into the image. Must match the runtime cache dir below.
ENV CREW_MODEL_CACHE_DIR=/app/models
RUN cd packages/server && npm run bake-model

# ── Console builder: Vite-build the web SPA (pure JS, NO native toolchain) ───────
# The frontend build needs no C/C++ toolchain (no better-sqlite3 / onnxruntime
# here), so this stage stays off `builder` and skips apt entirely — keeping it
# light and parallelisable. Its node_modules + source never reach the runner;
# only the resulting `dist/` is copied across below.
FROM base AS console-builder

# `npm ci` validates the lockfile against EVERY workspace manifest, so all
# package.json files must be present even though we only build the console. The
# workspace has two members (server + console); claude-plugin is not an npm
# package. Copy manifests first so this layer caches across source edits,
# mirroring the server builder's structure.
COPY package-lock.json package.json tsconfig.base.json ./
COPY packages/server/package.json packages/server/
COPY packages/console/package.json packages/console/
RUN npm ci

# Now the console source + the shared base tsconfig it extends. `vite build` runs
# the TanStack Router plugin, which generates src/routeTree.gen.ts fresh, then
# emits the static bundle to packages/console/dist.
COPY packages/console/ packages/console/
RUN npm run build -w @crew/console

# ── Runner: slim, toolchain-free, non-root ──────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    CREW_MODEL_CACHE_DIR=/app/models \
    CREW_DB_PATH=/data/crew.db \
    PORT=8080 \
    # FastMCP binds `localhost` by default — unreachable through Docker's port
    # forward. Bind all interfaces so published 8080 is reachable from the host.
    FASTMCP_HOST=0.0.0.0

# Carry over the compiled deps, source, and baked model from the builder.
COPY --from=builder /app /app

# Bundle the built console SPA. The server's CWD is /app/packages/server, and
# mountConsole's default dist path is resolve(cwd, "../console/dist") =>
# /app/packages/console/dist — so dropping the Vite output exactly there lets the
# Hono app find and serve it with no CREW_CONSOLE_DIST override. The console
# builder never had the server's node_modules and the server builder never had
# the console, so this dist MUST come from console-builder via its own COPY.
COPY --from=console-builder /app/packages/console/dist /app/packages/console/dist

# Persisted SQLite lives on a volume mounted at /data; create it owned by the
# unprivileged `node` user that ships with the base image.
RUN mkdir -p /data && chown -R node:node /data /app/models
USER node
VOLUME ["/data"]
EXPOSE 8080

WORKDIR /app/packages/server
# Run the entry point with tsx as a loader (no compile step). NOT
# `node node_modules/.bin/tsx`: that .bin/tsx is a POSIX shell shim, which `node`
# would try to parse as JS. `--import tsx` resolves the tsx package itself and
# registers its ESM loader.
CMD ["node", "--import", "tsx", "src/main.ts"]
