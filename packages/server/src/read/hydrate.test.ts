import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Post } from "../core/post.js";
import type { User } from "../core/user.js";
import { migrate } from "../store/migrate.js";
import { SqliteRepository } from "../store/sqlite-repository.js";
import { FakeClock, FakeEmbedder, FakeIdGen } from "../test/fakes.js";
import { hydratePosts, type AuthorLookup } from "./hydrate.js";

let raw: Database.Database;
let clock: FakeClock;
let repo: SqliteRepository;

// Author resolution now comes from the control plane, not the corpus DB. A tiny
// in-memory lookup stands in: unknown ids return null (→ "unknown").
const USERS: Record<string, User> = {
  user_alice: { id: "user_alice", name: "Alice", role: null },
  user_bob: { id: "user_bob", name: "Bob", role: null },
};
const getUser: AuthorLookup = (id) => USERS[id] ?? null;

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

async function seed(createdBy = "user_alice"): Promise<Post> {
  return repo.createPost({
    situation: "s",
    body: "b",
    environment: "e",
    repo: "r",
    createdBy,
  });
}

describe("hydratePosts", () => {
  it("returns an empty array for no Posts (and reads nothing)", async () => {
    expect(await hydratePosts(repo, getUser, [])).toEqual([]);
  });

  it("resolves the author name from the Post's createdBy", async () => {
    const alice = await seed("user_alice");
    const bob = await seed("user_bob");
    const [a, b] = await hydratePosts(repo, getUser, [alice, bob]);
    expect(a!.authorName).toBe("Alice");
    expect(b!.authorName).toBe("Bob");
  });

  it("renders an unresolvable author as 'unknown'", async () => {
    const ghost: Post = {
      id: "post_ghost",
      title: "t",
      situation: "s",
      body: "b",
      environment: "e",
      repo: "r",
      status: "active",
      createdBy: "user_ghost",
      createdAt: clock.now(),
      lastConfirmed: null,
      views: 0,
    };
    const [row] = await hydratePosts(repo, getUser, [ghost]);
    expect(row!.authorName).toBe("unknown");
  });

  it("derives confirm/flag counts from the event log", async () => {
    const post = await seed();
    await repo.recordEvent({ postId: post.id, verdict: "confirm", createdBy: "user_alice" });
    await repo.recordEvent({ postId: post.id, verdict: "confirm", createdBy: "user_bob" });
    await repo.recordEvent({ postId: post.id, verdict: "flag", reason: "stale", createdBy: "user_bob" });

    const [row] = await hydratePosts(repo, getUser, [post]);
    expect(row!.confirms).toBe(2);
    expect(row!.flags).toBe(1);
  });

  it("carries the Post's events along, newest first, for the caller to reuse", async () => {
    const post = await seed();
    clock.advance(10);
    await repo.recordEvent({ postId: post.id, verdict: "confirm", note: "older", createdBy: "user_alice" });
    clock.advance(10);
    await repo.recordEvent({ postId: post.id, verdict: "flag", reason: "incorrect", note: "newer", createdBy: "user_bob" });

    const [row] = await hydratePosts(repo, getUser, [post]);
    expect(row!.events).toHaveLength(2);
    expect(row!.events[0]!.note).toBe("newer"); // newest first
    expect(row!.events[1]!.note).toBe("older");
  });

  it("surfaces the Post's view tally as a bare counter", async () => {
    const post = await seed();
    await repo.recordViews([post.id]);
    await repo.recordViews([post.id]);
    const fresh = (await repo.getPost(post.id))!;
    const [row] = await hydratePosts(repo, getUser, [fresh]);
    expect(row!.views).toBe(2);
  });

  it("preserves input order and reports zero counts for an eventless Post", async () => {
    const first = await seed();
    const second = await seed();
    await repo.recordEvent({ postId: second.id, verdict: "confirm", createdBy: "user_alice" });

    const rows = await hydratePosts(repo, getUser, [first, second]);
    expect(rows.map((r) => r.post.id)).toEqual([first.id, second.id]);
    expect(rows[0]!.confirms).toBe(0);
    expect(rows[0]!.flags).toBe(0);
    expect(rows[0]!.events).toEqual([]);
    expect(rows[1]!.confirms).toBe(1);
  });
});
