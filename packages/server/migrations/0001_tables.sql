-- 0001 · core CRUD tables (users, posts).
-- Hand-written SQL kept in lockstep with src/store/schema.ts (the Drizzle table
-- defs). Later slices add post_events plus the FTS5/vec0 virtual tables and the
-- sync triggers, which drizzle-kit cannot model — so all migrations live here as
-- plain SQL applied in filename order by src/store/migrate.ts.

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS posts (
  id             TEXT PRIMARY KEY,
  situation      TEXT NOT NULL,
  body           TEXT NOT NULL,
  environment    TEXT NOT NULL,
  repo           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  created_by     TEXT NOT NULL REFERENCES users(id),
  created_at     INTEGER NOT NULL,
  last_confirmed INTEGER
);
