import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, FakeEmbedder, FakeIdGen } from "../test/fakes.js";
import { migrate } from "./migrate.js";
import { SqliteRepository } from "./sqlite-repository.js";

// recentActivity merges three logs — retrievals, posts, post_events — into one
// time-sorted feed. These tests pin the kind mapping, the newest-first order
// across sources, and the limit.

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

function search(): void {
  repo.recordRetrieval({
    userId: "user_alice",
    repo: "webshop",
    situation: "database connection timeout",
    environment: null,
    limit: 5,
    results: [],
  });
}

describe("recentActivity", () => {
  it("merges searches, posts, and verdicts into one feed, newest first", async () => {
    clock.set(1000);
    const id = await post(); // post at 1000
    clock.set(2000);
    search(); // search at 2000
    clock.set(3000);
    await repo.recordEvent({
      postId: id,
      verdict: "flag",
      reason: "stale",
      createdBy: "user_bob",
    }); // flag at 3000

    const feed = await repo.recentActivity(10);
    expect(feed.map((r) => r.kind)).toEqual(["flag", "search", "post"]);

    const flag = feed[0]!;
    expect(flag.reason).toBe("stale");
    expect(flag.userId).toBe("user_bob");
    expect(flag.subject).toBe("database connection timeout");

    const searchRow = feed[1]!;
    expect(searchRow.resultCount).toBe(0);
    expect(searchRow.reason).toBeNull();
  });

  it("honours the limit", async () => {
    clock.set(1000);
    await post();
    clock.set(2000);
    await post();
    clock.set(3000);
    await post();

    const feed = await repo.recentActivity(2);
    expect(feed).toHaveLength(2);
  });
});
