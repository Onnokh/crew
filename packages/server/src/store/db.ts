import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { migrate, type MigrationSet } from "./migrate.js";

/**
 * Opens a SQLite database, loads sqlite-vec, applies the given migration set,
 * and returns the raw handle (for FTS5/vec0 virtual-table queries) plus a
 * Drizzle wrapper. sqlite-vec must load BEFORE migrations and on every open so
 * the vec0 table stays queryable.
 *
 * The `set` selects which schema the file gets: `"control-plane"` for the
 * identity/tenancy DB, `"team"` for a per-team corpus DB (ADR 0007/0008).
 */
export function openDatabase(
  path: string,
  set: MigrationSet,
): {
  raw: Database.Database;
  db: BetterSQLite3Database;
} {
  const raw = new Database(path);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  sqliteVec.load(raw);
  migrate(raw, set);
  return { raw, db: drizzle(raw) };
}
