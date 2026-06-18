import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { migrate } from "./migrate.js";

/**
 * Opens the SQLite database, loads sqlite-vec, applies migrations, and returns
 * the raw handle (for FTS5/vec0 virtual-table queries) plus a Drizzle wrapper.
 * sqlite-vec must load BEFORE migrations and on every open so the vec0 table
 * stays queryable.
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
