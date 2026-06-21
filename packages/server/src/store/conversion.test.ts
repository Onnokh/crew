import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, FakeEmbedder, FakeIdGen } from "../test/fakes.js";
import { migrate } from "./migrate.js";
import { DEFAULT_ATTRIBUTION_WINDOW_MS } from "./queries.js";
import { SqliteRepository } from "./sqlite-repository.js";

// Conversion attribution is read-time logic over the raw telemetry rows: a
// Retrieval converts iff the SAME User who queried later Confirms one of its
// returned Posts, after the retrieval and within the window. These tests pin the
// four edges (same user/window/order) PLO-49 and PLO-51 both depend on.

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

/** Create one Post and return its id. */
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

/** Record a one-result retrieval for `userId` over `postId` at the current clock. */
function retrieval(userId: string, postId: string): void {
  repo.recordRetrieval({
    userId,
    repo: "webshop",
    situation: "database connection timeout",
    environment: null,
    limit: 5,
    results: [
      { postId, rank: 1, rrfScore: 1, trust: 1, recency: 1, repoBoost: 1, final: 1 },
    ],
  });
}

/** A range that spans the whole fake clock, with the default attribution window. */
function fullRange() {
  return {
    from: 0,
    to: Number.MAX_SAFE_INTEGER,
    windowMs: DEFAULT_ATTRIBUTION_WINDOW_MS,
  };
}

describe("conversionStats", () => {
  it("counts a Confirm by the same User within the window as converted", async () => {
    const id = await post();
    retrieval("user_alice", id);
    clock.advance(60_000);
    await repo.recordEvent({ postId: id, verdict: "confirm", createdBy: "user_alice" });

    const stats = await repo.conversionStats(fullRange());
    expect(stats.withResults).toBe(1);
    expect(stats.converted).toBe(1);
    expect(stats.byRetrieval[0]!.converted).toBe(true);
  });

  it("does not convert when a different User Confirms", async () => {
    const id = await post();
    retrieval("user_alice", id);
    clock.advance(60_000);
    // Bob confirms the same Post — not the querying User, so no attribution.
    await repo.recordEvent({ postId: id, verdict: "confirm", createdBy: "user_bob" });

    const stats = await repo.conversionStats(fullRange());
    expect(stats.withResults).toBe(1);
    expect(stats.converted).toBe(0);
    expect(stats.byRetrieval[0]!.converted).toBe(false);
  });

  it("does not convert when the Confirm falls outside the window", async () => {
    const id = await post();
    retrieval("user_alice", id);
    // One ms past the 7-day window.
    clock.advance(DEFAULT_ATTRIBUTION_WINDOW_MS + 1);
    await repo.recordEvent({ postId: id, verdict: "confirm", createdBy: "user_alice" });

    const stats = await repo.conversionStats(fullRange());
    expect(stats.withResults).toBe(1);
    expect(stats.converted).toBe(0);
  });

  it("does not convert when the Confirm precedes the retrieval", async () => {
    const id = await post();
    // Alice confirms first, THEN queries — the Confirm can't be attributed to it.
    await repo.recordEvent({ postId: id, verdict: "confirm", createdBy: "user_alice" });
    clock.advance(60_000);
    retrieval("user_alice", id);

    const stats = await repo.conversionStats(fullRange());
    expect(stats.withResults).toBe(1);
    expect(stats.converted).toBe(0);
  });
});
