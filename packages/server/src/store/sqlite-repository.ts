import type { Database } from "better-sqlite3";
import { desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { NewPostEvent, PostEvent } from "../core/post-event.js";
import type { NewPost, Post } from "../core/post.js";
import type { Embedder } from "../embedding/embedder.js";
import type { Clock } from "../platform/clock.js";
import type { IdGen } from "../platform/id-gen.js";
import type { Candidate, PostEventRow, VecCandidate } from "./queries.js";
import {
  environmentVectorSearch,
  eventsForPosts,
  insertEmbeddings,
  keywordSearch,
  vectorSearch,
} from "./queries.js";
import type { PostRepository, PostSort } from "./repository.js";
import { postEvents, posts } from "./schema.js";
import type { PostRow } from "./schema.js";

/**
 * Drizzle/SQLite-backed {@link PostRepository}. Holds the Drizzle wrapper (CRUD)
 * and the raw better-sqlite3 handle (FTS5/vec0 virtual-table queries) over one
 * connection, plus the {@link Embedder} shared by write- and query-time vectors.
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
      // Falls back to situation so callers that omit title still produce a valid Post.
      title: input.title ?? input.situation,
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

    // Embed BEFORE the transaction: the embedder is async and can't run inside a
    // sync better-sqlite3 transaction, so resolve both vectors first, then write
    // the row and vectors atomically. A failed embed throws and persists nothing.
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

  async searchByEnvironmentVector(
    query: string,
    limit: number,
  ): Promise<VecCandidate[]> {
    const embedding = await this.embedder.embed(query);
    return environmentVectorSearch(this.raw, embedding, limit);
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
      // The Post must exist — explicit check gives a clear error and lets us
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

      // A Confirm refreshes the denormalized last_confirmed; the event log
      // remains the source of truth.
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
    // One batched UPDATE; missing ids match nothing. No event, never feeds ranking.
    const placeholders = postIds.map(() => "?").join(", ");
    this.raw
      .prepare(`UPDATE posts SET views = views + 1 WHERE id IN (${placeholders})`)
      .run(...postIds);
  }

  async listRecentPosts(
    limit: number,
    sort: PostSort = "newest",
  ): Promise<Post[]> {
    // "Most confirmed" counts confirm events per Post via a LEFT JOIN aggregate
    // (raw SQL, like listFlaggedPosts); `newest`/`views` are plain column sorts.
    // All keep `id DESC` as a stable tiebreaker.
    if (sort === "confirms") {
      const rows = this.raw
        .prepare(
          `SELECT p.id, p.title, p.situation, p.body, p.environment, p.repo, p.status,
                  p.created_by, p.created_at, p.last_confirmed, p.views
             FROM posts p
             LEFT JOIN (
               SELECT post_id, COUNT(*) AS confirms
                 FROM post_events
                WHERE verdict = 'confirm'
                GROUP BY post_id
             ) c ON c.post_id = p.id
            ORDER BY COALESCE(c.confirms, 0) DESC, p.created_at DESC, p.id DESC
            LIMIT ?`,
        )
        .all(limit) as Array<{
        id: string;
        title: string | null;
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
        title: r.title ?? r.situation,
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

    const orderBy =
      sort === "views"
        ? [desc(posts.views), desc(posts.id)]
        : [desc(posts.createdAt), desc(posts.id)];
    const rows = this.db
      .select()
      .from(posts)
      .orderBy(...orderBy)
      .limit(limit)
      .all();
    return rows.map(fromRow);
  }

  async listFlaggedPosts(limit: number): Promise<Post[]> {
    // A Post is "flagged" if it has at least one flag event; ordered newest-
    // flagged first. Raw SQL because the ordering key is a per-Post aggregate.
    const rows = this.raw
      .prepare(
        `SELECT p.id, p.title, p.situation, p.body, p.environment, p.repo, p.status,
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
      title: string | null;
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
      title: r.title ?? r.situation,
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
}

function toRow(post: Post): PostRow {
  return {
    id: post.id,
    title: post.title,
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
    // Legacy rows have a null title; fall back to the situation.
    title: row.title ?? row.situation,
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
