import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../store/migrate.js";
import { SqliteRepository } from "../store/sqlite-repository.js";
import { FakeClock, FakeEmbedder, FakeIdGen } from "../test/fakes.js";
import { buildCandidateTraceBundle } from "./candidate-traces.js";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BASE = 1_700_000_000_000;
const SALT = "candidate-trace-test-salt";

let raw: Database.Database;
let clock: FakeClock;
let repo: SqliteRepository;

beforeEach(() => {
  raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  sqliteVec.load(raw);
  migrate(raw, "team");
  clock = new FakeClock(BASE);
  repo = new SqliteRepository(
    drizzle(raw),
    raw,
    clock,
    new FakeIdGen(),
    new FakeEmbedder(),
  );
});

afterEach(() => raw.close());

async function post(situation: string, environment = "Node 22"): Promise<string> {
  const created = await repo.createPost({
    situation,
    body: "Keep the verified fix.",
    environment,
    repo: "demo/project",
    createdBy: "user_alice",
  });
  return created.id;
}

function options(overrides: Partial<Parameters<typeof buildCandidateTraceBundle>[2]> = {}) {
  return {
    from: BASE,
    to: BASE + 4 * DAY,
    analysisTime: BASE + 10 * DAY,
    splitAt: BASE + DAY,
    salt: SALT,
    maxVectorDistance: 0.001,
    ...overrides,
  };
}

describe("candidate retrieval trace research adapter", () => {
  it("captures leg membership, BM25/vector signals, threshold decisions, and rendered rank", async () => {
    const matched = await post("database connection timeout");
    await post("unrelated kubernetes pod eviction", "Kubernetes 1.29");

    repo.recordRetrieval({
      userId: "user_alice",
      repo: "demo/project",
      situation: "database connection timeout",
      environment: "Node 22",
      limit: 5,
      results: [
        {
          postId: matched,
          rank: 1,
          rrfScore: 1 / 61,
          trust: 1,
          recency: 1,
          repoBoost: 1.5,
          final: 1 / 61,
        },
      ],
    });

    const bundle = await buildCandidateTraceBundle(raw, new FakeEmbedder(), options());
    const rendered = bundle.traces.find((trace) => trace.finalRenderedRank === 1)!;
    const dropped = bundle.traces.find(
      (trace) => trace.finalRenderedRank === null && trace.threshold.vector === "drop",
    )!;

    expect(rendered.keywordRank).toBe(1);
    expect(rendered.bm25Score).toEqual(expect.any(Number));
    expect(rendered.vectorRank).toBe(1);
    expect(rendered.vectorDistance).toEqual(expect.any(Number));
    expect(rendered.retrievalLegs).toEqual(
      expect.arrayContaining(["keyword", "vector", "environment-vector"]),
    );
    expect(rendered.threshold.vector).toBe("pass");
    expect(rendered.finalRenderedRank).toBe(1);
    expect(dropped.retrievalLegs).toEqual(expect.arrayContaining(["vector"]));
    expect(dropped.fusedEligible).toBe(false);
    expect(bundle.summaries[0]!.thresholdDroppedCount).toBeGreaterThanOrEqual(1);
  });

  it("links outcomes to the last-touch retrieval id without exposing raw identifiers", async () => {
    const id = await post("database connection timeout");
    const result = {
      postId: id,
      rank: 1,
      rrfScore: 1,
      trust: 1,
      recency: 1,
      repoBoost: 1,
      final: 1,
    };

    repo.recordRetrieval({
      userId: "user_alice",
      repo: null,
      situation: "database connection timeout",
      environment: null,
      limit: 1,
      results: [result],
    });
    clock.advance(HOUR);
    repo.recordRetrieval({
      userId: "user_alice",
      repo: null,
      situation: "database connection timeout again",
      environment: null,
      limit: 1,
      results: [result],
    });
    clock.advance(HOUR);
    await repo.recordEvent({
      postId: id,
      verdict: "confirm",
      createdBy: "user_alice",
    });

    const bundle = await buildCandidateTraceBundle(raw, new FakeEmbedder(), options());
    expect(bundle.outcomes).toHaveLength(1);
    expect(bundle.outcomes[0]!.verdict).toBe("confirm");
    expect(bundle.outcomes[0]!.retrievalId).toBe(bundle.summaries[1]!.retrievalId);
    expect(bundle.outcomes[0]!.postId).toBe(
      bundle.traces.find((trace) => trace.finalRenderedRank === 1)!.postId,
    );

    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain("retrieval_1");
    expect(serialized).not.toContain("post_1");
    expect(serialized).not.toContain("database connection timeout");
    expect(serialized).not.toContain("note");
  });

  it("marks the newest seven-day slice provisional and keeps content opt-in", async () => {
    await post("database connection timeout");
    clock.set(BASE + 10 * DAY);
    repo.recordRetrieval({
      userId: "user_alice",
      repo: "demo/project",
      situation: "database connection timeout",
      environment: "Node 22",
      limit: 1,
      results: [],
    });

    const bundle = await buildCandidateTraceBundle(raw, new FakeEmbedder(), options({
      to: BASE + 12 * DAY,
      analysisTime: BASE + 12 * DAY,
      includeContent: true,
    }));
    expect(bundle.summaries[0]!.split).toBe("provisional");
    expect(bundle.summaries[0]!.situation).toBe("database connection timeout");
    expect(bundle.manifest).toMatchObject({
      privacy: { rawContentIncluded: true },
      split: { policy: expect.stringContaining("provisional") },
    });
  });
});
