import type { Database } from "better-sqlite3";

/**
 * Insert a minimal valid row into better-auth's `user` table so a store/read
 * test has a real identity for `posts.created_by` to reference (the FK into
 * `user(id)` is enforced when `foreign_keys = ON`) and for `getUser` to resolve
 * into a display name.
 *
 * better-auth owns this table (see ADR 0003), so unit tests that don't exercise
 * the auth flow seed it directly rather than spinning up a better-auth instance:
 * the columns better-auth requires (`email` unique, `emailVerified`, the
 * timestamps) are filled with stand-in values, since these tests only ever read
 * back `id`/`name`/`role`. Tests that DO exercise authentication mint real users
 * and keys through better-auth in `harness.ts` instead.
 */
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
