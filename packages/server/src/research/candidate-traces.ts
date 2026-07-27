import { createHash, createHmac } from "node:crypto";
import { basename, resolve } from "node:path";
import type Database from "better-sqlite3";
import { CANDIDATE_OVERFETCH, DEFAULT_MAX_VECTOR_DISTANCE, MAX_LIMIT } from "../search/retrieve.js";
import {
  environmentVectorSearch,
  keywordSearch,
  vectorSearch,
  type Candidate,
  type VecCandidate,
} from "../store/queries.js";

const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type TraceSplit = "development" | "evaluation" | "provisional";

export type CandidateTrace = {
  retrievalId: string;
  postId: string;
  split: TraceSplit;
  candidateStatus: "current-candidate" | "historical-result-only";
  keywordRank: number | null;
  bm25Score: number | null;
  vectorRank: number | null;
  vectorDistance: number | null;
  environmentVectorRank: number | null;
  environmentDistance: number | null;
  retrievalLegs: Array<"keyword" | "vector" | "environment-vector">;
  threshold: {
    maxVectorDistance: number;
    vector: "pass" | "drop" | "not-present";
    environmentVector: "pass" | "drop" | "not-present";
  };
  fusedEligible: boolean;
  finalRenderedRank: number | null;
};

export type RetrievalSummary = {
  retrievalId: string;
  split: TraceSplit;
  createdAt: number;
  requestedLimit: number;
  observedResultCount: number;
  candidateCount: number;
  thresholdDroppedCount: number;
  situation?: string;
  environment?: string | null;
  repo?: string | null;
};

/** A verdict explicitly linked to the retrieval that surfaced its Post. */
export type RetrievalOutcome = {
  retrievalId: string;
  postId: string;
  eventId: string;
  verdict: "confirm" | "flag";
  reason: "incorrect" | "stale" | "duplicate" | null;
  outcomeAt: number;
};

export type CandidateTraceBundle = {
  manifest: Record<string, unknown>;
  traces: CandidateTrace[];
  summaries: RetrievalSummary[];
  outcomes: RetrievalOutcome[];
};

export type CandidateTraceOptions = {
  from: number;
  to: number;
  analysisTime: number;
  splitAt: number;
  salt: string;
  includeContent?: boolean;
  maxVectorDistance?: number;
};

type RetrievalRow = {
  id: string;
  userId: string;
  repo: string | null;
  situation: string;
  environment: string | null;
  requestedLimit: number;
  resultCount: number;
  createdAt: number;
};

type ResultRow = {
  retrievalId: string;
  postId: string;
  rank: number;
};

type OutcomeRow = RetrievalOutcome & {
  rawRetrievalId: string;
  rawPostId: string;
  rawEventId: string;
};

type CandidateAccumulator = {
  postId: string;
  keywordRank: number | null;
  bm25Score: number | null;
  vectorRank: number | null;
  vectorDistance: number | null;
  environmentVectorRank: number | null;
  environmentDistance: number | null;
};

/**
 * Re-run the current search legs against a frozen Team database without
 * writing to it. This module is research-only: production query handling does
 * not import it. The raw database is read through the existing FTS5/sqlite-vec
 * query helpers so the trace describes the actual candidate signals rather
 * than a second implementation of those queries.
 */
export async function buildCandidateTraceBundle(
  raw: Database.Database,
  embedder: { embed(text: string): Promise<number[]> },
  options: CandidateTraceOptions,
): Promise<CandidateTraceBundle> {
  validateOptions(options);
  const maxVectorDistance =
    options.maxVectorDistance ?? DEFAULT_MAX_VECTOR_DISTANCE;
  const retrievals = readRetrievals(raw, options);
  const resultRows = readResults(raw, retrievals.map((row) => row.id));
  const outcomes = readOutcomes(raw, retrievals, options);
  const resultRanks = new Map<string, Map<string, number>>();
  for (const row of resultRows) {
    const byPost = resultRanks.get(row.retrievalId) ?? new Map<string, number>();
    byPost.set(row.postId, row.rank);
    resultRanks.set(row.retrievalId, byPost);
  }

  const traces: CandidateTrace[] = [];
  const summaries: RetrievalSummary[] = [];
  const logicalSourceRows: unknown[] = [];

  for (const retrieval of retrievals) {
    const limit = clampLimit(retrieval.requestedLimit);
    const fetch = Math.min(MAX_LIMIT, limit * CANDIDATE_OVERFETCH);
    const [keyword, vectorEmbedding] = await Promise.all([
      Promise.resolve(keywordSearch(raw, retrieval.situation, fetch)),
      embedder.embed(retrieval.situation),
    ]);
    const vector = vectorSearch(raw, vectorEmbedding, fetch);
    const environment = retrieval.environment?.trim();
    const environmentVector = environment
      ? environmentVectorSearch(raw, await embedder.embed(environment), fetch)
      : [];

    const candidates = new Map<string, CandidateAccumulator>();
    addKeywordCandidates(candidates, keyword);
    addVectorCandidates(candidates, vector, "vector");
    addVectorCandidates(candidates, environmentVector, "environment");

    const split = splitFor(retrieval.createdAt, options);
    const historicalRanks = resultRanks.get(retrieval.id) ?? new Map<string, number>();
    for (const postId of historicalRanks.keys()) {
      if (!candidates.has(postId)) {
        candidates.set(postId, {
          postId,
          keywordRank: null,
          bm25Score: null,
          vectorRank: null,
          vectorDistance: null,
          environmentVectorRank: null,
          environmentDistance: null,
        });
      }
    }

    let thresholdDroppedCount = 0;
    const currentTraces: CandidateTrace[] = [];
    for (const candidate of candidates.values()) {
      const vectorDecision = thresholdDecision(candidate.vectorDistance, maxVectorDistance);
      const environmentDecision = thresholdDecision(
        candidate.environmentDistance,
        maxVectorDistance,
      );
      const keywordPresent = candidate.keywordRank !== null;
      const vectorPass = vectorDecision === "pass";
      const environmentPass = environmentDecision === "pass";
      const fusedEligible = keywordPresent || vectorPass || environmentPass;
      if (
        !fusedEligible &&
        (vectorDecision === "drop" || environmentDecision === "drop")
      ) {
        thresholdDroppedCount += 1;
      }

      currentTraces.push({
        retrievalId: pseudonym(options.salt, "retrieval", retrieval.id),
        postId: pseudonym(options.salt, "post", candidate.postId),
        split,
        candidateStatus: "current-candidate",
        keywordRank: candidate.keywordRank,
        bm25Score: candidate.bm25Score,
        vectorRank: candidate.vectorRank,
        vectorDistance: candidate.vectorDistance,
        environmentVectorRank: candidate.environmentVectorRank,
        environmentDistance: candidate.environmentDistance,
        retrievalLegs: retrievalLegs(candidate),
        threshold: {
          maxVectorDistance,
          vector: vectorDecision,
          environmentVector: environmentDecision,
        },
        fusedEligible,
        finalRenderedRank: historicalRanks.get(candidate.postId) ?? null,
      });
    }

    // A deleted/retired historical result is retained above with no current
    // leg membership. Marking it explicitly prevents a missing candidate from
    // being mistaken for a threshold drop during analysis.
    for (const trace of currentTraces) {
      if (
        trace.finalRenderedRank !== null &&
        trace.retrievalLegs.length === 0
      ) {
        trace.candidateStatus = "historical-result-only";
      }
    }

    summaries.push({
      retrievalId: pseudonym(options.salt, "retrieval", retrieval.id),
      split,
      createdAt: retrieval.createdAt,
      requestedLimit: retrieval.requestedLimit,
      observedResultCount: retrieval.resultCount,
      candidateCount: candidates.size,
      thresholdDroppedCount,
      ...(options.includeContent
        ? {
            situation: retrieval.situation,
            environment: retrieval.environment,
            repo: retrieval.repo,
          }
        : {}),
    });
    traces.push(...currentTraces);
    logicalSourceRows.push({
      retrieval,
      results: [...historicalRanks.entries()],
      candidates: [...candidates.values()],
    });
  }

  const pseudonymizedOutcomes = outcomes.map(({ rawRetrievalId, rawPostId, rawEventId, ...outcome }) => ({
    ...outcome,
    retrievalId: pseudonym(options.salt, "retrieval", rawRetrievalId),
    postId: pseudonym(options.salt, "post", rawPostId),
    eventId: pseudonym(options.salt, "event", rawEventId),
  }));

  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    policy: "crew-candidate-retrieval-traces-v1",
    interval: { from: options.from, to: options.to, analysisTime: options.analysisTime },
    split: {
      splitAt: options.splitAt,
      matureThrough: options.analysisTime - ATTRIBUTION_WINDOW_MS,
      policy:
        "development before splitAt; mature rows after splitAt are evaluation; newest seven days are provisional",
    },
    threshold: { maxVectorDistance },
    privacy: {
      rawContentIncluded: options.includeContent === true,
      identifiers: "HMAC-SHA256 pseudonyms; salt is not written",
      saltFingerprint: createHash("sha256").update(options.salt).digest("hex").slice(0, 16),
      outcomeNotesIncluded: false,
    },
    leakageControls: [
      "The source database is opened read-only and never migrated or checkpointed.",
      "Candidate traces and retrieval-id-linked outcomes are separate files.",
      "Provisional rows must not decide acceptance; recent outcomes are right-censored.",
      "Missing outcomes are unresolved, never negative relevance labels.",
      "Raw situation/environment/repo text is excluded unless --include-content is explicitly used.",
    ],
    counts: {
      retrievals: retrievals.length,
      candidateTraces: traces.length,
      summaries: summaries.length,
      outcomes: pseudonymizedOutcomes.length,
      provisionalRetrievals: summaries.filter((row) => row.split === "provisional").length,
    },
    sourceLogicalSha256: sha256(JSON.stringify({ logicalSourceRows, outcomes })),
  };

  return {
    manifest,
    traces,
    summaries,
    outcomes: pseudonymizedOutcomes,
  };
}

function readRetrievals(raw: Database.Database, options: CandidateTraceOptions): RetrievalRow[] {
  return raw
    .prepare(
      `SELECT id, user_id AS userId, repo, situation, environment,
              "limit" AS requestedLimit, result_count AS resultCount, created_at AS createdAt
         FROM retrievals
        WHERE created_at >= ? AND created_at < ?
        ORDER BY created_at, id`,
    )
    .all(options.from, options.to) as RetrievalRow[];
}

function readResults(raw: Database.Database, retrievalIds: string[]): ResultRow[] {
  if (retrievalIds.length === 0) return [];
  const placeholders = retrievalIds.map(() => "?").join(", ");
  return raw
    .prepare(
      `SELECT retrieval_id AS retrievalId, post_id AS postId, rank
         FROM retrieval_results
        WHERE retrieval_id IN (${placeholders})
        ORDER BY retrieval_id, rank`,
    )
    .all(...retrievalIds) as ResultRow[];
}

function readOutcomes(
  raw: Database.Database,
  retrievals: RetrievalRow[],
  options: CandidateTraceOptions,
): OutcomeRow[] {
  if (retrievals.length === 0) return [];
  const placeholders = retrievals.map(() => "?").join(", ");
  return raw
    .prepare(
      `SELECT r.id AS rawRetrievalId,
              rr.post_id AS rawPostId,
              pe.id AS rawEventId,
              pe.verdict AS verdict,
              pe.reason AS reason,
              pe.created_at AS outcomeAt
         FROM retrievals r
         JOIN retrieval_results rr ON rr.retrieval_id = r.id
         JOIN post_events pe
           ON pe.post_id = rr.post_id
          AND pe.created_by = r.user_id
          AND pe.created_at > r.created_at
          AND pe.created_at <= r.created_at + ?
          AND pe.created_at <= ?
          AND NOT EXISTS (
                SELECT 1
                  FROM retrieval_results rr2
                  JOIN retrievals r2 ON r2.id = rr2.retrieval_id
                 WHERE rr2.post_id = rr.post_id
                   AND r2.user_id = r.user_id
                   AND r2.created_at > r.created_at
                   AND r2.created_at < pe.created_at
              )
        WHERE r.id IN (${placeholders})
          AND pe.verdict IN ('confirm', 'flag')
        ORDER BY r.id, pe.created_at, pe.id`,
    )
    .all(ATTRIBUTION_WINDOW_MS, options.analysisTime, ...retrievals.map((row) => row.id))
    .map((row) => {
      const value = row as {
        rawRetrievalId: string;
        rawPostId: string;
        rawEventId: string;
        verdict: string;
        reason: string | null;
        outcomeAt: number;
      };
      return {
        rawRetrievalId: value.rawRetrievalId,
        rawPostId: value.rawPostId,
        rawEventId: value.rawEventId,
        retrievalId: value.rawRetrievalId,
        postId: value.rawPostId,
        eventId: value.rawEventId,
        verdict: value.verdict as RetrievalOutcome["verdict"],
        reason: value.reason as RetrievalOutcome["reason"],
        outcomeAt: value.outcomeAt,
      };
    }) as OutcomeRow[];
}

function addKeywordCandidates(
  candidates: Map<string, CandidateAccumulator>,
  rows: Candidate[],
): void {
  rows.forEach((row, index) => {
    const candidate = ensureCandidate(candidates, row.postId);
    candidate.keywordRank = index + 1;
    candidate.bm25Score = row.ftsRank;
  });
}

function addVectorCandidates(
  candidates: Map<string, CandidateAccumulator>,
  rows: VecCandidate[],
  leg: "vector" | "environment",
): void {
  rows.forEach((row, index) => {
    const candidate = ensureCandidate(candidates, row.postId);
    if (leg === "vector") {
      candidate.vectorRank = index + 1;
      candidate.vectorDistance = row.distance;
    } else {
      candidate.environmentVectorRank = index + 1;
      candidate.environmentDistance = row.distance;
    }
  });
}

function ensureCandidate(
  candidates: Map<string, CandidateAccumulator>,
  postId: string,
): CandidateAccumulator {
  const existing = candidates.get(postId);
  if (existing) return existing;
  const created: CandidateAccumulator = {
    postId,
    keywordRank: null,
    bm25Score: null,
    vectorRank: null,
    vectorDistance: null,
    environmentVectorRank: null,
    environmentDistance: null,
  };
  candidates.set(postId, created);
  return created;
}

function retrievalLegs(candidate: CandidateAccumulator): CandidateTrace["retrievalLegs"] {
  const legs: CandidateTrace["retrievalLegs"] = [];
  if (candidate.keywordRank !== null) legs.push("keyword");
  if (candidate.vectorRank !== null) legs.push("vector");
  if (candidate.environmentVectorRank !== null) legs.push("environment-vector");
  return legs;
}

function thresholdDecision(
  distance: number | null,
  maxDistance: number,
): CandidateTrace["threshold"]["vector"] {
  if (distance === null) return "not-present";
  return distance <= maxDistance ? "pass" : "drop";
}

function splitFor(createdAt: number, options: CandidateTraceOptions): TraceSplit {
  if (createdAt < options.splitAt) return "development";
  if (createdAt <= options.analysisTime - ATTRIBUTION_WINDOW_MS) return "evaluation";
  return "provisional";
}

function clampLimit(limit: number): number {
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

function pseudonym(salt: string, kind: string, value: string): string {
  return createHmac("sha256", salt).update(`${kind}\0${value}`).digest("hex").slice(0, 20);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validateOptions(options: CandidateTraceOptions): void {
  if (!(options.from < options.splitAt && options.splitAt < options.to)) {
    throw new Error("Expected from < splitAt < to");
  }
  if (options.analysisTime < options.to) {
    throw new Error("analysisTime must be at or after the cohort end");
  }
  if (options.salt.length < 16) {
    throw new Error("salt must contain at least 16 characters");
  }
  if (
    options.maxVectorDistance !== undefined &&
    (!Number.isFinite(options.maxVectorDistance) || options.maxVectorDistance < 0)
  ) {
    throw new Error("maxVectorDistance must be a finite non-negative number");
  }
}

export function writeCandidateTraceManifestSource(
  manifest: Record<string, unknown>,
  dbPath: string,
  databaseFileSha256: string,
): Record<string, unknown> {
  return {
    ...manifest,
    source: {
      file: basename(resolve(dbPath)),
      databaseFileSha256,
      authoritativeFingerprint: "manifest.sourceLogicalSha256 (rows visible through SQLite)",
    },
  };
}
