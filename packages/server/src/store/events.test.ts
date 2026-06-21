import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeEmbedder, FrozenTime } from "../test/fakes.js";
import { seedUser } from "../test/seed-user.js";
import { migrate } from "./migrate.js";
import { SqliteRepository } from "./sqlite-repository.js";

let raw: Database.Database;
let time: FrozenTime;
let repo: SqliteRepository;

beforeEach(() => {
  raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  sqliteVec.load(raw);
  migrate(raw);
  const db = drizzle(raw);
  seedUser(raw, "user_alice", "Alice");
  time = new FrozenTime();
  repo = new SqliteRepository(db, raw, new FakeEmbedder());
});

afterEach(() => {
  time.restore();
  raw.close();
});

async function seed(): Promise<string> {
  const post = await repo.createPost({
    situation: "s",
    body: "b",
    environment: "e",
    repo: "r",
    createdBy: "user_alice",
  });
  return post.id;
}

describe("recordEvent (post_events log)", () => {
  it("records a Confirm with optional note and refreshes last_confirmed", async () => {
    const id = await seed();
    expect((await repo.getPost(id))!.lastConfirmed).toBeNull();

    time.advance(1000);
    const at = time.now();
    const event = await repo.recordEvent({
      postId: id,
      verdict: "confirm",
      note: "worked",
      createdBy: "user_alice",
    });

    expect(event.verdict).toBe("confirm");
    expect(event.reason).toBeNull();
    expect(event.note).toBe("worked");
    expect(event.createdAt).toBe(at);
    // A Confirm refreshes the denormalized last_confirmed.
    expect((await repo.getPost(id))!.lastConfirmed).toBe(at);
  });

  it("records a Flag with reason and does NOT touch last_confirmed", async () => {
    const id = await seed();
    await repo.recordEvent({
      postId: id,
      verdict: "flag",
      reason: "stale",
      createdBy: "user_alice",
    });
    const events = await repo.getEventsForPosts([id]);
    expect(events).toHaveLength(1);
    expect(events[0]!.verdict).toBe("flag");
    expect(events[0]!.reason).toBe("stale");
    expect((await repo.getPost(id))!.lastConfirmed).toBeNull();
  });

  it("rejects an event against a non-existent Post", async () => {
    await expect(
      repo.recordEvent({
        postId: "post_nope",
        verdict: "confirm",
        createdBy: "user_alice",
      }),
    ).rejects.toThrow();
  });

  it("returns events newest-first and batched across Posts", async () => {
    const a = await seed();
    const b = await seed();

    time.advance(10);
    await repo.recordEvent({ postId: a, verdict: "confirm", createdBy: "user_alice" });
    time.advance(10);
    await repo.recordEvent({ postId: b, verdict: "flag", reason: "incorrect", createdBy: "user_alice" });
    time.advance(10);
    await repo.recordEvent({ postId: a, verdict: "flag", reason: "duplicate", createdBy: "user_alice" });

    const events = await repo.getEventsForPosts([a, b]);
    expect(events).toHaveLength(3);
    // Newest first across the batch.
    expect(events[0]!.createdAt).toBeGreaterThanOrEqual(events[1]!.createdAt);
    expect(events[1]!.createdAt).toBeGreaterThanOrEqual(events[2]!.createdAt);
    expect(events.filter((e) => e.postId === a)).toHaveLength(2);
    expect(events.filter((e) => e.postId === b)).toHaveLength(1);
  });

  it("returns an empty array for no ids", async () => {
    expect(await repo.getEventsForPosts([])).toEqual([]);
  });
});

describe("recordViews (display-only counter)", () => {
  it("starts at zero and increments per surfacing, batched across Posts", async () => {
    const a = await seed();
    const b = await seed();
    expect((await repo.getPost(a))!.views).toBe(0);

    await repo.recordViews([a, b]);
    await repo.recordViews([a]);

    expect((await repo.getPost(a))!.views).toBe(2);
    expect((await repo.getPost(b))!.views).toBe(1);
  });

  it("is a no-op for an empty list and for unknown ids", async () => {
    const a = await seed();
    await repo.recordViews([]);
    await repo.recordViews(["post_nope"]); // matches nothing, does not throw
    expect((await repo.getPost(a))!.views).toBe(0);
  });

  it("never touches the trust counts or last_confirmed", async () => {
    const a = await seed();
    await repo.recordViews([a]);
    await repo.recordViews([a]);
    const post = (await repo.getPost(a))!;
    expect(post.views).toBe(2);
    expect(post.lastConfirmed).toBeNull();
    expect(await repo.getEventsForPosts([a])).toEqual([]);
  });
});
