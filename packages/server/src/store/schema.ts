import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Drizzle TABLE definitions for `posts` and `post_events`. drizzle-kit reads
 * this file to generate migrations, so it must stay inside `packages/server`.
 * The FTS5/vec0 virtual tables and better-auth's `user` table are deliberately
 * absent (kept in hand-written migrations so drizzle-kit doesn't manage them);
 * `created_by`'s FK into `user(id)` is declared in SQL, not via `.references()`.
 */

/** One stored item of shared agent knowledge. */
export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  /**
   * Short human title, distinct from the situation. Nullable only because it was
   * added to a table with existing rows; coalesced to `situation` for legacy rows.
   */
  title: text("title"),
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
   * Post is confirmed. Source of truth is `post_events`.
   */
  lastConfirmed: integer("last_confirmed"),
  /** Display-only popularity counter (times `query` surfaced this Post); never feeds ranking. */
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
