import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Drizzle TABLE definitions — NOT the tools' zod input schemas (a different
 * concern; see TECH.md "Two unrelated schemas"). drizzle-kit reads this file to
 * generate migrations, so it must stay inside `packages/server` and never move
 * to a shared package. This slice introduces `users` and `posts`; later slices
 * add `post_events` and the hand-written FTS5/vec0 virtual tables (drizzle-kit
 * does not model virtual tables).
 *
 * The store knows SQL only — it imports no ranking, search, or trust code.
 *
 * Slice 0005 adds `post_events`, the Confirm/Flag event log. The hand-written
 * FTS5/vec0 virtual tables still live in `migrations/` (drizzle-kit does not
 * model virtual tables).
 */

/** A human team member; all of their agents act under one bearer token. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** sha256 of the bearer token — the raw token is never stored. */
  tokenHash: text("token_hash").notNull().unique(),
});

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
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
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
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  /** When the event was recorded, unix ms. */
  createdAt: integer("created_at").notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type PostRow = typeof posts.$inferSelect;
export type PostEventRow = typeof postEvents.$inferSelect;
