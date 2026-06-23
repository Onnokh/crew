import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, FakeEmbedder, FakeIdGen } from "../test/fakes.js";
import { migrate } from "./migrate.js";
import { SqliteRepository } from "./sqlite-repository.js";

// userActivityStats tallies posts authored + searches run per user and ranks by
// combined activity, over a rolling window. These tests pin the per-source
// counting, the ranking, the limit, and the window cutoff.

const DAY_MS = 24 * 60 * 60 * 1000;
// A `since` of 0 means "everything" — the FakeClock starts well after the epoch.
const ALL_TIME = 0;

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

    const stats = await repo.userActivityStats(10, ALL_TIME);
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

    const [alice] = await repo.userActivityStats(10, ALL_TIME);
    expect(alice?.lastSeen).toBe(newest);
  });

  it("honours the limit", async () => {
    await postAs("user_a");
    await postAs("user_b");
    await postAs("user_c");

    const stats = await repo.userActivityStats(2, ALL_TIME);
    expect(stats).toHaveLength(2);
  });

  it("returns nothing when there is no activity", async () => {
    expect(await repo.userActivityStats(10, ALL_TIME)).toEqual([]);
  });

  it("counts only activity at or after the since cutoff", async () => {
    await postAs("user_alice"); // old: before the window
    clock.advance(40 * DAY_MS);
    const since = clock.now() - 30 * DAY_MS;
    searchAs("user_alice"); // recent: inside the window

    const [alice] = await repo.userActivityStats(10, since);
    expect(alice).toEqual({
      userId: "user_alice",
      posts: 0,
      searches: 1,
      total: 1,
      lastSeen: clock.now(),
    });
  });
});
