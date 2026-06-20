-- 0004 · post_events — the Confirm/Flag event log (the trust signal source).
-- Hand-written SQL kept in lockstep with src/store/schema.ts. Confirms and flags
-- are stored as events, never bare counters, so richer trust math can be
-- recomputed later from the log (see TECH.md "Trust mechanics"). The posts table
-- keeps a denormalized `last_confirmed` purely so ranking avoids a per-query
-- aggregate; this table is its source of truth.
--
-- `verdict` is 'confirm' | 'flag'. `reason` is set on flags only
-- ('incorrect' | 'stale' | 'duplicate') and null on confirms. `note` is an
-- optional one-line comment anchored to the verdict.

-- `created_by` is a plain user id resolved against the control plane at read
-- time; the former `REFERENCES "user"(id)` FK is DROPPED — per-team corpus DBs
-- carry no `user` table (ADR 0007/0008). The FK to posts(id) stays (same DB).
CREATE TABLE IF NOT EXISTS post_events (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts(id),
  verdict    TEXT NOT NULL,
  reason     TEXT,
  note       TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Trust aggregation and the recent-Notes render both read events for one Post in
-- recency order, so index by post then time.
CREATE INDEX IF NOT EXISTS post_events_post_id_created_at
  ON post_events (post_id, created_at DESC);
