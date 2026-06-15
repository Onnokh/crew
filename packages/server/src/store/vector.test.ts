import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, FakeEmbedder, FakeIdGen } from "../test/fakes.js";
import { seedUser } from "../test/seed-user.js";
import { migrate } from "./migrate.js";
import { pinOrCheckEmbeddingModel } from "./meta.js";
import { SqliteRepository } from "./sqlite-repository.js";

let raw: Database.Database;
let repo: SqliteRepository;

function open(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  sqliteVec.load(db);
  migrate(db);
  seedUser(db, "user_alice", "Alice");
  return db;
}

beforeEach(() => {
  raw = open();
  repo = new SqliteRepository(
    drizzle(raw),
    raw,
    new FakeClock(),
    new FakeIdGen(),
    new FakeEmbedder(),
  );
});

afterEach(() => {
  raw.close();
});

async function seed(situation: string, body = "body"): Promise<string> {
  const post = await repo.createPost({
    situation,
    body,
    environment: "Node 22",
    repo: "demo",
    createdBy: "user_alice",
  });
  return post.id;
}

describe("vectorSearch (real sqlite-vec vec0)", () => {
  it("stores an embedding per Post and finds it by vector similarity", async () => {
    const id = await seed("fastembed throws on Node 22 with onnxruntime mismatch");
    const inVec = raw
      .prepare("SELECT count(*) AS n FROM posts_vec WHERE post_id = ?")
      .get(id) as { n: number };
    expect(inVec.n).toBe(1);

    const hits = await repo.searchByVector("fastembed onnxruntime mismatch", 5);
    expect(hits.map((c) => c.postId)).toContain(id);
    // Cosine distance is a real number in [0, 2].
    expect(hits[0]!.distance).toBeGreaterThanOrEqual(0);
  });

  it("ranks a paraphrase (no shared keywords) above an unrelated Post", async () => {
    const target = await seed("fastembed throws on Node 22 onnxruntime mismatch");
    await seed("kubernetes ingress certificate renewal automation");

    // Query shares no literal keyword with the target situation/body.
    const hits = await repo.searchByVector("library crash dependency conflict", 5);
    expect(hits[0]!.postId).toBe(target);
  });

  it("excludes retired Posts from vector results", async () => {
    const id = await seed("retire me by vector");
    raw.prepare("UPDATE posts SET status = 'retired' WHERE id = ?").run(id);
    const hits = await repo.searchByVector("retire me by vector", 5);
    expect(hits.map((c) => c.postId)).not.toContain(id);
  });

  it("enforces the limit on the number of vector candidates", async () => {
    for (let i = 0; i < 6; i++) await seed(`deadlock scenario number ${i}`);
    const hits = await repo.searchByVector("deadlock scenario", 3);
    expect(hits).toHaveLength(3);
  });

  it("a failing embedder fails the write loudly and stores no Post", async () => {
    const boom = new SqliteRepository(
      drizzle(raw),
      raw,
      new FakeClock(),
      new FakeIdGen(),
      {
        modelName: "boom",
        dimensions: 384,
        embed: async () => {
          throw new Error("embed failed");
        },
      },
    );
    await expect(
      boom.createPost({
        situation: "s",
        body: "b",
        environment: "e",
        repo: "r",
        createdBy: "user_alice",
      }),
    ).rejects.toThrow("embed failed");
    const count = raw.prepare("SELECT count(*) AS n FROM posts").get() as {
      n: number;
    };
    expect(count.n).toBe(0);
  });
});

describe("pinOrCheckEmbeddingModel (startup model pin)", () => {
  it("records the model name on first boot", () => {
    pinOrCheckEmbeddingModel(raw, "fake-embedder-v1");
    const row = raw
      .prepare("SELECT value FROM meta WHERE key = 'embedding_model'")
      .get() as { value: string };
    expect(row.value).toBe("fake-embedder-v1");
  });

  it("is a no-op when the same model boots again", () => {
    pinOrCheckEmbeddingModel(raw, "fake-embedder-v1");
    expect(() => pinOrCheckEmbeddingModel(raw, "fake-embedder-v1")).not.toThrow();
  });

  it("refuses to start when the model name does not match the pin", () => {
    pinOrCheckEmbeddingModel(raw, "fake-embedder-v1");
    expect(() => pinOrCheckEmbeddingModel(raw, "some-other-model")).toThrow(
      /mismatch/i,
    );
  });
});
