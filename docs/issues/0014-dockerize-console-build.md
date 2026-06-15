# 0014 · Dockerize multi-stage console build

**Milestone:** C — Auth + Admin console · **Type:** AFK

## What to build

Extend the single-container deploy (slice 0009) to include the web console. A multi-stage build Vite-builds `packages/console`, then copies its `dist` into the server image; the Hono app serves those assets (as wired in 0011). The result is still one container, one process, one external port (see [ADR 0004](../adr/0004-web-console-react-spa-on-hono.md)) — FastMCP in normal mode owns the port, serving `/mcp`, better-auth routes, the JSON API, and the console. Update the compose file / example config as needed.

## Acceptance criteria

- [ ] The image builds via a multi-stage Dockerfile that produces the console `dist` and bundles it into the server image
- [ ] One running container serves the console (login, `/admin`, `/review`) and `/mcp` on a single port
- [ ] An agent completes the loop and an admin signs in and manages users against the same running container
- [ ] Data still persists across restarts via the mounted SQLite volume; no outbound network needed at first start

## Blocked by

- [0012](./0012-admin-user-management.md)
- [0013](./0013-review-console-page.md)
