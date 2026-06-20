import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, FakeEmbedder, FakeIdGen } from "../test/fakes.js";
import { seedUser } from "../test/seed-user.js";
import { migrate } from "./migrate.js";
import { SqliteRepository } from "./sqlite-repository.js";

// Coverage is read-time aggregation over the raw `retrievals` rows: the total
// query volume and the zero-result count in a half-open `[from, to)` range, with
// no pre-aggregated counter. These tests pin the count, the zero-result filter,
// and that the range bounds are honoured (inclusive from, exclusive to).

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

/** Create one Post and return its id (so with-results retrievals are realistic). */
async function post(): Promise<string> {
  const created = await repo.createPost({
    situation: "database connection timeout",
    body: "increase the pool size",
    environment: "node 22",
    repo: "webshop",
    createdBy: "user_alice",
  });
  return created.id;
}

/** Record a retrieval with one result over `postId` at the current clock. */
function withResults(postId: string): void {
  repo.recordRetrieval({
    userId: "user_alice",
    repo: "webshop",
    situation: "database connection timeout",
    environment: null,
    limit: 5,
    results: [
      { postId, rank: 1, rrfScore: 1, trust: 1, recency: 1, repoBoost: 1, final: 1 },
    ],
  });
}

/** Record a zero-result retrieval at the current clock. */
function zeroResult(): void {
  repo.recordRetrieval({
    userId: "user_alice",
    repo: "webshop",
    situation: "no such thing",
    environment: null,
    limit: 5,
    results: [],
  });
}

/** A range that spans the whole fake clock. */
function fullRange() {
  return { from: 0, to: Number.MAX_SAFE_INTEGER };
}

describe("coverageStats", () => {
  it("counts total retrievals and the zero-result subset", async () => {
    const id = await post();
    withResults(id);
    withResults(id);
    zeroResult();

    const stats = await repo.coverageStats(fullRange());
    expect(stats.total).toBe(3);
    expect(stats.zeroResults).toBe(1);
  });

  it("reports zero counts for an empty log", async () => {
    const stats = await repo.coverageStats(fullRange());
    expect(stats).toEqual({ total: 0, zeroResults: 0 });
  });

  it("counts every retrieval as zero-result when none returned a Post", async () => {
    zeroResult();
    zeroResult();

    const stats = await repo.coverageStats(fullRange());
    expect(stats.total).toBe(2);
    expect(stats.zeroResults).toBe(2);
  });

  it("honours the half-open range: includes `from`, excludes `to`", async () => {
    const id = await post();
    clock.set(1000);
    withResults(id); // at 1000
    clock.set(2000);
    zeroResult(); // at 2000
    clock.set(3000);
    withResults(id); // at 3000

    // [1000, 3000) covers the first two retrievals, not the one at 3000.
    const stats = await repo.coverageStats({ from: 1000, to: 3000 });
    expect(stats.total).toBe(2);
    expect(stats.zeroResults).toBe(1);
  });
});
