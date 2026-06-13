-- 0005 · post view counter (display-only popularity signal).
-- Hand-written SQL kept in lockstep with src/store/schema.ts. Unlike Confirms and
-- Flags, a view is NOT a trust signal and is NOT stored as an event: it is recorded
-- automatically every time `query` surfaces a Post, so it is high-volume and has
-- nothing richer to recompute later. A denormalized counter on the Post (like
-- `last_confirmed`) is the right fit — it keeps the per-query trust read path from
-- having to scan a flood of view rows. Views never feed ranking; they only show in
-- the provenance tally.
--
-- SQLite has no `ADD COLUMN IF NOT EXISTS`; migrate.ts re-runs every file on every
-- boot and treats the "duplicate column name" this would throw on an already-applied
-- DB as an idempotent no-op (mirroring the CREATE ... IF NOT EXISTS guards elsewhere).

ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
