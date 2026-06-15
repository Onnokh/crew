-- 0001 · core CRUD table (posts).
-- Hand-written SQL kept in lockstep with src/store/schema.ts (the Drizzle table
-- defs). Later slices add post_events plus the FTS5/vec0 virtual tables and the
-- sync triggers, which drizzle-kit cannot model — so all migrations live here as
-- plain SQL applied in filename order by src/store/migrate.ts.
--
-- The identity store is no longer ours: `created_by` references better-auth's
-- canonical `user` table (created in 0000), which replaced the week-one `users`
-- table and its token hashes (see ADR 0003). We are in dev state, so there is no
-- data migration — a database created before this change must be recreated.

CREATE TABLE IF NOT EXISTS posts (
  id             TEXT PRIMARY KEY,
  situation      TEXT NOT NULL,
  body           TEXT NOT NULL,
  environment    TEXT NOT NULL,
  repo           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'active',
  created_by     TEXT NOT NULL REFERENCES "user"(id),
  created_at     INTEGER NOT NULL,
  last_confirmed INTEGER
);
