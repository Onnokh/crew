import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { migrate } from "./migrate.js";

/**
 * Opens the SQLite database, loads the sqlite-vec extension, applies migrations,
 * and returns the raw handle alongside a Drizzle wrapper. The raw `Database`
 * handle is kept because the FTS5/vec0 virtual tables are queried with raw `sql`
 * (Drizzle does not model them); CRUD goes through the Drizzle wrapper.
 *
 * sqlite-vec must be loaded BEFORE migrations so the `0003_vec.sql`
 * `CREATE VIRTUAL TABLE ... USING vec0` succeeds, and on every open so the vec0
 * table stays queryable. WAL mode for concurrent reads.
 */
export function openDatabase(path: string): {
  raw: Database.Database;
  db: BetterSQLite3Database;
} {
  const raw = new Database(path);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  sqliteVec.load(raw);
  migrate(raw);
  return { raw, db: drizzle(raw) };
}
