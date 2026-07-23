import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTelemetryCohorts } from "./telemetry-cohorts.js";

const DAY = 24 * 60 * 60 * 1000;
const BASE = Date.parse("2026-06-23T00:00:00Z");

let raw: Database.Database;

beforeEach(() => {
  raw = new Database(":memory:");
  raw.exec(`
    CREATE TABLE posts (
      id TEXT PRIMARY KEY,
      title TEXT,
      situation TEXT NOT NULL,
      body TEXT NOT NULL,
      environment TEXT NOT NULL,
      repo TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE retrievals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      repo TEXT,
      situation TEXT NOT NULL,
      environment TEXT,
      "limit" INTEGER NOT NULL,
      result_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE retrieval_results (
      id TEXT PRIMARY KEY,
      retrieval_id TEXT NOT NULL,
      post_id TEXT NOT NULL,
      rank INTEGER NOT NULL,
      rrf_score REAL NOT NULL,
      trust REAL NOT NULL,
      recency REAL NOT NULL,
      repo_boost REAL NOT NULL,
      final REAL NOT NULL
    );
    CREATE TABLE post_events (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      verdict TEXT NOT NULL,
      reason TEXT,
      note TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const insertPost = raw.prepare(
    `INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  );
  insertPost.run(
    "post-shared",
    "Shared fix",
    "Build fails in CI",
    "Pin the build image.",
    "Node 22",
    "git@git.indicia.nl:team/demo.git",
    "author-a",
    BASE,
  );
  insertPost.run(
    "post-never-seen",
    "Unused",
    "A second situation",
    "A second body.",
    "Node 22",
    "git@git.indicia.nl:team/demo.git",
    "author-a",
    BASE + 4 * 60 * 60 * 1000,
  );

  const insertRetrieval = raw.prepare(
    `INSERT INTO retrievals VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertRetrieval.run(
    "retrieval-first",
    "query-user",
    "team/demo",
    "Build fails in CI",
    "Node 22",
    5,
    1,
    BASE + 60 * 60 * 1000,
  );
  insertRetrieval.run(
    "retrieval-last",
    "query-user",
    "team/demo",
    "Build still fails in CI",
    "Node 22",
    5,
    1,
    BASE + 2 * 60 * 60 * 1000,
  );
  insertRetrieval.run(
    "retrieval-empty",
    "query-user",
    null,
    "Completely unrelated failure",
    null,
    5,
    0,
    BASE + 14 * 60 * 60 * 1000,
  );

  const insertResult = raw.prepare(
    `INSERT INTO retrieval_results VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`,
  );
  insertResult.run(
    "result-first",
    "retrieval-first",
    "post-shared",
    1,
    1 / 61 + 1 / 62,
    1.5,
    0.04,
  );
  insertResult.run(
    "result-last",
    "retrieval-last",
    "post-shared",
    1,
    1 / 61 + 1 / 62,
    1.5,
    0.04,
  );
  raw.prepare(`INSERT INTO post_events VALUES (?, ?, 'confirm', NULL, NULL, ?, ?)`).run(
    "event-confirm",
    "post-shared",
    "query-user",
    BASE + 3 * 60 * 60 * 1000,
  );
});

afterEach(() => raw.close());

function build(includeContent = false) {
  return buildTelemetryCohorts(raw, {
    from: BASE,
    to: BASE + DAY,
    splitAt: BASE + 12 * 60 * 60 * 1000,
    analysisTime: BASE + 10 * DAY,
    salt: "fixture-salt-is-long-enough",
    includeContent,
  });
}

describe("live telemetry cohort POC", () => {
  it("matches Crew's seven-day last-touch attribution", () => {
    const bundle = build();
    const first = bundle.retrievalInputs.find(
      (row) => row.situationLength === "Build fails in CI".length,
    )!;
    const last = bundle.retrievalInputs.find(
      (row) => row.situationLength === "Build still fails in CI".length,
    )!;
    const firstOracle = bundle.retrievalOracles.find(
      (row) => row.caseId === first.caseId,
    );
    const lastOracle = bundle.retrievalOracles.find(
      (row) => row.caseId === last.caseId,
    );

    expect(firstOracle?.converted).toBe(false);
    expect(lastOracle?.converted).toBe(true);
    expect(lastOracle?.cohorts).toContain("cross_author_confirm");
  });

  it("keeps text and verdicts out of candidate input files by default", () => {
    const bundle = build();
    expect(JSON.stringify(bundle.retrievalInputs)).not.toContain("Build fails in CI");
    expect(JSON.stringify(bundle.retrievalInputs)).not.toContain("converted");
    expect(JSON.stringify(bundle.postInputs)).not.toContain("Pin the build image");
    expect(bundle.retrievalOracles.some((row) => row.converted === true)).toBe(true);
  });

  it("marks feature-derived and outcome-derived edge cohorts separately", () => {
    const bundle = build();
    const empty = bundle.retrievalInputs.find((row) =>
      (row.cohorts as string[]).includes("zero_result"),
    )!;
    const emptyOracle = bundle.retrievalOracles.find(
      (row) => row.caseId === empty.caseId,
    )!;
    const neverSeenPost = bundle.postInputs.find((row) =>
      (row.cohorts as string[]).includes("never_retrieved"),
    );

    expect(empty.cohorts).toEqual(
      expect.arrayContaining(["missing_repo", "zero_result", "underfilled"]),
    );
    expect(emptyOracle.cohorts).toContain("structural_regression");
    expect(neverSeenPost).toBeDefined();
  });

  it("only includes raw content when explicitly requested", () => {
    const bundle = build(true);
    expect(bundle.retrievalInputs.some((row) => row.situation === "Build fails in CI")).toBe(
      true,
    );
    expect(bundle.postInputs.some((row) => row.body === "Pin the build image.")).toBe(true);
  });
});
