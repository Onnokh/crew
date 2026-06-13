import type Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Applies the hand-written SQL migrations in `packages/server/migrations` in
 * filename order. We hand-write SQL (not drizzle-kit's generated migrations)
 * because later slices add FTS5/vec0 virtual tables and triggers that drizzle-
 * kit cannot model (see TECH.md). Each file is run inside a transaction and is
 * idempotent (`CREATE TABLE IF NOT EXISTS`), so re-running on an existing DB is
 * safe at MVP. A `meta`-tracked migration ledger arrives if/when needed.
 */
export function migrate(db: Database.Database): void {
  const dir = migrationsDir();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sqlText = readFileSync(join(dir, file), "utf8");
    db.exec(sqlText);
  }
}

function migrationsDir(): string {
  // src/store/migrate.ts → packages/server/migrations
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "migrations");
}
