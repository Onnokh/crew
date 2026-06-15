import type { Database } from "better-sqlite3";
import { desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { NewPostEvent, PostEvent } from "../core/post-event.js";
import type { NewPost, Post } from "../core/post.js";
import type { User } from "../core/user.js";
import type { Embedder } from "../embedding/embedder.js";
import type { Clock } from "../platform/clock.js";
import type { IdGen } from "../platform/id-gen.js";
import type { Candidate, PostEventRow, VecCandidate } from "./queries.js";
import {
  eventsForPosts,
  insertEmbeddings,
  keywordSearch,
  vectorSearch,
} from "./queries.js";
import type { PostRepository } from "./repository.js";
import { postEvents, posts } from "./schema.js";
import type { PostRow } from "./schema.js";

/**
 * Drizzle/SQLite-backed {@link PostRepository}. Knows SQL and the table shapes
 * only; it stamps a fresh id (via {@link IdGen}) and creation time (via
 * {@link Clock}) onto each new Post and persists it. Keyword search runs raw
 * FTS5 (via {@link keywordSearch}) and returns raw candidates; ranking lives in
 * `search`, never here.
 *
 * It holds both the Drizzle wrapper (CRUD) and the raw better-sqlite3 handle
 * (FTS5/vec0 virtual-table queries Drizzle cannot model) over the same
 * connection, plus the {@link Embedder} so write-time and query-time vectors
 * both come from the one pinned model.
 */
export class SqliteRepository implements PostRepository {
  constructor(
    private readonly db: BetterSQLite3Database,
    private readonly raw: Database,
    private readonly clock: Clock,
    private readonly idGen: IdGen,
    private readonly embedder: Embedder,
  ) {}

  async createPost(input: NewPost): Promise<Post> {
    const post: Post = {
      id: this.idGen.next("post"),
      situation: input.situation,
      body: input.body,
      environment: input.environment,
      repo: input.repo,
      status: "active",
      createdBy: input.createdBy,
      createdAt: this.clock.now(),
      lastConfirmed: null,
      views: 0,
    };

    // Embed BEFORE the transaction: embedding is async and can throw, and a
    // Post with no vector is invisible to half of retrieval — so if either
    // embed fails the whole write fails loudly and nothing is persisted
    // (see TECH.md "fail the write loudly"). The embedder cannot be injected
    // into a sync better-sqlite3 transaction, so we resolve both vectors first
    // then write the row and its vectors atomically.
    const [situationEmbedding, environmentEmbedding] = await Promise.all([
      this.embedder.embed(post.situation),
      this.embedder.embed(post.environment),
    ]);

    this.raw.transaction(() => {
      this.db.insert(posts).values(toRow(post)).run();
      insertEmbeddings(
        this.raw,
        post.id,
        situationEmbedding,
        environmentEmbedding,
      );
    })();

    return post;
  }

  async getPost(id: string): Promise<Post | null> {
    const row = this.db.select().from(posts).where(eq(posts.id, id)).get();
    return row ? fromRow(row) : null;
  }

  async searchByKeyword(query: string, limit: number): Promise<Candidate[]> {
    return keywordSearch(this.raw, query, limit);
  }

  async searchByVector(query: string, limit: number): Promise<VecCandidate[]> {
    const embedding = await this.embedder.embed(query);
    return vectorSearch(this.raw, embedding, limit);
  }

  async recordEvent(input: NewPostEvent): Promise<PostEvent> {
    const event: PostEvent = {
      id: this.idGen.next("evt"),
      postId: input.postId,
      verdict: input.verdict,
      reason: input.reason ?? null,
      note: input.note ?? null,
      createdBy: input.createdBy,
      createdAt: this.clock.now(),
    };

    this.raw.transaction(() => {
      // The Post must exist — an event has to anchor to a real Post. The FK
      // would also catch this, but checking gives a clear error and lets us
      // refresh last_confirmed conditionally in the same transaction.
      const exists = this.db
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.id, event.postId))
        .get();
      if (!exists) {
        throw new Error(`No such Post: ${event.postId}`);
      }

      this.db
        .insert(postEvents)
        .values({
          id: event.id,
          postId: event.postId,
          verdict: event.verdict,
          reason: event.reason,
          note: event.note,
          createdBy: event.createdBy,
          createdAt: event.createdAt,
        })
        .run();

      // A Confirm refreshes the denormalized last_confirmed so ranking recency
      // lifts the Post; the event log remains the source of truth.
      if (event.verdict === "confirm") {
        this.db
          .update(posts)
          .set({ lastConfirmed: event.createdAt })
          .where(eq(posts.id, event.postId))
          .run();
      }
    })();

    return event;
  }

  async getEventsForPosts(postIds: readonly string[]): Promise<PostEvent[]> {
    return eventsForPosts(this.raw, postIds).map(fromEventRow);
  }

  async recordViews(postIds: readonly string[]): Promise<void> {
    if (postIds.length === 0) return;
    // One batched UPDATE: bump the display-only counter for every surfaced Post.
    // No event row and no existence check — a missing id simply matches nothing,
    // and the count never feeds ranking, so this stays a cheap single statement.
    const placeholders = postIds.map(() => "?").join(", ");
    this.raw
      .prepare(`UPDATE posts SET views = views + 1 WHERE id IN (${placeholders})`)
      .run(...postIds);
  }

  async listRecentPosts(limit: number): Promise<Post[]> {
    const rows = this.db
      .select()
      .from(posts)
      .orderBy(desc(posts.createdAt), desc(posts.id))
      .limit(limit)
      .all();
    return rows.map(fromRow);
  }

  async listFlaggedPosts(limit: number): Promise<Post[]> {
    // A Post is "flagged" if it has at least one flag event; order by its most
    // recent flag (newest-flagged first). Raw SQL because the ordering key is a
    // per-Post aggregate over post_events that Drizzle's typed builder doesn't
    // express cleanly; the store still returns plain Posts, no counts.
    const rows = this.raw
      .prepare(
        `SELECT p.id, p.situation, p.body, p.environment, p.repo, p.status,
                p.created_by, p.created_at, p.last_confirmed, p.views
           FROM posts p
           JOIN (
             SELECT post_id, MAX(created_at) AS last_flagged
               FROM post_events
              WHERE verdict = 'flag'
              GROUP BY post_id
           ) f ON f.post_id = p.id
          ORDER BY f.last_flagged DESC, p.id DESC
          LIMIT ?`,
      )
      .all(limit) as Array<{
      id: string;
      situation: string;
      body: string;
      environment: string;
      repo: string;
      status: string;
      created_by: string;
      created_at: number;
      last_confirmed: number | null;
      views: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      situation: r.situation,
      body: r.body,
      environment: r.environment,
      repo: r.repo,
      status: r.status as Post["status"],
      createdBy: r.created_by,
      createdAt: r.created_at,
      lastConfirmed: r.last_confirmed,
      views: r.views,
    }));
  }

  async retirePost(id: string): Promise<void> {
    this.db
      .update(posts)
      .set({ status: "retired" })
      .where(eq(posts.id, id))
      .run();
  }

  async restorePost(id: string): Promise<void> {
    this.db
      .update(posts)
      .set({ status: "active" })
      .where(eq(posts.id, id))
      .run();
  }

  async getUser(id: string): Promise<User | null> {
    // better-auth owns the `user` table, so this reads it with raw SQL rather
    // than a Drizzle model (keeping the auth tables out of store/schema.ts —
    // see ADR 0003). Quoted identifier because `user` is a SQL keyword.
    const row = this.raw
      .prepare(`SELECT id, name, role FROM "user" WHERE id = ?`)
      .get(id) as { id: string; name: string; role: string | null } | undefined;
    return row ? { id: row.id, name: row.name, role: row.role } : null;
  }
}

function toRow(post: Post): PostRow {
  return {
    id: post.id,
    situation: post.situation,
    body: post.body,
    environment: post.environment,
    repo: post.repo,
    status: post.status,
    createdBy: post.createdBy,
    createdAt: post.createdAt,
    lastConfirmed: post.lastConfirmed,
    views: post.views,
  };
}

function fromEventRow(row: PostEventRow): PostEvent {
  return {
    id: row.id,
    postId: row.post_id,
    verdict: row.verdict as PostEvent["verdict"],
    reason: row.reason as PostEvent["reason"],
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function fromRow(row: PostRow): Post {
  return {
    id: row.id,
    situation: row.situation,
    body: row.body,
    environment: row.environment,
    repo: row.repo,
    status: row.status as Post["status"],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    lastConfirmed: row.lastConfirmed,
    views: row.views,
  };
}
