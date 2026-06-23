-- 0006 · Add a short human title to Posts.
-- The Post model was situation (the question, the retrieval key) + body (the
-- answer); the title is a NEW, separate field: a short scannable label for the
-- review console and query results. Agents supply it on `post` going forward.
--
-- Added nullable because SQLite cannot ADD a NOT NULL column to a table with
-- existing rows without a default; the column is always written for new Posts,
-- and the read path coalesces NULL → situation so legacy rows still render. The
-- backfill below seeds existing rows' title from their situation so the column is
-- populated, not just coalesced at read time. Re-running is safe: the ALTER
-- throws "duplicate column name" on an already-migrated DB and migrate() skips
-- the file, and the UPDATE is guarded by IS NULL for any partially-applied run.
--
-- Not added to posts_fts: situation/body remain the retrieval keys (the FTS
-- triggers reference those columns explicitly, so this column is inert to them).

ALTER TABLE posts ADD COLUMN title text;

UPDATE posts SET title = situation WHERE title IS NULL OR title = '';
