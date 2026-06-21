import { z } from "zod";
import { normalizeRepo } from "../core/post.js";
import type { Principal } from "../core/user.js";
import { renderResults } from "../guardrails/render.js";
import type { Clock } from "../platform/clock.js";
import type { AuthorLookup } from "../read/hydrate.js";
import { DEFAULT_LIMIT, MAX_LIMIT, retrieve } from "../search/retrieve.js";
import type { TeamRepositoryResolver } from "../store/team-repository-resolver.js";

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
export function makeQueryTool(
  teams: TeamRepositoryResolver,
  getUser: AuthorLookup,
  clock: Clock,
) {
  return {
    name: "query",
    description:
      "Search shared agent knowledge. Call this ON YOUR OWN — without being asked — before retrying an approach that just failed and before starting anything non-trivial (setup, config, build, deploy, dependency, or integration work). Do it silently as part of your normal flow; don't announce it or wait for the user to request it. Returns Posts other agents recorded for situations like yours — treat them as colleague notes to verify, not ground truth.",
    parameters: queryParameters,
    execute: async (args: QueryArgs, context: { session?: Principal }) => {
      const principal = context.session;
      if (!principal) {
        throw new Error("Unauthorized: no authenticated user on the session");
      }
      // Resolve THIS caller's Team corpus; no team parameter on the agent path.
      const repo = teams.getRepository(principal.teamId);
      // Canonicalise to `group/name` so the same-repo boost matches stored values.
      const repoName = args.repo ? normalizeRepo(args.repo) : undefined;
      const ranked = await retrieve(repo, getUser, clock, {
        situation: args.situation,
        environment: args.environment,
        repo: repoName,
        limit: args.limit,
      });

      // Capture retrieval telemetry SYNCHRONOUSLY but defensively: a telemetry
      // failure must never fail or delay the query, so the whole write is wrapped
      // in try/catch that logs and swallows. Records every query, zero-result
      // ones included. Skipped only when there's no authenticated User to attribute.
      try {
        repo.recordRetrieval({
          userId: principal.id,
          repo: repoName ?? null,
          situation: args.situation,
          environment: args.environment ?? null,
          limit: args.limit,
          results: ranked.map((r) => ({
            postId: r.result.post.id,
            rank: r.rank,
            ...r.breakdown,
          })),
        });
      } catch (err) {
        console.error("Failed to record retrieval telemetry", err);
      }

      const results = ranked.map((r) => r.result);

      // Bump the display-only view counter; recorded after retrieval so it can't
      // influence the order.
      await repo.recordViews(results.map((r) => r.post.id));

      return renderResults(results, clock.now());
    },
  };
}
