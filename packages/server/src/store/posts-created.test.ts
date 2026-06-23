import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, FakeEmbedder, FakeIdGen } from "../test/fakes.js";
import { migrate } from "./migrate.js";
import { SqliteRepository } from "./sqlite-repository.js";

// postsCreatedStats is read-time aggregation over the raw `posts` rows: how many
// Posts were created in a half-open `[from, to)` range, with no pre-aggregated
// counter. These tests pin the count and that the range bounds are honoured.

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

/** Create one Post at the current clock. */
async function post(): Promise<void> {
  await repo.createPost({
    situation: "database connection timeout",
    body: "increase the pool size",
    environment: "node 22",
    repo: "webshop",
    createdBy: "user_alice",
  });
}

/** A range that spans the whole fake clock. */
function fullRange() {
  return { from: 0, to: Number.MAX_SAFE_INTEGER };
}

describe("postsCreatedStats", () => {
  it("counts Posts created in range", async () => {
    await post();
    await post();
    await post();

    const stats = await repo.postsCreatedStats(fullRange());
    expect(stats.created).toBe(3);
  });

  it("reports zero for an empty corpus", async () => {
    const stats = await repo.postsCreatedStats(fullRange());
    expect(stats.created).toBe(0);
  });

  it("honours the half-open range: includes `from`, excludes `to`", async () => {
    clock.set(1000);
    await post(); // at 1000
    clock.set(2000);
    await post(); // at 2000
    clock.set(3000);
    await post(); // at 3000

    // [1000, 3000) covers the first two Posts, not the one at 3000.
    const stats = await repo.postsCreatedStats({ from: 1000, to: 3000 });
    expect(stats.created).toBe(2);
  });
});
