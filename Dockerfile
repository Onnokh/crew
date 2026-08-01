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
# No platform pin: the embedder (Transformers.js on onnxruntime-node) tokenizes
# in pure JS and ort-node ships linux/arm64 prebuilts, so the image builds and
# runs natively on both amd64 and arm64 hosts.
FROM node:24-bookworm-slim AS base
WORKDIR /app

# ── Builder: install deps (native builds), copy source, bake the model ──────────
FROM base AS builder
# Toolchain for better-sqlite3's node-gyp build (python3 + g++/make).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

# Skip onnxruntime-node's CUDA/GPU binary download (~hundreds of MB) — the
# embedder only ever runs the CPU execution provider, and the CPU runtime ships
# in the base package. Without this the postinstall pulls the GPU build, bloating
# the image to ~1.2 GB. Must precede `npm ci` (its postinstall reads this).
ENV ONNXRUNTIME_NODE_INSTALL_CUDA=skip

# Install with the lockfile first, using only the manifests, so this layer caches
# across source-only changes. `npm ci` validates the lockfile against EVERY
# workspace manifest, so all workspace manifests must be present even though
# only the server builds here.
COPY package-lock.json package.json tsconfig.base.json ./
COPY packages/server/package.json packages/server/
COPY packages/console/package.json packages/console/
COPY packages/marketing/package.json packages/marketing/
RUN npm ci

# Now the source.
COPY packages/server/ packages/server/

# Bake the embedding model into the image. Must match the runtime cache dir below.
ENV CREW_MODEL_CACHE_DIR=/app/models
RUN cd packages/server && npm run bake-model

# ── Frontend builder: Vite-build the marketing site and console ───────────────
# The frontend builds need no C/C++ toolchain (no better-sqlite3 / onnxruntime
# here), so this stage stays off `builder` and skips apt entirely. Its
# node_modules + source never reach the runner; only the resulting `dist/`
# directories are copied across below.
FROM base AS frontend-builder

# Rybbit's public site ID and script URL are intentionally build-time values;
# no Rybbit API key is sent to the browser.
ARG VITE_RYBBIT_SITE_ID
ARG VITE_RYBBIT_SCRIPT_SRC=https://rybbit.missingmounts.com/api/script.js
ENV VITE_RYBBIT_SITE_ID=$VITE_RYBBIT_SITE_ID \
    VITE_RYBBIT_SCRIPT_SRC=$VITE_RYBBIT_SCRIPT_SRC

# `npm ci` validates the lockfile against EVERY workspace manifest, so all
# package.json files must be present for every npm workspace. Copy manifests
# first so this layer caches across source edits, mirroring the server builder's
# structure.
COPY package-lock.json package.json tsconfig.base.json ./
COPY packages/server/package.json packages/server/
COPY packages/console/package.json packages/console/
COPY packages/marketing/package.json packages/marketing/
RUN npm ci

# The marketing build imports a shared avatar component from the console
# package, so both frontend sources are present in this stage.
COPY packages/console/ packages/console/
COPY packages/marketing/ packages/marketing/
RUN npm run build -w @crew/console \
  && npm run build -w @crew/marketing

# ── Runner: slim, toolchain-free, non-root ──────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production \
    CREW_MODEL_CACHE_DIR=/app/models \
    # Persisted state lives on the /data volume (writable by the `node` user).
    # The tenancy split (ADR 0007/0008) uses a control-plane DB file plus a
    # per-team corpus directory; both default to CWD-relative paths, which the
    # non-root user can't create under the root-owned /app — so pin them to /data.
    CREW_CONTROL_PLANE_DB_PATH=/data/crew-control-plane.db \
    CREW_TEAMS_DIR=/data/teams \
    PORT=8080 \
    # FastMCP binds `localhost` by default — unreachable through Docker's port
    # forward. Bind all interfaces so published 8080 is reachable from the host.
    FASTMCP_HOST=0.0.0.0

# Carry over the compiled deps, source, and baked model from the builder.
COPY --from=builder /app /app

# Bundle the built frontend SPAs. The server's CWD is /app/packages/server, and
# the static mounts resolve their sibling package dist directories from there.
COPY --from=frontend-builder /app/packages/console/dist /app/packages/console/dist
COPY --from=frontend-builder /app/packages/marketing/dist /app/packages/marketing/dist

# Persisted SQLite lives on a volume mounted at /data; create it owned by the
# unprivileged `node` user that ships with the base image.
RUN mkdir -p /data && chown -R node:node /data /app/models
USER node
VOLUME ["/data"]
EXPOSE 8080

# Liveness probe baked into the image so it applies under any Coolify build pack
# (the UI health-check fields only take effect for the Dockerfile build pack).
# Uses Node's global fetch — the slim base ships no curl/wget. start-period
# covers cold-boot model load before the HTTP listener opens.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/packages/server
# Run the entry point with tsx as a loader (no compile step). NOT
# `node node_modules/.bin/tsx`: that .bin/tsx is a POSIX shell shim, which `node`
# would try to parse as JS. `--import tsx` resolves the tsx package itself and
# registers its ESM loader.
CMD ["node", "--import", "tsx", "src/main.ts"]
