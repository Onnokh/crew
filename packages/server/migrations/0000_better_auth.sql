-- 0000 · better-auth tables (user / session / account / verification / apikey).
--
-- These tables are OWNED BY better-auth (see ADR 0003): `user` is the canonical
-- identity store and the foreign-key target for posts.created_by /
-- post_events.created_by. We do NOT hand-author this schema from memory — the DDL
-- below was captured VERBATIM from better-auth's own migration generator at the
-- pinned versions (better-auth + @better-auth/api-key, both 1.6.x) with the
-- `admin` and `apiKey` plugins enabled, then given `IF NOT EXISTS` guards so
-- migrate.ts can re-run it idempotently like every other file here. Capturing the
-- generator output keeps us on one hand-written-SQL migration path (no second,
-- CLI-driven migration step at boot) while guaranteeing the columns and types are
-- exactly what better-auth reads and writes through its Kysely adapter.
--
-- To regenerate after a better-auth bump: construct the auth instance and call
-- better-auth's `getMigrations(auth.options).runMigrations()` against a scratch
-- SQLite db, then dump `sqlite_master` and re-add the IF NOT EXISTS guards.
--
-- This file sorts first so `user` exists before the FK-bearing tables in 0001.
-- An api key links to its owner via `referenceId` (we set it to the User's id);
-- `role`/`banned` on `user` come from the admin plugin.

CREATE TABLE IF NOT EXISTS "user" (
  "id"            text not null primary key,
  "name"          text not null,
  "email"         text not null unique,
  "emailVerified" integer not null,
  "image"         text,
  "createdAt"     date not null,
  "updatedAt"     date not null,
  "role"          text,
  "banned"        integer,
  "banReason"     text,
  "banExpires"    date
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"             text not null primary key,
  "expiresAt"      date not null,
  "token"          text not null unique,
  "createdAt"      date not null,
  "updatedAt"      date not null,
  "ipAddress"      text,
  "userAgent"      text,
  "userId"         text not null references "user" ("id") on delete cascade,
  "impersonatedBy" text
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                      text not null primary key,
  "accountId"               text not null,
  "providerId"              text not null,
  "userId"                  text not null references "user" ("id") on delete cascade,
  "accessToken"             text,
  "refreshToken"            text,
  "idToken"                 text,
  "accessTokenExpiresAt"    date,
  "refreshTokenExpiresAt"   date,
  "scope"                   text,
  "password"                text,
  "createdAt"               date not null,
  "updatedAt"               date not null
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         text not null primary key,
  "identifier" text not null,
  "value"      text not null,
  "expiresAt"  date not null,
  "createdAt"  date not null,
  "updatedAt"  date not null
);

CREATE TABLE IF NOT EXISTS "apikey" (
  "id"                  text not null primary key,
  "configId"            text not null,
  "name"                text,
  "start"               text,
  "referenceId"         text not null,
  "prefix"              text,
  "key"                 text not null,
  "refillInterval"      integer,
  "refillAmount"        integer,
  "lastRefillAt"        date,
  "enabled"             integer,
  "rateLimitEnabled"    integer,
  "rateLimitTimeWindow" integer,
  "rateLimitMax"        integer,
  "requestCount"        integer,
  "remaining"           integer,
  "lastRequest"         date,
  "expiresAt"           date,
  "createdAt"           date not null,
  "updatedAt"           date not null,
  "permissions"         text,
  "metadata"            text
);

CREATE INDEX IF NOT EXISTS "account_userId_idx"          on "account" ("userId");
CREATE INDEX IF NOT EXISTS "apikey_configId_idx"         on "apikey" ("configId");
CREATE INDEX IF NOT EXISTS "apikey_key_idx"              on "apikey" ("key");
CREATE INDEX IF NOT EXISTS "apikey_referenceId_idx"      on "apikey" ("referenceId");
CREATE INDEX IF NOT EXISTS "session_userId_idx"          on "session" ("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" on "verification" ("identifier");
