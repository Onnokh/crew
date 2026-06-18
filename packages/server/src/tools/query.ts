import { z } from "zod";
import { normalizeRepo } from "../core/post.js";
import type { User } from "../core/user.js";
import { renderResults } from "../guardrails/render.js";
import type { Clock } from "../platform/clock.js";
import { DEFAULT_LIMIT, MAX_LIMIT, retrieve } from "../search/retrieve.js";
import type { PostRepository } from "../store/repository.js";

/**
 * Zod input schema for the `query` tool. The `.describe()` annotations are the
 * surface the client LLM reads. `environment` and `repo` are optional (they
 * boost ranking, never filter); `limit` defaults to {@link DEFAULT_LIMIT} and
 * caps at {@link MAX_LIMIT}.
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
 * Builds the `query` tool: a thin handler over the retrieval pipeline. Hands the
 * query to `search/retrieve`, records the view tally on what was surfaced, and
 * wraps the results in the guardrail envelope.
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
        // Canonicalise to `group/name` so the same-repo boost matches stored values.
        repo: args.repo ? normalizeRepo(args.repo) : undefined,
        limit: args.limit,
      });

      // Bump the display-only view counter; recorded after retrieval so it can't
      // influence the order.
      await repo.recordViews(results.map((r) => r.post.id));

      return renderResults(results, clock.now());
    },
  };
}
