import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeClock, FakeEmbedder, FakeIdGen } from "../test/fakes.js";
import { migrate } from "./migrate.js";
import { SqliteRepository } from "./sqlite-repository.js";

let raw: Database.Database;
let repo: SqliteRepository;

beforeEach(() => {
  raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  sqliteVec.load(raw);
  migrate(raw, "team");
  const db = drizzle(raw);
  repo = new SqliteRepository(
    db,
    raw,
    new FakeClock(),
    new FakeIdGen(),
    new FakeEmbedder(),
  );
});

afterEach(() => {
  raw.close();
});

async function seed(situation: string, body: string): Promise<string> {
  const post = await repo.createPost({
    situation,
    body,
    environment: "Node 22",
    repo: "demo",
    createdBy: "user_alice",
  });
  return post.id;
}

describe("keywordSearch (FTS5 + sync triggers)", () => {
  it("the insert trigger makes a new Post searchable by situation and body", async () => {
    const id = await seed(
      "fastembed throws on Node 22 with onnxruntime mismatch",
      "Pin onnxruntime-node to the version fastembed expects.",
    );

    const bySituation = await repo.searchByKeyword("onnxruntime mismatch", 5);
    expect(bySituation.map((c) => c.postId)).toContain(id);

    const byBody = await repo.searchByKeyword("pin onnxruntime-node", 5);
    expect(byBody.map((c) => c.postId)).toContain(id);
  });

  it("returns no candidates when nothing matches", async () => {
    await seed("git rebase conflict", "Use rerere to reuse resolutions.");
    const hits = await repo.searchByKeyword("kubernetes ingress tls", 5);
    expect(hits).toEqual([]);
  });

  it("ignores FTS5 operator syntax in freeform query text", async () => {
    const id = await seed("handling NEAR and AND tokens", "body text here");
    // 'NEAR'/'AND' must be treated as literal terms, not FTS5 operators.
    const hits = await repo.searchByKeyword("NEAR AND tokens", 5);
    expect(hits.map((c) => c.postId)).toContain(id);
  });

  it("enforces the limit on the number of candidates", async () => {
    for (let i = 0; i < 6; i++) {
      await seed(`deadlock scenario ${i}`, "shared keyword deadlock");
    }
    const hits = await repo.searchByKeyword("deadlock", 3);
    expect(hits).toHaveLength(3);
  });

  it("the delete trigger removes a Post from the index", async () => {
    const id = await seed("retire me keyword", "body");
    expect((await repo.searchByKeyword("retire", 5)).map((c) => c.postId)).toContain(
      id,
    );
    raw.prepare("DELETE FROM posts WHERE id = ?").run(id);
    expect(await repo.searchByKeyword("retire", 5)).toEqual([]);
  });

  it("excludes retired Posts from results", async () => {
    const id = await seed("quarantine keyword", "body");
    raw.prepare("UPDATE posts SET status = 'retired' WHERE id = ?").run(id);
    expect(await repo.searchByKeyword("quarantine", 5)).toEqual([]);
  });
});
