-- 0001 · core CRUD table (posts).
-- Hand-written SQL kept in lockstep with src/store/schema.ts (the Drizzle table
-- defs). Later slices add post_events plus the FTS5/vec0 virtual tables and the
-- sync triggers, which drizzle-kit cannot model — so all migrations live here as
-- plain SQL applied in filename order by src/store/migrate.ts.
--
-- Tenancy split (ADR 0007/0008): this is a PER-TEAM corpus DB — one SQLite file
-- per Team, holding only posts/post_events/meta. There is NO `user` table here;
-- the control-plane DB is the source of truth for identity. `created_by` is a
-- plain user id (meaningful only within the owning Team's corpus), so the former
-- `REFERENCES "user"(id)` FK is DROPPED — the target table does not exist in this
-- database. We are in dev state, so there is no data migration — a database
-- created before this change must be recreated.

CREATE TABLE IF NOT EXISTS posts (
  id             TEXT PRIMARY KEY,
  situation      TEXT NOT NULL,
  body           TEXT NOT NULL,
  environment    TEXT NOT NULL,
  repo           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  created_by     TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  last_confirmed INTEGER
);
