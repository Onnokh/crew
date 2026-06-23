-- 0002 · Team intake allowlist — an optional per-Team list of git hosts the
-- Team accepts Posts from (e.g. `git.indicia.nl`), so a shared corpus doesn't
-- fill up with one-off personal-project posts. Stored as a JSON array of host
-- strings. NULL / empty array means "accept everything" (the default), so this
-- column is additive and existing Teams keep accepting all Posts.
--
-- The `post` tool reads it per request and hard-rejects an off-list repo before
-- the Post is stored; see packages/server/src/guardrails/intake.ts.

ALTER TABLE team ADD COLUMN intake_domains TEXT;
