---
status: accepted
---

# Human surface is a React + Radix SPA served by Hono — no SSR framework, classic FastMCP kept

The hand-rolled server-rendered HTML pages (slice 0007's `/review`) don't carry the dynamic, stateful flows the admin section needs once better-auth lands (login, create-user, show-an-API-key-exactly-once, revoke, ban — see [ADR 0003](./0003-better-auth-now-apikey-not-oauth.md)). We replace them with a **React single-page app**: **TanStack Router** for routing, **Radix UI** primitives styled in our own codebase with **colocated `*.module.scss`** (CSS Modules), built with **Vite**. It is served as static assets by the **existing Hono app** FastMCP exposes via `getApp()`, alongside better-auth's routes and a small JSON API; **FastMCP stays in normal mode**, owning the one Node port as it does today. This **reverses TECH.md's "plain Hono HTML, no frontend framework"** stance for the human surface — agents are untouched.

## Considered options

- **TanStack Start (full-stack, SSR + server functions)** — rejected: it wants to own the HTTP server, which collides with normal-mode FastMCP (whose `/mcp` transport only exists after `start()` boots its own `http.Server`). Keeping both would force either two processes or an in-process loopback proxy. An internal admin console doesn't need SSR, so the cost isn't worth it.
- **Migrate the MCP server to `fastmcp/edge`** (a mountable `fetch` handler, single process *with* a TanStack Start server) — rejected: the edge build drops the `authenticate` hook and per-call session our tool attribution uses (recoverable via `AsyncLocalStorage`), and it's the less-trodden path in fastmcp 4.1.0. Not worth the maturity risk.
- **Two processes (FastMCP + a TanStack Start server) in one container** — rejected: process supervision, signal handling, and a two-target health story undercut the clean single-process container from slice 0009.
- **Keep server-rendered Hono HTML** — rejected: the show-once key reveal, copy-to-clipboard, inline create/revoke/ban without full-page reloads, and better-auth's client session are all painful as `<form>` round-trips.

## Consequences

- **Single process, single container preserved.** Hono serves the built SPA (`packages/console/dist`) plus better-auth routes and the admin/review JSON API; FastMCP still owns the port. The deploy change is additive: a Vite build stage whose output is copied into the server image (multi-stage Dockerfile).
- **New `packages/console`** (React/TanStack Router/Radix/SCSS-modules). It is a separate workspace package, **not** a `shared/` extraction: the console consumes the server only over **HTTP/JSON + better-auth**, so the wire is the type boundary (mirroring "MCP is the type boundary, resolved at runtime"). No TS is shared, so no `shared/` package — consistent with TECH.md's rule that `shared/` waits for a real cross-importing consumer.
- **`api/review.ts`'s server-rendered HTML is retired** in favour of JSON endpoints (list recent/flagged, retire/restore) the SPA calls; the agent-facing markdown envelope (`guardrails/render.ts`) is unrelated and stays.
- **Styling owns its tokens.** Radix gives unstyled, accessible primitives; visual design lives in our `*.module.scss` colocated beside each component — no third-party theme to fight or eject from later.
