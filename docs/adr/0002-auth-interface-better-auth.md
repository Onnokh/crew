# Auth behind an `authenticate()` interface; static tokens first, better-auth OAuth provider later

The server must authenticate two kinds of callers — MCP agents (which the MCP spec expects to authenticate via OAuth) and humans opening the `/review` page in a browser — and we want the interesting work (the core query/post/confirm/flag loop) to start before the fiddliest dependency is in place. We decided to put all authentication behind a single in-house interface, `authenticate(request) → User | null`, and implement it in two stages: static hashed bearer tokens in a `users` table for week one, then better-auth's **OAuth Provider plugin** (for agents) plus cookie sessions (for the `/review` page) as the v1.1 swap.

Why: the interface means the application depends only on `authenticate()`, never on better-auth directly, so the upgrade touches one module and leaves the MCP tools and `/review` code untouched. Static tokens get the core loop working in an hour; better-auth's OAuth provider — which the MCP spec and clients like Claude Code negotiate natively — removes manual token provisioning and gives real rotation/revocation once the loop is proven. FastMCP's `authenticate(request)` hook matches our interface shape exactly, and its underlying Hono app (via `getApp()`) is where better-auth's OAuth routes will mount.

## Considered options

- **better-auth from day one** — rejected for MVP: front-loads the fiddliest dependency (client registration, consent, token refresh, a new-ish plugin with rough edges) before the core value is proven.
- **The `bearer` plugin instead of the OAuth Provider plugin** — rejected: better-auth's bearer plugin only carries an existing session token as a header; it is not an OAuth issuer and does not drive the MCP authentication flow. The OAuth Provider plugin is what MCP clients negotiate against.
- **Static tokens forever** — rejected as the end state: provisioning ("admin DMs you a token") and the lack of rotation/revocation don't scale past a small pilot.

## Consequences

- Identity is the **User** (a human); all of a user's agents act under one token, which keeps distinct-confirmer trust logic correct.
- The OAuth provider mounts several routes (`/.well-known/oauth-authorization-server`, `/authorize`, `/token`, dynamic client registration) on FastMCP's `getApp()` Hono instance rather than a root app we own outright — a mild inversion of control to verify (route precedence, middleware order) when v1.1 lands. The `authenticate()` seam de-risks it: the plugin owns its routes while our hook only validates whatever token arrives.
