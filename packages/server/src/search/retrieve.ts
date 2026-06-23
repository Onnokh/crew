import type { PostEvent } from "../core/post-event.js";
import { normalizeRepo } from "../core/post.js";
import type { RenderNote, RenderResult } from "../guardrails/render.js";
import { MAX_NOTES } from "../guardrails/render.js";
import type { Clock } from "../platform/clock.js";
import { hydratePosts, type AuthorLookup } from "../read/hydrate.js";
import type { PostRepository } from "../store/repository.js";
import { trustFromCounts } from "../trust/aggregate.js";
import { reciprocalRankFusion } from "./rrf.js";
import { recency, repoBoost } from "./score.js";

/** Default number of Posts returned when the agent doesn't ask for a limit. */
export const DEFAULT_LIMIT = 5;
/** Hard cap on results, so a runaway `limit` can't flood the agent's context. */
export const MAX_LIMIT = 20;
/** Candidates scored per requested result, so trust can lift a lower-relevance Post. Clamped to MAX_LIMIT. */
export const CANDIDATE_OVERFETCH = 4;
/**
 * Relevance floor for the vector legs: a candidate whose cosine distance to the
 * query exceeds this is dropped before fusion. Without it, sqlite-vec KNN always
 * returns the nearest `k` rows no matter how far, so any non-empty corpus would
 * answer every query — even gibberish — and the zero-result metric could never
 * fire. RRF scores are rank-based and carry no absolute relevance, so this floor
 * is the ONLY place "not relevant enough" is decided.
 *
 * Cosine distance is `1 − cosine_similarity` (0 = identical, 1 = orthogonal). The
 * value is empirical and model-dependent — calibrate it against the pinned
 * embedding model, not the test FakeEmbedder (whose unrelated texts sit at ~1.0,
 * a wider spread than the real model's). Tune via {@link RetrieveInput.maxVectorDistance}.
 */
export const DEFAULT_MAX_VECTOR_DISTANCE = 0.65;

export type RetrieveInput = {
  situation: string;
  /** The querying agent's stack/runtime context, if known: matching environments get a ranking boost. */
  environment?: string;
  /** The querying agent's repo, if known: same-repo Posts get a ranking boost. */
  repo?: string;
  /** Requested result count; clamped to [1, MAX_LIMIT] internally. */
  limit: number;
  /**
   * Cosine-distance ceiling for the vector legs; candidates farther than this are
   * dropped before fusion. Defaults to {@link DEFAULT_MAX_VECTOR_DISTANCE}. Exposed
   * mainly so tests can pin it independently of the production default.
   */
  maxVectorDistance?: number;
};

/**
 * The per-result score breakdown ranking computes: the RRF input, the multipliers
 * applied, and their product `final`. Captured for retrieval telemetry and the
 * tuning view.
 */
export type ScoreBreakdown = {
  rrfScore: number;
  trust: number;
  recency: number;
  repoBoost: number;
  final: number;
};

/** One ranked result: the renderable Post plus its 1-based rank and score breakdown. */
export type RankedResult = {
  result: RenderResult;
  /** 1-based position in the returned list. */
  rank: number;
  breakdown: ScoreBreakdown;
};

/**
 * Run the retrieval pipeline and return the ranked results. Each result carries
 * its {@link RenderResult} plus rank/score telemetry. `getUser` resolves author
 * names from the control plane; the per-team corpus DB has no `user` table.
 */
export async function retrieve(
  repo: PostRepository,
  getUser: AuthorLookup,
  clock: Clock,
  input: RetrieveInput,
): Promise<RankedResult[]> {
  const limit = clampLimit(input.limit);
  const now = clock.now();

  const fetch = Math.min(MAX_LIMIT, limit * CANDIDATE_OVERFETCH);
  const maxDistance = input.maxVectorDistance ?? DEFAULT_MAX_VECTOR_DISTANCE;
  const environment = input.environment?.trim();
  const [keyword, vector, environmentVector] = await Promise.all([
    repo.searchByKeyword(input.situation, fetch),
    repo.searchByVector(input.situation, fetch),
    environment
      ? repo.searchByEnvironmentVector(environment, fetch)
      : Promise.resolve([]),
  ]);

  // Apply the relevance floor to the vector legs only: keyword hits are genuine
  // lexical matches, but KNN returns the nearest rows regardless of distance, so
  // those are the ones that manufacture matches out of an unrelated query. When
  // every leg comes back empty the query is a true zero-result (see telemetry).
  const fused = reciprocalRankFusion([
    keyword.map((c) => c.postId),
    vector.filter((c) => c.distance <= maxDistance).map((c) => c.postId),
    environmentVector.filter((c) => c.distance <= maxDistance).map((c) => c.postId),
  ]);
  if (fused.length === 0) return [];

  // Drop any Post that vanished between search and hydrate.
  const fusedById = new Map(fused.map((f) => [f.id, f.score]));
  const posts = (
    await Promise.all(fused.map((f) => repo.getPost(f.id)))
  ).filter((p): p is NonNullable<typeof p> => p !== null);
  const hydrated = await hydratePosts(repo, getUser, posts);

  const scored = hydrated.map((h) => {
    // Compute each multiplier explicitly so the breakdown survives, then take
    // their product as `final` (== finalScore's `rrf · trust · recency · boost`).
    const rrfScore = fusedById.get(h.post.id) ?? 0;
    const trust = trustFromCounts(h.confirms, h.flags);
    const recencyValue = recency(h.post.lastConfirmed ?? h.post.createdAt, now);
    const repoBoostValue = repoBoost(
      input.repo !== undefined && normalizeRepo(h.post.repo) === input.repo,
    );
    const final = rrfScore * trust * recencyValue * repoBoostValue;
    const result: RenderResult = {
      post: h.post,
      authorName: h.authorName,
      confirms: h.confirms,
      flags: h.flags,
      views: h.post.views,
      notes: recentNotes(h.events),
    };
    const breakdown: ScoreBreakdown = {
      rrfScore,
      trust,
      recency: recencyValue,
      repoBoost: repoBoostValue,
      final,
    };
    return { result, breakdown };
  });

  // Re-rank by final score; ties hold their fused order. Stamp the 1-based rank.
  scored.sort((a, b) => b.breakdown.final - a.breakdown.final);
  return scored
    .slice(0, limit)
    .map((s, index) => ({ result: s.result, rank: index + 1, breakdown: s.breakdown }));
}

/** Clamp a possibly-out-of-range limit into [1, MAX_LIMIT]. */
function clampLimit(limit: number): number {
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

/** The most recent Note-bearing events for one Post, newest first, capped at MAX_NOTES. */
function recentNotes(events: readonly PostEvent[]): RenderNote[] {
  const notes: RenderNote[] = [];
  for (const event of events) {
    if (event.note === null || event.note === "") continue;
    notes.push({
      verdict: event.verdict,
      createdAt: event.createdAt,
      text: event.note,
    });
    if (notes.length >= MAX_NOTES) break;
  }
  return notes;
}
