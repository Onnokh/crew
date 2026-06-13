-- 0002 · FTS5 keyword search over Posts (situation + body).
-- Hand-written SQL because drizzle-kit cannot model FTS5 virtual tables or the
-- triggers that keep them in sync (see TECH.md "Virtual-table migrations are
-- hand-written SQL"). This slice (0003) is keyword-only; the vec0 virtual table
-- and the post_events table arrive in later slices.
--
-- `content='posts'` makes posts_fts an *external-content* index: the FTS table
-- stores only the inverted index, not a copy of the text, and reads the columns
-- back from `posts` via the shared rowid. SQLite assigns posts an implicit
-- `rowid` (the `id` TEXT primary key is not an integer rowid), and the triggers
-- below mirror every posts mutation into the index keyed by that rowid.

CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
  situation,
  body,
  content='posts',
  content_rowid='rowid'
);

-- Keep posts_fts in sync with posts. External-content tables require the app (or
-- triggers) to maintain the index; deletes/updates use the special 'delete'
-- command rows that carry the prior column values so the index can be unwound.

CREATE TRIGGER IF NOT EXISTS posts_ai AFTER INSERT ON posts BEGIN
  INSERT INTO posts_fts(rowid, situation, body)
  VALUES (new.rowid, new.situation, new.body);
END;

CREATE TRIGGER IF NOT EXISTS posts_ad AFTER DELETE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, situation, body)
  VALUES ('delete', old.rowid, old.situation, old.body);
END;

CREATE TRIGGER IF NOT EXISTS posts_au AFTER UPDATE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, situation, body)
  VALUES ('delete', old.rowid, old.situation, old.body);
  INSERT INTO posts_fts(rowid, situation, body)
  VALUES (new.rowid, new.situation, new.body);
END;
