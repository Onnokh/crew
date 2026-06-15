/**
 * A User — a human team member whose agents all act under their identity. Posts,
 * Confirms, and Flags are attributed to a User, never to the individual agent or
 * the specific credential: an agent may present any of the User's API keys, and
 * a human admin may sign in with email + password, but both resolve to the same
 * User (see ADR 0003). This module imports nothing.
 *
 * `role` comes from better-auth's admin plugin; `'admin'` gates the admin
 * console. It is `null` for an ordinary User and absent only on doubles that
 * predate the field.
 */
export type User = {
  id: string;
  name: string;
  role?: string | null;
};
