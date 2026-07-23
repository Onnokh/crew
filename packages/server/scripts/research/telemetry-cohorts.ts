import { createHash, createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import Database from "better-sqlite3";
import { taskBands, taskFingerprint } from "./task-fingerprint.js";

const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SINGLE_LEG_MAX_RRF = 1 / 61;

type CohortOptions = {
  from: number;
  to: number;
  analysisTime: number;
  splitAt: number;
  salt: string;
  includeContent?: boolean;
  representativeRetrievals?: number;
  representativePosts?: number;
};

type JoinedResult = {
  retrievalId: string;
  userId: string;
  retrievalRepo: string | null;
  situation: string;
  environment: string | null;
  requestedLimit: number;
  resultCount: number;
  retrievalCreatedAt: number;
  postId: string | null;
  rank: number | null;
  rrfScore: number | null;
    repoBoost: number | null;
    postAuthor: string | null;
    confirmed: number | null;
  flagged: number | null;
};

type PostRow = {
  id: string;
  title: string | null;
  situation: string;
  body: string;
  environment: string;
  repo: string;
  status: string;
  createdBy: string;
  createdAt: number;
};

type EventCount = {
  postId: string;
  confirms: number;
  flags: number;
};

type RetrievalBuild = {
  id: string;
  userId: string;
  repo: string | null;
  situation: string;
  environment: string | null;
  requestedLimit: number;
  resultCount: number;
  createdAt: number;
  results: Array<{
    postId: string;
    rank: number;
    sameRepo: boolean;
    multiLeg: boolean;
    deleted: boolean;
    postAuthor: string | null;
    retrievalCreatedAt: number;
    confirmed: boolean;
    flagged: boolean;
  }>;
};

type PostExposure = RetrievalBuild["results"][number] & {
  queryUser: string;
};

export type TelemetryCohortBundle = {
  manifest: Record<string, unknown>;
  retrievalInputs: Array<Record<string, unknown>>;
  retrievalOracles: Array<Record<string, unknown>>;
  postInputs: Array<Record<string, unknown>>;
  postOracles: Array<Record<string, unknown>>;
};

function pseudonym(salt: string, kind: string, value: string): string {
  return createHmac("sha256", salt).update(`${kind}\0${value}`).digest("hex").slice(0, 20);
}

function contentFingerprint(salt: string, value: string): string {
  return createHmac("sha256", salt).update(`content\0${value}`).digest("hex");
}

function quartile(value: number, boundaries: readonly number[]): number {
  if (value <= (boundaries[0] ?? value)) return 1;
  if (value <= (boundaries[1] ?? value)) return 2;
  if (value <= (boundaries[2] ?? value)) return 3;
  return 4;
}

function quartileBoundaries(values: readonly number[]): number[] {
  if (values.length === 0) return [0, 0, 0];
  const sorted = [...values].sort((a, b) => a - b);
  return [0.25, 0.5, 0.75].map(
    (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]!,
  );
}

function splitFor(createdAt: number, options: CohortOptions): "development" | "evaluation" | "provisional" {
  if (createdAt < options.splitAt) return "development";
  if (createdAt <= options.analysisTime - DEFAULT_WINDOW_MS) return "evaluation";
  return "provisional";
}

function stableStratifiedIds(
  items: ReadonlyArray<{ id: string; stratum: string }>,
  cap: number,
): Set<string> {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const group = groups.get(item.stratum) ?? [];
    group.push(item.id);
    groups.set(item.stratum, group);
  }
  for (const group of groups.values()) group.sort();

  const selected = new Set<string>();
  const keys = [...groups.keys()].sort();
  for (let offset = 0; selected.size < cap; offset++) {
    let added = false;
    for (const key of keys) {
      const id = groups.get(key)?.[offset];
      if (id === undefined) continue;
      selected.add(id);
      added = true;
      if (selected.size >= cap) break;
    }
    if (!added) break;
  }
  return selected;
}

function countTags(rows: ReadonlyArray<{ cohorts: string[] }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const cohort of row.cohorts) counts[cohort] = (counts[cohort] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Derive benchmark inputs and sealed outcome oracles from immutable Crew telemetry.
 *
 * Inputs and oracles are deliberately separate. Candidate prompt/ranking strategies
 * consume only `*-inputs.jsonl`; the evaluator joins `*-oracles.jsonl` by case id.
 */
export function buildTelemetryCohorts(
  raw: Database.Database,
  options: CohortOptions,
): TelemetryCohortBundle {
  if (!(options.from < options.splitAt && options.splitAt < options.to)) {
    throw new Error("Expected from < splitAt < to");
  }
  if (options.analysisTime < options.to) {
    throw new Error("analysisTime must be at or after the cohort end");
  }
  if (options.salt.length < 16) {
    throw new Error("salt must contain at least 16 characters");
  }

  const joined = raw
    .prepare(
      `SELECT r.id AS retrievalId,
              r.user_id AS userId,
              r.repo AS retrievalRepo,
              r.situation AS situation,
              r.environment AS environment,
              r."limit" AS requestedLimit,
              r.result_count AS resultCount,
              r.created_at AS retrievalCreatedAt,
              rr.post_id AS postId,
              rr.rank AS rank,
              rr.rrf_score AS rrfScore,
              rr.repo_boost AS repoBoost,
              p.created_by AS postAuthor,
              CASE WHEN rr.post_id IS NULL THEN 0 ELSE EXISTS (
                SELECT 1
                  FROM post_events pe
                 WHERE pe.post_id = rr.post_id
                   AND pe.verdict = 'confirm'
                   AND pe.created_by = r.user_id
                   AND pe.created_at > r.created_at
                   AND pe.created_at <= r.created_at + ?
                   AND NOT EXISTS (
                     SELECT 1
                       FROM retrieval_results rr2
                       JOIN retrievals r2 ON r2.id = rr2.retrieval_id
                      WHERE rr2.post_id = rr.post_id
                        AND r2.user_id = r.user_id
                        AND r2.created_at > r.created_at
                        AND r2.created_at < pe.created_at
                   )
              ) END AS confirmed,
              CASE WHEN rr.post_id IS NULL THEN 0 ELSE EXISTS (
                SELECT 1
                  FROM post_events pe
                 WHERE pe.post_id = rr.post_id
                   AND pe.verdict = 'flag'
                   AND pe.created_by = r.user_id
                   AND pe.created_at > r.created_at
                   AND pe.created_at <= r.created_at + ?
                   AND NOT EXISTS (
                     SELECT 1
                       FROM retrieval_results rr2
                       JOIN retrievals r2 ON r2.id = rr2.retrieval_id
                      WHERE rr2.post_id = rr.post_id
                        AND r2.user_id = r.user_id
                        AND r2.created_at > r.created_at
                        AND r2.created_at < pe.created_at
                   )
              ) END AS flagged
         FROM retrievals r
         LEFT JOIN retrieval_results rr ON rr.retrieval_id = r.id
         LEFT JOIN posts p ON p.id = rr.post_id
        WHERE r.created_at >= ?
          AND r.created_at < ?
        ORDER BY r.created_at, r.id, rr.rank`,
    )
    .all(DEFAULT_WINDOW_MS, DEFAULT_WINDOW_MS, options.from, options.to) as JoinedResult[];

  const retrievals = new Map<string, RetrievalBuild>();
  for (const row of joined) {
    let retrieval = retrievals.get(row.retrievalId);
    if (retrieval === undefined) {
      retrieval = {
        id: row.retrievalId,
        userId: row.userId,
        repo: row.retrievalRepo,
        situation: row.situation,
        environment: row.environment,
        requestedLimit: row.requestedLimit,
        resultCount: row.resultCount,
        createdAt: row.retrievalCreatedAt,
        results: [],
      };
      retrievals.set(row.retrievalId, retrieval);
    }
    if (row.postId !== null && row.rank !== null) {
      retrieval.results.push({
        postId: row.postId,
        rank: row.rank,
        sameRepo: (row.repoBoost ?? 1) > 1,
        multiLeg: (row.rrfScore ?? 0) > SINGLE_LEG_MAX_RRF + Number.EPSILON,
        deleted: row.postAuthor === null,
        postAuthor: row.postAuthor,
        retrievalCreatedAt: row.retrievalCreatedAt,
        confirmed: row.confirmed === 1,
        flagged: row.flagged === 1,
      });
    }
  }

  const retrievalRows = [...retrievals.values()];
  const situationBoundaries = quartileBoundaries(retrievalRows.map((row) => row.situation.length));
  const representativeRetrievalIds = stableStratifiedIds(
    retrievalRows.map((row) => ({
      id: pseudonym(options.salt, "retrieval", row.id),
      stratum: [
        splitFor(row.createdAt, options),
        row.repo === null ? "no-repo" : "repo",
        row.environment === null ? "no-env" : "env",
        quartile(row.situation.length, situationBoundaries),
        row.requestedLimit,
      ].join("|"),
    })),
    options.representativeRetrievals ?? 64,
  );

  const retrievalInputs: Array<Record<string, unknown>> = [];
  const retrievalOracles: Array<Record<string, unknown>> = [];
  for (const row of retrievalRows) {
    const caseId = pseudonym(options.salt, "retrieval", row.id);
    const userId = pseudonym(options.salt, "user", row.userId);
    const repoId = row.repo === null ? null : pseudonym(options.salt, "repo", row.repo);
    const lengthQuartile = quartile(row.situation.length, situationBoundaries);
    const lowConfidence = row.results.filter((result) => !result.sameRepo && !result.multiLeg);
    const confirmed = row.results.filter((result) => result.confirmed);
    const flagged = row.results.filter((result) => result.flagged);
    const inputCohorts: string[] = [];
    if (representativeRetrievalIds.has(caseId)) inputCohorts.push("representative");
    if (row.repo === null) inputCohorts.push("missing_repo");
    if (row.resultCount === 0) inputCohorts.push("zero_result");
    if (row.resultCount < row.requestedLimit) inputCohorts.push("underfilled");
    if (row.results[0] !== undefined && !row.results[0].sameRepo && !row.results[0].multiLeg) {
      inputCohorts.push("top_result_low_confidence");
    }
    if (row.results.length > 0 && lowConfidence.length / row.results.length >= 0.8) {
      inputCohorts.push("low_confidence_surface");
    }

    retrievalInputs.push({
      caseId,
      split: splitFor(row.createdAt, options),
      createdAt: row.createdAt,
      userId,
      repoId,
      hasEnvironment: row.environment !== null && row.environment.trim() !== "",
      situationLength: row.situation.length,
      situationLengthQuartile: lengthQuartile,
      requestedLimit: row.requestedLimit,
      observedResultCount: row.resultCount,
      resultSignals: row.results.map((result) => ({
        postId: pseudonym(options.salt, "post", result.postId),
        rank: result.rank,
        sameRepo: result.sameRepo,
        multiLeg: result.multiLeg,
        deleted: result.deleted,
      })),
      ...(options.includeContent
        ? {
            situation: row.situation,
            environment: row.environment,
            repo: row.repo,
          }
        : { situationFingerprint: contentFingerprint(options.salt, row.situation) }),
      taskFingerprint: taskFingerprint(options.salt, row.situation),
      taskBands: taskBands(options.salt, row.situation),
      cohorts: inputCohorts,
    });

    const oracleCohorts: string[] = [];
    if (confirmed.length > 0) oracleCohorts.push("confirmed");
    if (flagged.length > 0) oracleCohorts.push("flagged");
    if (confirmed.some((result) => result.rank >= 6)) oracleCohorts.push("lower_rank_confirm");
    if (
      confirmed.some(
        (result) => result.postAuthor !== null && result.postAuthor !== row.userId,
      )
    ) {
      oracleCohorts.push("cross_author_confirm");
    }
    if (
      row.results.some((result) => result.deleted) ||
      row.resultCount === 0 ||
      row.resultCount < row.requestedLimit
    ) {
      oracleCohorts.push("structural_regression");
    }
    if (
      row.results.length > 0 &&
      lowConfidence.length / row.results.length >= 0.8 &&
      confirmed.length === 0 &&
      flagged.length === 0
    ) {
      oracleCohorts.push("unresolved_low_confidence");
    }
    retrievalOracles.push({
      caseId,
      outcomeComplete: row.createdAt <= options.analysisTime - DEFAULT_WINDOW_MS,
      converted: confirmed.length > 0,
      flagged: flagged.length > 0,
      confirmedPostIds: confirmed.map((result) =>
        pseudonym(options.salt, "post", result.postId),
      ),
      flaggedPostIds: flagged.map((result) =>
        pseudonym(options.salt, "post", result.postId),
      ),
      cohorts: oracleCohorts,
    });
  }

  const postRows = raw
    .prepare(
      `SELECT DISTINCT p.id, p.title, p.situation, p.body, p.environment, p.repo,
                       p.status, p.created_by AS createdBy, p.created_at AS createdAt
         FROM posts p
        WHERE p.created_at < ?
          AND (
            p.created_at >= ?
            OR EXISTS (
              SELECT 1
                FROM retrieval_results rr
                JOIN retrievals r ON r.id = rr.retrieval_id
               WHERE rr.post_id = p.id
                 AND r.created_at >= ?
                 AND r.created_at < ?
            )
          )
        ORDER BY p.created_at, p.id`,
    )
    .all(options.to, options.from, options.from, options.to) as PostRow[];
  const eventCounts = raw
    .prepare(
      `SELECT pe.post_id AS postId,
              SUM(pe.verdict = 'confirm') AS confirms,
              SUM(pe.verdict = 'flag') AS flags
         FROM post_events pe
        WHERE pe.created_at >= ?
          AND pe.created_at < ?
        GROUP BY pe.post_id
        ORDER BY pe.post_id`,
    )
    .all(options.from, options.analysisTime) as EventCount[];
  const eventCountByPost = new Map(eventCounts.map((row) => [row.postId, row]));
  const resultByPost = new Map<string, PostExposure[]>();
  for (const retrieval of retrievalRows) {
    for (const result of retrieval.results) {
      const rows = resultByPost.get(result.postId) ?? [];
      rows.push({ ...result, queryUser: retrieval.userId });
      resultByPost.set(result.postId, rows);
    }
  }
  const bodyBoundaries = quartileBoundaries(postRows.map((post) => post.body.length));
  const exposureCounts = postRows.map((post) => resultByPost.get(post.id)?.length ?? 0);
  const exposureP90 = [...exposureCounts].sort((a, b) => a - b)[
    Math.min(exposureCounts.length - 1, Math.floor(exposureCounts.length * 0.9))
  ] ?? 0;
  const representativePostIds = stableStratifiedIds(
    postRows.map((post) => ({
      id: pseudonym(options.salt, "post", post.id),
      stratum: [
        splitFor(post.createdAt, options),
        quartile(post.body.length, bodyBoundaries),
        post.status,
      ].join("|"),
    })),
    options.representativePosts ?? 48,
  );

  const postInputs: Array<Record<string, unknown>> = [];
  const postOracles: Array<Record<string, unknown>> = [];
  for (const post of postRows) {
    const caseId = pseudonym(options.salt, "post", post.id);
    const exposureRows = resultByPost.get(post.id) ?? [];
    const events = eventCountByPost.get(post.id) ?? { postId: post.id, confirms: 0, flags: 0 };
    const inputCohorts: string[] = [];
    if (representativePostIds.has(caseId)) inputCohorts.push("representative");
    if (exposureRows.length === 0) inputCohorts.push("never_retrieved");
    if (post.status !== "active") inputCohorts.push("retired");

    postInputs.push({
      caseId,
      split: splitFor(post.createdAt, options),
      createdAt: post.createdAt,
      authorId: pseudonym(options.salt, "user", post.createdBy),
      repoId: pseudonym(options.salt, "repo", post.repo),
      status: post.status,
      titleLength: post.title?.length ?? 0,
      situationLength: post.situation.length,
      bodyLength: post.body.length,
      bodyLengthQuartile: quartile(post.body.length, bodyBoundaries),
      environmentLength: post.environment.length,
      ...(options.includeContent
        ? {
            title: post.title,
            situation: post.situation,
            body: post.body,
            environment: post.environment,
            repo: post.repo,
          }
        : {
            contentFingerprint: contentFingerprint(
              options.salt,
              [post.title, post.situation, post.body, post.environment].join("\0"),
            ),
          }),
      cohorts: inputCohorts,
    });

    const attributedConfirms = exposureRows.filter((row) => row.confirmed);
    const attributedFlags = exposureRows.filter((row) => row.flagged);
    const oracleCohorts: string[] = [];
    if (attributedConfirms.length > 0) oracleCohorts.push("attributed_confirm");
    if (attributedFlags.length > 0 || events.flags > 0) oracleCohorts.push("flagged");
    if (
      attributedConfirms.some(
        (row) => row.queryUser !== post.createdBy,
      )
    ) {
      oracleCohorts.push("cross_author_confirm");
    }
    if (exposureRows.length >= exposureP90 && attributedConfirms.length === 0) {
      oracleCohorts.push("high_exposure_unresolved");
    }
    postOracles.push({
      caseId,
      outcomeComplete:
        post.createdAt <= options.analysisTime - DEFAULT_WINDOW_MS &&
        exposureRows.every(
          (row) => row.retrievalCreatedAt <= options.analysisTime - DEFAULT_WINDOW_MS,
        ),
      exposures: exposureRows.length,
      attributedConfirms: attributedConfirms.length,
      attributedFlags: attributedFlags.length,
      directConfirms: events.confirms,
      directFlags: events.flags,
      cohorts: oracleCohorts,
    });
  }

  const retrievalInputRows = retrievalInputs as Array<{ cohorts: string[] }>;
  const retrievalOracleRows = retrievalOracles as Array<{ cohorts: string[] }>;
  const postInputRows = postInputs as Array<{ cohorts: string[] }>;
  const postOracleRows = postOracles as Array<{ cohorts: string[] }>;
  return {
    manifest: {
      schemaVersion: 1,
      policy: "crew-live-telemetry-cohorts-v1",
      interval: { from: options.from, to: options.to, analysisTime: options.analysisTime },
      split: {
        splitAt: options.splitAt,
        matureThrough: options.analysisTime - DEFAULT_WINDOW_MS,
        policy: "development before splitAt; mature rows after splitAt are evaluation; newest seven days are provisional",
      },
      privacy: {
        rawContentIncluded: options.includeContent === true,
        identifiers: "HMAC-SHA256 pseudonyms; salt is not written",
        saltFingerprint: createHash("sha256").update(options.salt).digest("hex").slice(0, 16),
        eventNotesIncluded: false,
      },
      leakageControls: [
        "Inputs and outcome oracles are separate files.",
        "Candidate strategies must not read oracle files.",
        "Provisional outcomes must not decide acceptance.",
        "Freeze source hash, interval, split, and fixture files before testing.",
        "Treat missing feedback and high-exposure-unresolved as unresolved, never negative.",
      ],
      counts: {
        retrievals: retrievalInputs.length,
        posts: postInputs.length,
        retrievalInputCohorts: countTags(retrievalInputRows),
        retrievalOracleCohorts: countTags(retrievalOracleRows),
        postInputCohorts: countTags(postInputRows),
        postOracleCohorts: countTags(postOracleRows),
      },
      sourceLogicalSha256: createHash("sha256")
        .update(JSON.stringify({ joined, postRows, eventCounts }))
        .digest("hex"),
    },
    retrievalInputs,
    retrievalOracles,
    postInputs,
    postOracles,
  };
}

function parseTime(value: string | undefined, name: string): number {
  if (value === undefined) throw new Error(`Missing --${name}`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid --${name}: ${value}`);
  return parsed;
}

function parseArgs(argv: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index];
    if (!key?.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    if (key === "--include-content") {
      values.set("include-content", "true");
      continue;
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`Missing value for ${key}`);
    values.set(key.slice(2), value);
  }
  return values;
}

function writeJsonl(path: string, rows: ReadonlyArray<Record<string, unknown>>): void {
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

export function runCli(argv: readonly string[]): void {
  const args = parseArgs(argv);
  const dbPath = resolve(args.get("db") ?? "");
  const outDir = resolve(args.get("out") ?? "");
  const salt = args.get("salt") ?? process.env.CREW_COHORT_SALT ?? "";
  if (dbPath === resolve("")) throw new Error("Missing --db");
  if (outDir === resolve("")) throw new Error("Missing --out");

  const raw = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const bundle = buildTelemetryCohorts(raw, {
      from: parseTime(args.get("from"), "from"),
      to: parseTime(args.get("to"), "to"),
      analysisTime: parseTime(args.get("analysis-time"), "analysis-time"),
      splitAt: parseTime(args.get("split-at"), "split-at"),
      salt,
      includeContent: args.get("include-content") === "true",
    });
    bundle.manifest.source = {
      file: basename(dbPath),
      databaseFileSha256: createHash("sha256").update(readFileSync(dbPath)).digest("hex"),
      authoritativeFingerprint:
        "manifest.sourceLogicalSha256 (includes rows visible through SQLite WAL)",
    };
    mkdirSync(outDir, { recursive: true });
    writeFileSync(`${outDir}/manifest.json`, `${JSON.stringify(bundle.manifest, null, 2)}\n`);
    writeJsonl(`${outDir}/retrieval-inputs.jsonl`, bundle.retrievalInputs);
    writeJsonl(`${outDir}/retrieval-oracles.jsonl`, bundle.retrievalOracles);
    writeJsonl(`${outDir}/post-inputs.jsonl`, bundle.postInputs);
    writeJsonl(`${outDir}/post-oracles.jsonl`, bundle.postOracles);
    process.stdout.write(`${JSON.stringify(bundle.manifest, null, 2)}\n`);
  } finally {
    raw.close();
  }
}

if (process.argv[1]?.endsWith("telemetry-cohorts.ts")) {
  runCli(process.argv.slice(2));
}
