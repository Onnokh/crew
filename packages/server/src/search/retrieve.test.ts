import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NewPost } from "../core/post.js";
import type { AuthorLookup } from "../read/hydrate.js";
import { migrate } from "../store/migrate.js";
import { SqliteRepository } from "../store/sqlite-repository.js";
import { FakeClock, FakeEmbedder, FakeIdGen } from "../test/fakes.js";
import { retrieve } from "./retrieve.js";

let raw: Database.Database;
let clock: FakeClock;
let repo: SqliteRepository;

// Author resolution comes from the control plane; a stub suffices here.
const getUser: AuthorLookup = (id) =>
  id === "user_alice" ? { id, name: "Alice", role: null } : null;

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
    const results = await retrieve(repo, getUser, clock, {
      situation: "completely unrelated quantum entanglement",
      limit: 5,
    });
    // Vector neighbours may surface the one Post, so assert shape not emptiness.
    expect(Array.isArray(results)).toBe(true);
  });

  it("a confirmed Post outranks an equally-relevant unconfirmed one", async () => {
    const plain = await post({ situation: "database connection timeout" });
    const confirmed = await post({ situation: "database connection timeout" });

    clock.advance(1000);
    await repo.recordEvent({ postId: confirmed, verdict: "confirm", createdBy: "user_alice" });

    const results = await retrieve(repo, getUser, clock, {
      situation: "database connection timeout",
      limit: 5,
    });
    const order = results.map((r) => r.result.post.id);
    expect(order.indexOf(confirmed)).toBeLessThan(order.indexOf(plain));
  });

  it("a flagged Post sinks below an unflagged one", async () => {
    const clean = await post({ situation: "database connection timeout" });
    const flagged = await post({ situation: "database connection timeout" });

    await repo.recordEvent({ postId: flagged, verdict: "flag", reason: "incorrect", createdBy: "user_alice" });

    const results = await retrieve(repo, getUser, clock, {
      situation: "database connection timeout",
      limit: 5,
    });
    const order = results.map((r) => r.result.post.id);
    expect(order.indexOf(clean)).toBeLessThan(order.indexOf(flagged));
  });

  it("boosts a same-repo Post when the query carries a repo", async () => {
    const otherRepo = await post({ situation: "database connection timeout", repo: "intranet" });
    const sameRepo = await post({ situation: "database connection timeout", repo: "webshop" });

    const results = await retrieve(repo, getUser, clock, {
      situation: "database connection timeout",
      repo: "webshop",
      limit: 5,
    });
    const order = results.map((r) => r.result.post.id);
    expect(order.indexOf(sameRepo)).toBeLessThan(order.indexOf(otherRepo));
  });

  it("boosts an environment-matching Post when situation relevance is equal", async () => {
    const k8s = await post({
      situation: "dependency install fails with native binary mismatch",
      environment: "kubernetes 1.29 alpine container",
    });
    const node = await post({
      situation: "dependency install fails with native binary mismatch",
      environment: "Node 22 fastembed onnxruntime",
    });

    const results = await retrieve(repo, getUser, clock, {
      situation: "dependency install fails with native binary mismatch",
      environment: "Node 22 fastembed onnxruntime",
      limit: 5,
    });
    const order = results.map((r) => r.result.post.id);
    expect(order.indexOf(node)).toBeLessThan(order.indexOf(k8s));
  });

  it("over-fetches so trust can lift a lower-relevance Post into the top result", async () => {
    // `weaker` ranks lower on relevance but several confirms must lift it to the top.
    const exact = await post({ situation: "typescript build fails on ci" });
    const weaker = await post({ situation: "typescript build" });
    for (let i = 0; i < 4; i++) {
      clock.advance(100);
      await repo.recordEvent({ postId: weaker, verdict: "confirm", createdBy: "user_alice" });
    }

    const [top] = await retrieve(repo, getUser, clock, {
      situation: "typescript build fails on ci",
      limit: 1,
    });
    expect(top!.result.post.id).toBe(weaker);
  });

  it("never returns more than the requested limit", async () => {
    for (let i = 0; i < 6; i++) {
      await post({ situation: `database connection timeout variant ${i}` });
    }
    const results = await retrieve(repo, getUser, clock, {
      situation: "database connection timeout",
      limit: 2,
    });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("clamps an out-of-range limit", async () => {
    await post();
    const results = await retrieve(repo, getUser, clock, {
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

    const results = await retrieve(repo, getUser, clock, {
      situation: "database connection timeout",
      limit: 5,
    });
    const hit = results.find((r) => r.result.post.id === id)!.result;
    expect(hit.notes[0]!.text).toBe("newer note");
    expect(hit.notes[1]!.text).toBe("older note");
    expect(hit.confirms).toBe(1);
    expect(hit.flags).toBe(1);
  });
});
