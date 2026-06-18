/** A human team member; their agents all act under this identity. */
export type User = {
  id: string;
  name: string;
  /** From better-auth's admin plugin; `'admin'` gates the admin console. */
  role?: string | null;
};
