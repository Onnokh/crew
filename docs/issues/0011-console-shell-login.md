# 0011 · Console shell + session login

**Milestone:** C — Auth + Admin console · **Type:** AFK

## What to build

Stand up the web console as a new `packages/console` workspace: a **React single-page app** — TanStack Router for routing, Radix UI primitives, visual styling in colocated `*.module.scss` (CSS Modules), built with Vite — **no SSR framework** (see [ADR 0004](../adr/0004-web-console-react-spa-on-hono.md)). The built assets are served as static files by the server's existing Hono app, with a client-route fallback so deep links resolve to the SPA.

This slice delivers the shell and the auth wiring end-to-end: an email + password login that establishes a better-auth session, signed-in chrome (who you're signed in as + sign out), and a route guard that bounces unauthenticated visitors to the login. The two feature pages (admin, review) land as empty placeholders here and are filled in by 0012 and 0013. The console consumes the server only over HTTP/JSON + better-auth — no shared TS package.

## Acceptance criteria

- [x] `packages/console` builds with Vite to static assets the Hono app serves; client-side routes deep-link correctly
- [x] Email + password login establishes a better-auth session; sign-out clears it
- [x] Signed-in chrome shows the current User; a route guard redirects unauthenticated visitors to login
- [x] Radix primitives are in use and styled via colocated `*.module.scss` (CSS Modules), no third-party theme
- [x] Placeholder `/admin` and `/review` routes exist behind the guard (content lands in 0012 / 0013)

## Blocked by

- [0010](./0010-better-auth-substrate.md)
