import type Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Which set of hand-written migrations to apply. The store splits into two
 * physically separate databases (ADR 0007/0008): the `"control-plane"` DB holds
 * better-auth's identity tables plus org/team/membership; each `"team"` corpus
 * DB holds only posts/post_events/meta. Each set lives in its own subdirectory
 * of `packages/server/migrations`.
 */
export type MigrationSet = "control-plane" | "team";

/**
 * Applies the hand-written SQL migrations for the given {@link MigrationSet} in
 * filename order. Files are idempotent (`CREATE TABLE IF NOT EXISTS`), so
 * re-running on an existing DB is safe.
 */
export function migrate(db: Database.Database, set: MigrationSet): void {
  const dir = migrationsDir(set);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sqlText = readFileSync(join(dir, file), "utf8");
    try {
      db.exec(sqlText);
    } catch (err) {
      // SQLite has no `ADD COLUMN IF NOT EXISTS`; re-running an already-applied
      // column add throws "duplicate column name", which we skip. Any other
      // error is a real failure.
      if (
        !(err instanceof Error && /duplicate column name/i.test(err.message))
      ) {
        throw err;
      }
    }
  }
}

function migrationsDir(set: MigrationSet): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "migrations", set);
}
