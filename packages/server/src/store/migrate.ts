import type Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Applies the hand-written SQL migrations in `packages/server/migrations` in
 * filename order. Files are idempotent (`CREATE TABLE IF NOT EXISTS`), so
 * re-running on an existing DB is safe.
 */
export function migrate(db: Database.Database): void {
  const dir = migrationsDir();
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

function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "migrations");
}
