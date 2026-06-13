/**
 * A User — a human team member whose bearer token all their agents act under.
 * Posts, Confirms, and Flags are attributed to a User. Identity is the human,
 * never the individual agent. This module imports nothing.
 */
export type User = {
  id: string;
  name: string;
};
