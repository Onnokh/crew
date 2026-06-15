import type { PostEvent } from "../core/post-event.js";
import type { RenderNote, RenderResult } from "../guardrails/render.js";
import { MAX_NOTES } from "../guardrails/render.js";
import type { Clock } from "../platform/clock.js";
import { hydratePosts } from "../read/hydrate.js";
import type { PostRepository } from "../store/repository.js";
import { trustFromCounts } from "../trust/aggregate.js";
import { reciprocalRankFusion } from "./rrf.js";
import { finalScore } from "./score.js";

/**
 * The retrieval pipeline — the deep module that turns a query into a ranked,
 * display-ready result set. It owns the whole algorithm the `query` tool used to
 * inline: run both retrieval legs over the situation, fuse them with Reciprocal
 * Rank Fusion, hydrate the fused candidates, score each by the trust formula,
 * sort, and truncate to the requested limit (see TECH.md "Retrieval pipeline").
 *
 * Extracting it gives ranking a real test surface: the pipeline is now exercised
 * directly over an in-memory store (see retrieve.test.ts), not only through the
 * full MCP boot. The leaf functions it composes — `rrf`, `score`, `aggregate`,
 * and the recent-Note selection — are its internals; callers see only
 * {@link retrieve}.
 *
 * It is a pure read: it records no views and renders nothing. The `query` tool
 * records the view tally and wraps the result in the guardrail envelope at the
 * edge, so those side effects stay visible in the handler.
 */

/** Default number of Posts returned when the agent doesn't ask for a limit. */
export const DEFAULT_LIMIT = 5;
/** Hard cap on results, so a runaway `limit` can't flood the agent's context. */
export const MAX_LIMIT = 20;
/**
 * How many candidates to score per requested result: trust/recency can lift a
 * Post that ranked lower on pure relevance, so we score a wider pool than we
 * return. Always clamped to {@link MAX_LIMIT} so the scan stays bounded.
 */
export const CANDIDATE_OVERFETCH = 4;

/**
 * The query inputs the pipeline consumes. `repo` boosts same-repo Posts (never
 * filters). `environment` is deliberately absent: the schema accepts it but the
 * pipeline does not yet embed or match on it — only `situation` (see TECH.md).
 */
export type RetrieveInput = {
  /** The situation text to search — embedded and keyword-matched. */
  situation: string;
  /** The querying agent's repo, if known: same-repo Posts get a ranking boost. */
  repo?: string;
  /** Requested result count; clamped to [1, {@link MAX_LIMIT}] internally. */
  limit: number;
};

/**
 * Run the retrieval pipeline and return the ranked results, ready to hand to
 * `renderResults()`. Over-fetches both legs (so trust can lift a lower-relevance
 * Post into the top `limit`), fuses with RRF, hydrates, re-ranks by
 * `rrf × trust × recency × repo_boost`, then truncates. The limit is defended
 * here as well as in the tool's schema. Reads `clock.now()` once, for scoring.
 */
export async function retrieve(
  repo: PostRepository,
  clock: Clock,
  input: RetrieveInput,
): Promise<RenderResult[]> {
  const limit = clampLimit(input.limit);
  const now = clock.now();

  // Over-fetch each leg so a Post lifted by trust/recency can still reach the
  // top `limit`; capped so a runaway query can't scan the whole corpus.
  const fetch = Math.min(MAX_LIMIT, limit * CANDIDATE_OVERFETCH);
  const [keyword, vector] = await Promise.all([
    repo.searchByKeyword(input.situation, fetch),
    repo.searchByVector(input.situation, fetch),
  ]);

  // Each leg's array is already in its own relevance order, so position is rank;
  // RRF fuses them into one list with a per-candidate fused score.
  const fused = reciprocalRankFusion([
    keyword.map((c) => c.postId),
    vector.map((c) => c.postId),
  ]);
  if (fused.length === 0) return [];

  // Hydrate the fused candidates: fetch each Post, drop any that vanished between
  // search and hydrate, then resolve author + counts + events in one shared step.
  const fusedById = new Map(fused.map((f) => [f.id, f.score]));
  const posts = (
    await Promise.all(fused.map((f) => repo.getPost(f.id)))
  ).filter((p): p is NonNullable<typeof p> => p !== null);
  const hydrated = await hydratePosts(repo, posts);

  const scored = hydrated.map((h) => {
    const final = finalScore(
      {
        rrfScore: fusedById.get(h.post.id) ?? 0,
        trust: trustFromCounts(h.confirms, h.flags),
        // last_confirmed when present, else created_at — a confirm lifting
        // last_confirmed therefore lifts the Post's recency.
        recencyAnchor: h.post.lastConfirmed ?? h.post.createdAt,
        sameRepo: input.repo !== undefined && h.post.repo === input.repo,
      },
      now,
    );
    const result: RenderResult = {
      post: h.post,
      authorName: h.authorName,
      confirms: h.confirms,
      flags: h.flags,
      views: h.post.views,
      notes: recentNotes(h.events),
    };
    return { result, final };
  });

  // Re-rank by the trust-weighted final score (RRF order is only the input), then
  // keep the top `limit`. Stable: ties hold their fused order.
  scored.sort((a, b) => b.final - a.final);
  return scored.slice(0, limit).map((s) => s.result);
}

/** Clamp a possibly-out-of-range limit into [1, MAX_LIMIT]. */
function clampLimit(limit: number): number {
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

/**
 * The few most recent Note-bearing events for one Post, newest first, capped at
 * {@link MAX_NOTES}. Events arrive newest-first from hydration; we keep only the
 * ones that actually carry a Note (a bare Confirm/Flag has nothing to show).
 */
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
