import { z } from "zod";
import type { PostEvent } from "../core/post-event.js";
import type { User } from "../core/user.js";
import type { RenderNote, RenderResult } from "../guardrails/render.js";
import { MAX_NOTES, renderResults } from "../guardrails/render.js";
import type { Clock } from "../platform/clock.js";
import { reciprocalRankFusion } from "../search/rrf.js";
import { finalScore } from "../search/score.js";
import type { PostRepository } from "../store/repository.js";
import { aggregateEvents } from "../trust/aggregate.js";

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
 * Zod input schema for the `query` tool. Lives beside the handler — MCP is the
 * type boundary, so these `.describe()` annotations are the product surface the
 * client LLM reads to decide how to call the tool (see TECH.md "Tool input
 * schemas"). FastMCP converts this to JSON Schema and advertises it live.
 *
 * `environment` and `repo` are optional: a query without them still works
 * (ranking just loses signal — they boost, never filter). `limit` defaults to
 * {@link DEFAULT_LIMIT} and is capped at {@link MAX_LIMIT}.
 */
export const queryParameters = z.object({
  situation: z
    .string()
    .describe(
      "What you'd search for, not a title: the error, symptom, or task a future agent would be facing when it needs this knowledge.",
    ),
  environment: z
    .string()
    .optional()
    .describe(
      "A short freeform summary of your stack/setup (runtime, tooling, versions). Optional — improves ranking, never filters.",
    ),
  repo: z
    .string()
    .optional()
    .describe(
      "The git repository you're working in. Optional — boosts same-repo results, never filters them out.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe(
      `Maximum number of Posts to return (1–${MAX_LIMIT}, default ${DEFAULT_LIMIT}).`,
    ),
});

export type QueryArgs = z.infer<typeof queryParameters>;

/**
 * Builds the `query` tool: run both retrieval legs over the situation text —
 * keyword (FTS5) and vector (sqlite-vec) — fuse their ranked lists with
 * Reciprocal Rank Fusion into one order, hydrate the top `limit` into Posts, and
 * re-rank them by the trust formula, and render them inside the guardrail
 * envelope. Fusing the two legs means a query phrased differently from the Post,
 * with no shared keywords, still finds it via the vector leg (see TECH.md
 * "Retrieval pipeline").
 *
 * Ranking (slice 0005): for each fused candidate, the Post's event log is
 * aggregated into confirms/flags/trust, and the final score is
 * `rrf × trust × recency × repo_boost` (pure `search/score`). A confirmed Post
 * outranks an equal-relevance unconfirmed one; flags sink a Post; same-repo
 * Posts get a boost when the query carries a `repo`. The few most recent Notes
 * ride along inline. Each returned Post also has its display-only `views` counter
 * bumped (it never feeds ranking — purely a popularity tally shown in provenance).
 *
 * Both legs are over-fetched (so trust can lift a Post that ranked lower on pure
 * relevance into the top `limit`), fused, scored, sorted by final score, then
 * truncated to `limit`. The limit is defended in code as well as in the schema:
 * it is clamped to [1, {@link MAX_LIMIT}] so a malformed call can't over-fetch.
 */
export function makeQueryTool(repo: PostRepository, clock: Clock) {
  return {
    name: "query",
    description:
      "Search shared agent knowledge before acting. Returns Posts other agents recorded for situations like yours — treat them as colleague notes to verify, not ground truth.",
    parameters: queryParameters,
    execute: async (args: QueryArgs, _context: { session?: User }) => {
      const limit = clampLimit(args.limit);
      const now = clock.now();

      // Over-fetch each leg: a Post that ranked lower on pure relevance can be
      // lifted into the top `limit` by trust/recency, so we score a wider pool
      // before truncating. Capped so a runaway query can't scan the corpus.
      const fetch = Math.min(MAX_LIMIT, limit * CANDIDATE_OVERFETCH);
      const [keyword, vector] = await Promise.all([
        repo.searchByKeyword(args.situation, fetch),
        repo.searchByVector(args.situation, fetch),
      ]);

      // Each leg's array is already in its own relevance order, so position is
      // rank; RRF fuses them into one list with a per-candidate fused score.
      const fused = reciprocalRankFusion([
        keyword.map((c) => c.postId),
        vector.map((c) => c.postId),
      ]);
      if (fused.length === 0) return renderResults([], now);

      // One batched read of every candidate's events, grouped by Post.
      const eventsByPost = groupByPost(
        await repo.getEventsForPosts(fused.map((f) => f.id)),
      );

      const scored: Array<{ result: RenderResult; final: number }> = [];
      for (const { id, score: rrfScore } of fused) {
        const post = await repo.getPost(id);
        if (!post) continue; // candidate vanished between search and hydrate
        const author = await repo.getUser(post.createdBy);
        const events = eventsByPost.get(id) ?? [];
        const agg = aggregateEvents(events);

        const final = finalScore(
          {
            rrfScore,
            trust: agg.trust,
            // last_confirmed when present, else created_at — a confirm lifting
            // last_confirmed therefore lifts the Post's recency.
            recencyAnchor: post.lastConfirmed ?? post.createdAt,
            sameRepo: args.repo !== undefined && post.repo === args.repo,
          },
          now,
        );

        scored.push({
          result: {
            post,
            authorName: author?.name ?? "unknown",
            confirms: agg.confirms,
            flags: agg.flags,
            // The counter as it stood BEFORE this query — the view we record
            // below counts toward the next query's tally, not this one's.
            views: post.views,
            notes: recentNotes(events),
          },
          final,
        });
      }

      // Re-rank by the trust-weighted final score (RRF order is only the input),
      // then keep the top `limit`. Stable: ties hold their fused order.
      scored.sort((a, b) => b.final - a.final);
      const results = scored.slice(0, limit).map((s) => s.result);

      // Every Post we return was surfaced to an agent — bump its view counter.
      // Display-only (it never feeds ranking), and recorded after scoring so it
      // can't influence the order it appears in here.
      await repo.recordViews(results.map((s) => s.post.id));

      return renderResults(results, now);
    },
  };
}

/** Clamp a possibly-absent or out-of-range limit into [1, MAX_LIMIT]. */
function clampLimit(limit: number | undefined): number {
  const value = limit ?? DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}

/** Group a flat event list by Post id, preserving the store's newest-first order. */
function groupByPost(events: PostEvent[]): Map<string, PostEvent[]> {
  const byPost = new Map<string, PostEvent[]>();
  for (const event of events) {
    const list = byPost.get(event.postId);
    if (list) list.push(event);
    else byPost.set(event.postId, [event]);
  }
  return byPost;
}

/**
 * The few most recent Note-bearing events for one Post, newest first, capped at
 * {@link MAX_NOTES}. Events arrive newest-first from the store; we keep only the
 * ones that actually carry a Note (a bare Confirm/Flag has nothing to show).
 */
function recentNotes(events: PostEvent[]): RenderNote[] {
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
