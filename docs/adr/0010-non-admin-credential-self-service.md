---
status: accepted — not yet implemented
---

# Non-admins sign into the web UI for credential self-service

ADR 0002/0003 and the original "User" glossary entry framed the web UI as the
**Admin**'s tool: non-admin Users existed only to own the **API keys** their
agents present, and never signed in. This ADR reverses that: any User may now
sign in and reach a **`/profile`** page to manage their own credentials —
change their own password and mint/revoke their own **API keys**.

The admin section stays admin-only. The Edit-user dialog is replaced by an
admin-only `/dashboard/users/$userId` page (same `/api/admin/*` actions); the
new self-service surface is separate.

## Considered options

- **Generalize `/api/admin/users/:id/*` to allow `:id === session.user.id`** —
  rejected. One id-in-path endpoint set with branching authz means every
  handler must get the self-check right; one slip is an IDOR.
- **New session-scoped `/api/me/*` surface (chosen)** — the user is derived from
  the session, no id in the URL, so a caller can only ever act on their own
  account. Key endpoints additionally verify `referenceId === session.user.id`.

## Consequences

- **Password self-change requires the current password** (better-auth
  `changePassword`), unlike the admin reset which sets/generates without a
  challenge. Self-service and operator-reset are deliberately different verbs.
- **Display `name` stays admin-controlled** — not self-editable — because a
  User's name renders as the author on Posts/Confirms across the team corpus.
  `/profile` shows email and team read-only.
