import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, FakeEmbedder, FakeIdGen } from "../test/fakes.js";
import { seedUser } from "../test/seed-user.js";
import { migrate } from "./migrate.js";
import { SqliteRepository } from "./sqlite-repository.js";

// The tuning view (PLO-51) reads each recent Retrieval WITH its returned Posts:
// rank, a human-readable Post title, and the full captured score breakdown. It
// reads the raw rows captured in PLO-48 — these tests pin that detailed read:
// grouping by retrieval, ordering by rank, and tolerating a retired/deleted Post.

let raw: Database.Database;
let clock: FakeClock;
let repo: SqliteRepository;

beforeEach(() => {
  raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  sqliteVec.load(raw);
  migrate(raw);
  const db = drizzle(raw);
  seedUser(raw, "user_alice", "Alice");
  clock = new FakeClock();
  repo = new SqliteRepository(db, raw, clock, new FakeIdGen(), new FakeEmbedder());
});

afterEach(() => {
  raw.close();
});

/** Create one Post (with a distinct title) and return its id. */
async function post(situation: string, title: string): Promise<string> {
  const created = await repo.createPost({
    title,
    situation,
    body: "fix it",
    environment: "node 22",
    repo: "webshop",
    createdBy: "user_alice",
  });
  return created.id;
}

describe("listRecentRetrievalsDetailed", () => {
  it("carries each retrieval's returned Posts with rank, title, and breakdown", async () => {
    const a = await post("connection timeout", "Raise the pool size");
    const b = await post("connection timeout", "Add a retry");

    repo.recordRetrieval({
      userId: "user_alice",
      repo: "webshop",
      situation: "connection timeout",
      environment: null,
      limit: 5,
      results: [
        { postId: a, rank: 1, rrfScore: 0.5, trust: 1.2, recency: 0.9, repoBoost: 1.1, final: 0.594 },
        { postId: b, rank: 2, rrfScore: 0.3, trust: 1, recency: 0.8, repoBoost: 1, final: 0.24 },
      ],
    });

    const [detail] = await repo.listRecentRetrievalsDetailed(10);
    expect(detail!.situation).toBe("connection timeout");
    expect(detail!.resultCount).toBe(2);
    expect(detail!.results.map((r) => r.rank)).toEqual([1, 2]);
    expect(detail!.results[0]).toMatchObject({
      postId: a,
      postTitle: "Raise the pool size",
      rank: 1,
      rrfScore: 0.5,
      trust: 1.2,
      recency: 0.9,
      repoBoost: 1.1,
      final: 0.594,
    });
    expect(detail!.results[1]!.postTitle).toBe("Add a retry");
  });

  it("orders results by rank regardless of insertion order", async () => {
    const a = await post("x", "first");
    const b = await post("x", "second");
    repo.recordRetrieval({
      userId: "user_alice",
      repo: null,
      situation: "x",
      environment: null,
      limit: 5,
      results: [
        { postId: a, rank: 2, rrfScore: 1, trust: 1, recency: 1, repoBoost: 1, final: 1 },
        { postId: b, rank: 1, rrfScore: 1, trust: 1, recency: 1, repoBoost: 1, final: 1 },
      ],
    });

    const [detail] = await repo.listRecentRetrievalsDetailed(10);
    expect(detail!.results.map((r) => r.rank)).toEqual([1, 2]);
    expect(detail!.results.map((r) => r.postId)).toEqual([b, a]);
  });

  it("shows a null title for a retired/deleted Post (caller falls back to id)", async () => {
    const id = await post("x", "to be removed");
    repo.recordRetrieval({
      userId: "user_alice",
      repo: null,
      situation: "x",
      environment: null,
      limit: 5,
      results: [
        { postId: id, rank: 1, rrfScore: 1, trust: 1, recency: 1, repoBoost: 1, final: 1 },
        { postId: "post_gone", rank: 2, rrfScore: 1, trust: 1, recency: 1, repoBoost: 1, final: 1 },
      ],
    });

    const [detail] = await repo.listRecentRetrievalsDetailed(10);
    // The captured result row survives even though no Post row joins; title is null.
    const missing = detail!.results.find((r) => r.postId === "post_gone");
    expect(missing).toBeDefined();
    expect(missing!.postTitle).toBeNull();
  });

  it("returns a zero-result retrieval with an empty results list", async () => {
    repo.recordRetrieval({
      userId: "user_alice",
      repo: null,
      situation: "nothing matches",
      environment: null,
      limit: 5,
      results: [],
    });

    const [detail] = await repo.listRecentRetrievalsDetailed(10);
    expect(detail!.resultCount).toBe(0);
    expect(detail!.results).toEqual([]);
  });

  it("returns newest first, capped at limit", async () => {
    const id = await post("x", "p");
    const mk = (situation: string) =>
      repo.recordRetrieval({
        userId: "user_alice",
        repo: null,
        situation,
        environment: null,
        limit: 5,
        results: [
          { postId: id, rank: 1, rrfScore: 1, trust: 1, recency: 1, repoBoost: 1, final: 1 },
        ],
      });
    mk("first");
    clock.advance(1000);
    mk("second");

    const details = await repo.listRecentRetrievalsDetailed(1);
    expect(details).toHaveLength(1);
    expect(details[0]!.situation).toBe("second");
  });

  it("returns an empty list when there are no retrievals", async () => {
    expect(await repo.listRecentRetrievalsDetailed(10)).toEqual([]);
  });
});
