---
status: accepted (amends ADR 0003) — not yet implemented
---

# Org / Team / Membership identity model and `key → user → team → DB` routing

ADR 0003 established one canonical better-auth `user` table, with agents authenticating by API key (Bearer) and trust computed per User. ADR 0007 introduced one SQLite database per team. This ADR defines the identity model that connects the two: how users, teams, and API keys relate, and how an incoming request deterministically selects which team database to open.

The model is intentionally the simplest that works:

- An **Org** owns many **Teams**; a **Team** owns many **Users**; a **User belongs to exactly one Team** (not many-to-many).
- An **API key belongs to a User** (ADR 0003), so the key already implies a single Team.
- Therefore the entire routing chain is **`API key → user → team → DB`** — the key the agent presents is the routing decision. No active-team context, no team switching, no per-request team parameter.

A human who genuinely works across two teams holds **two separate accounts**. This is an accepted cost of the 1:1 user-to-team rule, taken deliberately to keep the agent path free of any team-selection mechanism (agents have no UI to "switch teams", so any user-level-key + separate-team-context design would require inventing one).

## Considered options

- **User-level API keys with team chosen separately (active-team context)** — rejected. It is more flexible for humans but forces every agent call to carry an active-team context from somewhere, and agents have no way to set it. Fragile exactly where it matters most.
- **Many-to-many user/team membership** — rejected for now. It reintroduces "which team is this key acting as?" ambiguity and a switching mechanism, for a flexibility (one human on several teams) that two accounts already cover.
- **API key = user = exactly one team (chosen)** — the key is the unambiguous router; nothing else is needed on the hot path.

## Consequences

- **Two stores, two roles.** A shared **control-plane** store holds Org / Team / Membership alongside better-auth's `user`/`session`/`account`/`verification`/`apikey` tables (ADR 0003). The **per-team corpus DBs** (ADR 0007) hold only `posts`/`post_events`. `authenticate()` resolves the User *and* their Team from the control plane, then hands the matching team connection to the tools.
- **Trust is now per-User-per-Team.** Because each team's `posts`/`post_events` live in a separate file, the distinct-confirmer trust signal (ADR 0003) is naturally scoped to a team's own corpus. A User's reputation is reputation *within their team's knowledge* — which is the correct semantics, not a limitation.
- **`posts.created_by` / `post_events.created_by` still FK to a user id**, but that id is only meaningful within the owning team's DB; the control plane is the source of truth for which users exist and which team they belong to.
- **Org-admin is an ordinary member carrying the global `admin` role** (resolved). Creating Teams and provisioning Users is gated by the `admin` plugin role from ADR 0003 — there is no separate teamless Org-level principal. The first admin, seeded at boot, is made a member of an auto-created default Team *and* given `role = admin`; org-wide authority is layered on top of an ordinary single-Team Membership rather than replacing it. This keeps `authenticate()` one shape — every credential, admin or not, resolves to exactly one Team — and avoids a principal whose API keys would route nowhere. Cross-Team browsing for an admin (reaching another Team's corpus from the console) is deliberately deferred; it would reintroduce the team-selection mechanism this ADR rejects on the agent path.
- **Key minting is team-scoped by construction.** "Create/revoke keys for a User" (ADR 0003) now means keys for a User who is, by definition, on exactly one Team — so every key a team's admin mints routes to that team's DB.
