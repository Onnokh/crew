import type { Database } from "better-sqlite3";
import { eq } from "drizzle-orm";
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
import { postEvents, posts, users } from "./schema.js";
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

  async findUserByTokenHash(tokenHash: string): Promise<User | null> {
    const row = this.db
      .select()
      .from(users)
      .where(eq(users.tokenHash, tokenHash))
      .get();
    return row ? { id: row.id, name: row.name } : null;
  }

  async getUser(id: string): Promise<User | null> {
    const row = this.db.select().from(users).where(eq(users.id, id)).get();
    return row ? { id: row.id, name: row.name } : null;
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
  };
}
