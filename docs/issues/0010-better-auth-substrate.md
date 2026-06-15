# 0010 · better-auth substrate + schema recreate

**Milestone:** C — Auth + Admin console · **Type:** AFK

## What to build

Swap the week-one static-token auth for **better-auth** behind the unchanged `authenticate(request) → User | null` seam (see [ADR 0003](../adr/0003-better-auth-now-apikey-not-oauth.md)). Two caller shapes, one seam:

- **Agents** present `Authorization: Bearer <api-key>`; the seam verifies it via better-auth's `apiKey` plugin and resolves the owning User.
- **Humans (admins)** authenticate with an email + password session via the `admin` plugin, which supplies the `role` field.

better-auth's tables (`user`/`session`/`account`/`verification`/`apikey`) become canonical; `posts.created_by` and `post_events.created_by` FK into `user(id)`. We are in dev state, so there is **no data migration** — drop and recreate the schema. The first Admin is seeded at boot (via env / `adminUserIds`); the old `SOA_TOKENS` env seeding is removed. The old server-rendered `/review` HTML and its token-paste cookie login are **retired here** (incompatible with sessions — slice 0013 rebuilds review in the console). better-auth's routes mount on the same Hono app FastMCP exposes; **FastMCP stays in normal mode** and keeps its `authenticate` hook, so tool attribution via `context.session` is unchanged.

## Acceptance criteria

- [x] An agent with a minted API key (Bearer header) walks the full loop: post → query finds it → confirm → ranks higher → flag → sinks
- [x] The `authenticate()` seam resolves both an agent API key and a human session to a `User`; an invalid/missing credential yields 401
- [x] Schema is recreated with better-auth as the canonical `user` store; `posts`/`post_events` FK into `user(id)`; FTS5/vec0 + triggers still build
- [x] A first Admin (`role === 'admin'`) is seeded at boot from env; `SOA_TOKENS` seeding is gone
- [x] better-auth's session/auth routes respond on the Hono app without colliding with `/mcp` (route precedence verified)
- [x] The old server-rendered `/review` page and token-paste login are removed; the integration test is updated to the new auth and passes

## Blocked by

- None — can start immediately
