-- 0001 · Org / Team / Membership — the control-plane tenancy tables (ADR 0008).
-- These live ONLY in the control-plane DB, alongside better-auth's identity
-- tables (0000). They are the routing source of truth: an API key resolves to a
-- `user` (better-auth), the user's `team_membership` resolves to a `team`, and
-- the team's opaque id names its per-team corpus SQLite file (ADR 0007).
--
-- Model (intentionally minimal):
--   org             — top-level ownership boundary; one Org owns many Teams.
--   team            — the unit of knowledge isolation; opaque id, belongs to an Org.
--   team_membership — binds a User to exactly ONE Team (1:1 on user_id).
--
-- A User has exactly one Membership (PRIMARY KEY on user_id enforces 1:1). A
-- credential whose user has no membership resolves to no Team and is rejected.

CREATE TABLE IF NOT EXISTS org (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS team (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL REFERENCES org(id),
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- One row per User (user_id is the PK → a User belongs to exactly one Team).
-- user_id references better-auth's `user` table, which lives in this same DB.
CREATE TABLE IF NOT EXISTS team_membership (
  user_id    TEXT PRIMARY KEY REFERENCES "user"(id),
  team_id    TEXT NOT NULL REFERENCES team(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS team_org_id_idx ON team (org_id);
CREATE INDEX IF NOT EXISTS team_membership_team_id_idx ON team_membership (team_id);
