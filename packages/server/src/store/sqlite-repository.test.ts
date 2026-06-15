import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeClock, FakeEmbedder, FakeIdGen } from "../test/fakes.js";
import { seedUser } from "../test/seed-user.js";
import { migrate } from "./migrate.js";
import { SqliteRepository } from "./sqlite-repository.js";

function freshRepo(clock: FakeClock, idGen: FakeIdGen): {
  repo: SqliteRepository;
  raw: Database.Database;
} {
  const raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  sqliteVec.load(raw);
  migrate(raw);
  return {
    repo: new SqliteRepository(drizzle(raw), raw, clock, idGen, new FakeEmbedder()),
    raw,
  };
}

describe("SqliteRepository (real store, in-memory SQLite)", () => {
  let clock: FakeClock;
  let idGen: FakeIdGen;
  let repo: SqliteRepository;
  let raw: Database.Database;

  beforeEach(() => {
    clock = new FakeClock(1_700_000_000_000);
    idGen = new FakeIdGen();
    ({ repo, raw } = freshRepo(clock, idGen));
    seedUser(raw, "user_alice", "Alice");
  });

  it("persists a Post with a prefixed id, timestamp, and active status", async () => {
    const post = await repo.createPost({
      situation: "s",
      body: "b",
      environment: "e",
      repo: "r",
      createdBy: "user_alice",
    });
    expect(post.id).toBe("post_1");
    expect(post.createdAt).toBe(1_700_000_000_000);
    expect(post.status).toBe("active");
    expect(post.lastConfirmed).toBeNull();

    const fetched = await repo.getPost("post_1");
    expect(fetched).toEqual(post);
    expect(fetched?.createdBy).toBe("user_alice");
  });

  it("resolves a User's display name and role by id from the user table", async () => {
    expect(await repo.getUser("user_alice")).toEqual({
      id: "user_alice",
      name: "Alice",
      role: null,
    });
    expect(await repo.getUser("user_nobody")).toBeNull();
  });

  it("returns null for an unknown Post id", async () => {
    expect(await repo.getPost("post_missing")).toBeNull();
  });
});
