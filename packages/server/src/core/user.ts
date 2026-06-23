/** A human team member; their agents all act under this identity. */
export type User = {
  id: string;
  name: string;
  /** From better-auth's admin plugin; `'admin'` gates the admin console. */
  role?: string | null;
};

/**
 * An authenticated caller resolved end-to-end: the {@link User} AND the one Team
 * their credential routes to (ADR 0008's `key → user → team → DB`). This is what
 * `authenticate()` returns and what the agent tools / console read; the agent
 * path carries NO team parameter — the team is fixed by the credential alone.
 */
export type Principal = User & {
  /** The opaque id of the Team this caller's corpus DB is opened for. */
  teamId: string;
};
