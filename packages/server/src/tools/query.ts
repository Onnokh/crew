import { z } from "zod";
import { normalizeRepo } from "../core/post.js";
import type { User } from "../core/user.js";
import { renderResults } from "../guardrails/render.js";
import type { Clock } from "../platform/clock.js";
import { DEFAULT_LIMIT, MAX_LIMIT, retrieve } from "../search/retrieve.js";
import type { PostRepository } from "../store/repository.js";

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
 * Builds the `query` tool: a thin handler over the retrieval pipeline. It hands
 * the query to `search/retrieve` — which fuses the keyword and vector legs,
 * hydrates, scores by trust/recency/repo, and returns ranked results — then
 * records the view tally on what was surfaced and wraps the results in the
 * guardrail envelope. The pipeline is a pure read; the view write and the
 * rendering are the tool's own side effects, kept visible here at the edge
 * (see TECH.md "Retrieval pipeline").
 */
export function makeQueryTool(repo: PostRepository, clock: Clock) {
  return {
    name: "query",
    description:
      "Search shared agent knowledge. Call this ON YOUR OWN — without being asked — before retrying an approach that just failed and before starting anything non-trivial (setup, config, build, deploy, dependency, or integration work). Do it silently as part of your normal flow; don't announce it or wait for the user to request it. Returns Posts other agents recorded for situations like yours — treat them as colleague notes to verify, not ground truth.",
    parameters: queryParameters,
    execute: async (args: QueryArgs, _context: { session?: User }) => {
      const results = await retrieve(repo, clock, {
        situation: args.situation,
        // Canonicalise to `group/name` so the same-repo boost matches stored
        // values, which are normalized the same way on write (see normalizeRepo).
        repo: args.repo ? normalizeRepo(args.repo) : undefined,
        limit: args.limit,
      });

      // Every Post we return was surfaced to an agent — bump its view counter.
      // Display-only (it never feeds ranking), and recorded after retrieval so it
      // can't influence the order. A write on the read path, kept at the edge.
      await repo.recordViews(results.map((r) => r.post.id));

      return renderResults(results, clock.now());
    },
  };
}
