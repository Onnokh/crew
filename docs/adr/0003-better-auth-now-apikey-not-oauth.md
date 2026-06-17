---
status: accepted (amends ADR 0002)
---

# Adopt better-auth now, with the `apiKey` plugin for agents instead of an OAuth provider

ADR 0002 deferred better-auth to a "v1.1" swap and chose its **OAuth Provider** plugin as the agent authentication path. With the core loop now proven (slices 0001–0009 shipped and Dockerized), we are pulling better-auth forward to back a small admin/user-management surface — and we are **not** using the OAuth provider. Agents authenticate with a **better-auth API key** sent as `Authorization: Bearer <key>`; the `authenticate()` seam calls `verifyApiKey` and resolves the owning User. Humans (admins) authenticate with **email + password** sessions, and the **`admin` plugin** supplies the `role` field that gates the admin UI. This decision was driven by realizing the agent side never actually required OAuth: the fiddliest, multi-day part of ADR 0002's plan (dynamic client registration, consent, token refresh) was avoidable, and an API key over a Bearer header is a valid MCP auth mechanism in stateless HTTP mode.

## Considered options

- **OAuth Provider plugin for agents (ADR 0002's choice)** — rejected/deferred: it solves a problem we don't have. MCP clients *can* negotiate OAuth, but a static API key in the `Authorization` header authenticates an agent just as well for our single-node, stateless server, at a fraction of the integration cost.
- **better-auth `bearer` plugin** — still rejected (as in ADR 0002): it replays an existing *session* token, it is not a standalone-credential issuer. The `apiKey` plugin — a third option ADR 0002 never considered — is the one that issues verifiable, revocable agent credentials.
- **Hand-rolled interim admin UI on top of the existing sha256-token `users` table** — rejected: it would be throwaway work, and the loop is proven enough that the "too early for better-auth" rationale of ADR 0002 no longer holds.

## Consequences

- **One credential model, reconsidered.** With the `apiKey` plugin every key carries a `userId`, and trust (distinct-confirmer) is computed **per User**, not per key. So a User may now hold **many** API keys without breaking the trust model — reversing the one-key-per-user constraint we briefly adopted. The admin UI is "create/revoke keys for a User."
- **better-auth's `user` table is canonical.** It replaces the minimal hand-rolled `users` table; `posts.created_by` / `post_events.created_by` FK into it. We are in dev state, so there is **no data migration** — the existing tables are dropped and recreated with the better-auth-managed schema (`user`, `session`, `account`, `verification`, `apikey`) plus our `posts` / `post_events`. The first real act after the swap is re-minting the handful of existing tokens through the new key UI.
- **Two auth surfaces behind one seam.** Agents → API key (Bearer); humans → email+password session. Both still resolve through the single `authenticate(request) → User | null` interface, so the MCP tools and the `/review` page are untouched by the change.
- **`CREW_TOKENS` env seeding goes away** in favor of seeding a first admin (via `CREW_ADMIN_EMAIL`/`CREW_ADMIN_PASSWORD` env) who then provisions everyone else through the UI — finally closing the "admin DMs you a token" provisioning gap ADR 0002 named.

## Notes from implementation (slice 0010)

Four facts that the design above assumed but which the pinned better-auth (1.6.x) made concrete differently — recorded so they aren't rediscovered the hard way:

- **The api-key plugin is a separate package.** In better-auth 1.6.x the `apiKey` plugin was extracted out of core — `better-auth/plugins` no longer exports it. It now lives in the version-locked **`@better-auth/api-key`** package (`import { apiKey } from "@better-auth/api-key"`), kept in lockstep with the `better-auth` version. The `admin` plugin is still in core (`better-auth/plugins`).
- **Keys link to their owner via `referenceId`, not `userId`.** A key row carries `referenceId`; we set it to the owning User's id at mint time (`createApiKey({ body: { userId } })` populates it), and `verifyApiKey` resolves it back. The seam reads name/role from the `user` table by that id.
- **Per-key rate limiting is disabled.** The api-key plugin defaults to a low request budget over a 24h window, but every MCP request re-verifies the key, so a normal agent loop would exhaust it in seconds. We pass `apiKey({ rateLimit: { enabled: false } })` — throttling trusted single-node agents is not our concern (trust counts Users, not request volume).
- **The auth tables are hand-written SQL, captured from better-auth's generator.** Rather than add a second, CLI-driven migration path at boot, the `user`/`session`/`account`/`verification`/`apikey` DDL was captured verbatim from better-auth's own migration generator at the pinned version and committed as `migrations/0000_better_auth.sql` (with `IF NOT EXISTS` guards) — so it runs through the same `migrate.ts` as everything else and is exactly what better-auth's Kysely adapter reads and writes. Regenerate it on a better-auth bump.
