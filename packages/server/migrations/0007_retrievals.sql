-- 0007 · retrievals — the retrieval telemetry log (one row per `query` call) and
-- its per-result score breakdown. Hand-written SQL kept in lockstep with
-- src/store/schema.ts. Every `query` records a Retrieval, including zero-result
-- ones (result_count = 0, no result rows), so query volume and zero-result rate
-- can be read straight from the log. Writes are additive: a telemetry failure
-- never fails the query (see tools/query.ts).
--
-- `repo` and `environment` mirror the query's optional inputs and are nullable.
-- `result_count` is how many Posts were returned (after the limit), the
-- denominator for "with-results" reads. The score breakdown that ranking throws
-- away (rrf_score · trust · recency · repo_boost = final) is captured per result
-- so a later tuning view can explain why a Post ranked where it did.

CREATE TABLE IF NOT EXISTS retrievals (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES "user"(id),
  repo         TEXT,
  situation    TEXT NOT NULL,
  environment  TEXT,
  "limit"      INTEGER NOT NULL,
  result_count INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS retrieval_results (
  id            TEXT PRIMARY KEY,
  retrieval_id  TEXT NOT NULL REFERENCES retrievals(id),
  post_id       TEXT NOT NULL,
  rank          INTEGER NOT NULL,
  rrf_score     REAL NOT NULL,
  trust         REAL NOT NULL,
  recency       REAL NOT NULL,
  repo_boost    REAL NOT NULL,
  final         REAL NOT NULL
);

-- Conversion attribution joins result rows to Confirm events by post_id, so
-- index by post. The recent-Retrievals list and per-user reads order by time.
CREATE INDEX IF NOT EXISTS retrieval_results_post_id
  ON retrieval_results (post_id);
CREATE INDEX IF NOT EXISTS retrievals_user_id_created_at
  ON retrievals (user_id, created_at DESC);
