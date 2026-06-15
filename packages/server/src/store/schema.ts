import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Drizzle TABLE definitions — NOT the tools' zod input schemas (a different
 * concern; see TECH.md "Two unrelated schemas"). drizzle-kit reads this file to
 * generate migrations, so it must stay inside `packages/server` and never move
 * to a shared package. It defines `posts` and `post_events`; the hand-written
 * FTS5/vec0 virtual tables live in `migrations/` (drizzle-kit does not model
 * virtual tables).
 *
 * The identity store is deliberately ABSENT here: better-auth owns the `user`
 * table (and session/account/verification/apikey), created by the hand-written
 * `migrations/0000_better_auth.sql` — keeping its tables out of this file means
 * drizzle-kit never tries to manage them (see ADR 0003 and TECH.md data model).
 * `created_by` is therefore a plain text column here; the foreign key into
 * `user(id)` is declared in the SQL migration, not via Drizzle `.references()`
 * (which only feeds migration generation we don't use for that FK).
 *
 * The store knows SQL only — it imports no ranking, search, or trust code.
 */

/** One stored item of shared agent knowledge. */
export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  situation: text("situation").notNull(),
  body: text("body").notNull(),
  /** Freeform LLM-written environment summary. */
  environment: text("environment").notNull(),
  /** Auto-captured git repo the Post originated from. */
  repo: text("repo").notNull(),
  /** active | retired. */
  status: text("status").notNull().default("active"),
  /** Owning User's id (FK to better-auth's `user(id)`, enforced in SQL). */
  createdBy: text("created_by").notNull(),
  /** Creation timestamp, unix ms. */
  createdAt: integer("created_at").notNull(),
  /**
   * Denormalized timestamp of the most recent Confirm (unix ms); null until a
   * Post is confirmed. Source of truth is `post_events` (a later slice).
   */
  lastConfirmed: integer("last_confirmed"),
  /**
   * How many times `query` has surfaced this Post — a display-only popularity
   * counter, NOT a trust signal. Incremented on each surfacing (see
   * migrations/0005); never feeds ranking.
   */
  views: integer("views").notNull().default(0),
});

/** One Confirm or Flag recorded against a Post — the trust signal source. */
export const postEvents = sqliteTable("post_events", {
  id: text("id").primaryKey(),
  postId: text("post_id")
    .notNull()
    .references(() => posts.id),
  /** confirm | flag. */
  verdict: text("verdict").notNull(),
  /** Flags only: incorrect | stale | duplicate. Null on confirms. */
  reason: text("reason"),
  /** Optional one-line Note anchored to the verdict. */
  note: text("note"),
  /** Acting User's id (FK to better-auth's `user(id)`, enforced in SQL). */
  createdBy: text("created_by").notNull(),
  /** When the event was recorded, unix ms. */
  createdAt: integer("created_at").notNull(),
});

export type PostRow = typeof posts.$inferSelect;
export type PostEventRow = typeof postEvents.$inferSelect;
