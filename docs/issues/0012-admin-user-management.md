# 0012 · Admin user management (end-to-end)

**Milestone:** C — Auth + Admin console · **Type:** AFK

## What to build

The full user-management surface, owned end-to-end by this slice: a role-gated `/admin` console page backed by its own JSON API (`api/admin.ts`), both reachable only to a User whose `role` is `admin`. Capabilities:

- **Create User** — admin enters an email; the server generates a password and returns it **once** (shown in a copy box, never stored in plaintext, never shown again).
- **List Users** — email, role, and each User's API-key count.
- **API keys** — mint a key for a User (shown exactly once, copy-to-clipboard) and revoke an individual key (a User may hold many; see [ADR 0003](../adr/0003-better-auth-now-apikey-not-oauth.md)).
- **Ban User** — kills the User's login and keys but keeps the row, so their past Posts stay attributed (a confirm dialog guards it).

End-to-end demoable: an admin creates a User, copies a one-time key, an agent authenticates with that key and posts; revoking or banning then stops it. Runs concurrently with 0013 (disjoint files).

## Acceptance criteria

- [x] `/admin` and its API are reachable only to `role === 'admin'`; everyone else is refused
- [x] Creating a User from an email returns a server-generated password shown exactly once
- [x] The page lists Users with their role and key counts
- [x] Minting a key shows the raw key exactly once (copy-to-clipboard); revoking a key stops it authenticating; the count updates
- [x] An agent can authenticate with a freshly minted key and complete a `post`
- [x] Banning a User stops its login and keys from authenticating while its authored Posts remain attributed

## Blocked by

- [0011](./0011-console-shell-login.md)
