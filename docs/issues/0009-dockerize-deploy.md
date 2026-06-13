# 0009 · Dockerize + deploy artifact

**Milestone:** B — Externals · **Type:** AFK

## What to build

Package the server as a single container with the embedding model baked in at build time (so first start needs no outbound network), a SQLite volume for persistence, and example configuration. Bring the full stack up and run the end-to-end loop with a real agent. Hosting target (internal vs Hetzner) is deliberately undecided and has no build impact.

## Acceptance criteria

- [ ] A Docker image builds with the embedding model included; the container starts with no outbound network needed for embeddings
- [ ] Data persists across container restarts via a mounted volume
- [ ] Example environment/config (`.env.example`, compose file) is provided
- [ ] A real agent connects to the running container and completes post → query → confirm

## Blocked by

- [0007](./0007-review-page.md)
