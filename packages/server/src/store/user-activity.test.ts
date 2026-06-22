import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, FakeEmbedder, FakeIdGen } from "../test/fakes.js";
import { migrate } from "./migrate.js";
import { SqliteRepository } from "./sqlite-repository.js";

// userActivityStats tallies posts authored + searches run per user and ranks by
// combined activity. These tests pin the per-source counting, the ranking, and
// the limit.

let raw: Database.Database;
let clock: FakeClock;
let repo: SqliteRepository;

beforeEach(() => {
  raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  sqliteVec.load(raw);
  migrate(raw, "team");
  const db = drizzle(raw);
  clock = new FakeClock();
  repo = new SqliteRepository(db, raw, clock, new FakeIdGen(), new FakeEmbedder());
});

afterEach(() => {
  raw.close();
});

async function postAs(userId: string): Promise<void> {
  await repo.createPost({
    situation: "database connection timeout",
    body: "increase the pool size",
    environment: "node 22",
    repo: "webshop",
    createdBy: userId,
  });
}

function searchAs(userId: string): void {
  repo.recordRetrieval({
    userId,
    repo: "webshop",
    situation: "database connection timeout",
    environment: null,
    limit: 5,
    results: [],
  });
}

describe("userActivityStats", () => {
  it("tallies posts and searches per user, ranked by combined activity", async () => {
    await postAs("user_alice");
    await postAs("user_alice");
    searchAs("user_alice"); // alice: 2 posts + 1 search = 3
    searchAs("user_bob"); // bob: 1 search = 1

    const stats = await repo.userActivityStats(10);
    const now = clock.now();
    expect(stats).toEqual([
      { userId: "user_alice", posts: 2, searches: 1, total: 3, lastSeen: now },
      { userId: "user_bob", posts: 0, searches: 1, total: 1, lastSeen: now },
    ]);
  });

  it("reports lastSeen as the user's newest post or search", async () => {
    await postAs("user_alice");
    clock.advance(60_000);
    searchAs("user_alice"); // newer than the post
    const newest = clock.now();

    const [alice] = await repo.userActivityStats(10);
    expect(alice?.lastSeen).toBe(newest);
  });

  it("honours the limit", async () => {
    await postAs("user_a");
    await postAs("user_b");
    await postAs("user_c");

    const stats = await repo.userActivityStats(2);
    expect(stats).toHaveLength(2);
  });

  it("returns nothing when there is no activity", async () => {
    expect(await repo.userActivityStats(10)).toEqual([]);
  });
});
