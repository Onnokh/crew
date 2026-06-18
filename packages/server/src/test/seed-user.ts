import type { Database } from "better-sqlite3";

// Insert a minimal valid row into better-auth's `user` table, for store tests
// that need a real identity for the `posts.created_by` FK without spinning up
// better-auth. Required columns get stand-in values.
export function seedUser(
  raw: Database,
  id: string,
  name: string,
  role: string | null = null,
): void {
  raw
    .prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, role, createdAt, updatedAt)
       VALUES (?, ?, ?, 0, ?, 0, 0)`,
    )
    .run(id, name, `${id}@test.local`, role);
}
