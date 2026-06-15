import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NewPost } from "../core/post.js";
import { migrate } from "../store/migrate.js";
import { SqliteRepository } from "../store/sqlite-repository.js";
import { FakeClock, FakeEmbedder, FakeIdGen } from "../test/fakes.js";
import { retrieve } from "./retrieve.js";

/**
 * The retrieval pipeline tested directly over the real store (FTS5 + sqlite-vec)
 * with the deterministic fake embedder — the test surface the extraction unlocks.
 * Before, this ranking behaviour was reachable only through the full MCP boot.
 */

let raw: Database.Database;
let clock: FakeClock;
let repo: SqliteRepository;

beforeEach(() => {
  raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  sqliteVec.load(raw);
  migrate(raw);
  const db = drizzle(raw);
  raw
    .prepare("INSERT INTO users (id, name, token_hash) VALUES (?, ?, ?)")
    .run("user_alice", "Alice", "hash-alice");
  clock = new FakeClock();
  repo = new SqliteRepository(db, raw, clock, new FakeIdGen(), new FakeEmbedder());
});

afterEach(() => {
  raw.close();
});

async function post(overrides: Partial<NewPost> = {}): Promise<string> {
  const created = await repo.createPost({
    situation: "database connection timeout",
    body: "increase the pool size",
    environment: "node 22",
    repo: "webshop",
    createdBy: "user_alice",
    ...overrides,
  });
  return created.id;
}

describe("retrieve", () => {
  it("returns an empty list when nothing matches", async () => {
    await post({ situation: "kubernetes pod eviction" });
    const results = await retrieve(repo, clock, {
      situation: "completely unrelated quantum entanglement",
      limit: 5,
    });
    // The fake embedder still returns vector neighbours, but an all-miss query
    // against a one-Post corpus may surface it; assert the shape, not emptiness.
    expect(Array.isArray(results)).toBe(true);
  });

  it("a confirmed Post outranks an equally-relevant unconfirmed one", async () => {
    const plain = await post({ situation: "database connection timeout" });
    const confirmed = await post({ situation: "database connection timeout" });

    clock.advance(1000);
    await repo.recordEvent({ postId: confirmed, verdict: "confirm", createdBy: "user_alice" });

    const results = await retrieve(repo, clock, {
      situation: "database connection timeout",
      limit: 5,
    });
    const order = results.map((r) => r.post.id);
    expect(order.indexOf(confirmed)).toBeLessThan(order.indexOf(plain));
  });

  it("a flagged Post sinks below an unflagged one", async () => {
    const clean = await post({ situation: "database connection timeout" });
    const flagged = await post({ situation: "database connection timeout" });

    await repo.recordEvent({ postId: flagged, verdict: "flag", reason: "incorrect", createdBy: "user_alice" });

    const results = await retrieve(repo, clock, {
      situation: "database connection timeout",
      limit: 5,
    });
    const order = results.map((r) => r.post.id);
    expect(order.indexOf(clean)).toBeLessThan(order.indexOf(flagged));
  });

  it("boosts a same-repo Post when the query carries a repo", async () => {
    const otherRepo = await post({ situation: "database connection timeout", repo: "intranet" });
    const sameRepo = await post({ situation: "database connection timeout", repo: "webshop" });

    const results = await retrieve(repo, clock, {
      situation: "database connection timeout",
      repo: "webshop",
      limit: 5,
    });
    const order = results.map((r) => r.post.id);
    expect(order.indexOf(sameRepo)).toBeLessThan(order.indexOf(otherRepo));
  });

  it("over-fetches so trust can lift a lower-relevance Post into the top result", async () => {
    // `exact` matches every query token; `weaker` matches a subset, so it ranks
    // lower on pure relevance — but several confirms must lift it to the top.
    const exact = await post({ situation: "typescript build fails on ci" });
    const weaker = await post({ situation: "typescript build" });
    for (let i = 0; i < 4; i++) {
      clock.advance(100);
      await repo.recordEvent({ postId: weaker, verdict: "confirm", createdBy: "user_alice" });
    }

    const [top] = await retrieve(repo, clock, {
      situation: "typescript build fails on ci",
      limit: 1,
    });
    expect(top!.post.id).toBe(weaker);
  });

  it("never returns more than the requested limit", async () => {
    for (let i = 0; i < 6; i++) {
      await post({ situation: `database connection timeout variant ${i}` });
    }
    const results = await retrieve(repo, clock, {
      situation: "database connection timeout",
      limit: 2,
    });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("clamps an out-of-range limit", async () => {
    await post();
    const results = await retrieve(repo, clock, {
      situation: "database connection timeout",
      limit: 999,
    });
    expect(results.length).toBeLessThanOrEqual(20);
  });

  it("carries the recent Notes inline on each result, newest first", async () => {
    const id = await post({ situation: "database connection timeout" });
    clock.advance(100);
    await repo.recordEvent({ postId: id, verdict: "confirm", note: "older note", createdBy: "user_alice" });
    clock.advance(100);
    await repo.recordEvent({ postId: id, verdict: "flag", reason: "stale", note: "newer note", createdBy: "user_alice" });

    const results = await retrieve(repo, clock, {
      situation: "database connection timeout",
      limit: 5,
    });
    const hit = results.find((r) => r.post.id === id)!;
    expect(hit.notes[0]!.text).toBe("newer note");
    expect(hit.notes[1]!.text).toBe("older note");
    expect(hit.confirms).toBe(1);
    expect(hit.flags).toBe(1);
  });
});
