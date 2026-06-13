import { z } from "zod";
import type { User } from "../core/user.js";
import { scanPost } from "../guardrails/scan.js";
import type { PostRepository } from "../store/repository.js";

/**
 * Zod input schema for the `post` tool. Lives beside the handler — MCP is the
 * type boundary resolved at runtime, so these `.describe()` annotations are the
 * product surface the client LLM reads to decide how to call the tool (see
 * TECH.md "Tool input schemas"). Every field carries a description; all four
 * are required because environment and repo are part of the artifact, not
 * optional hints (unlike on `query`).
 */
export const postParameters = z.object({
  situation: z
    .string()
    .min(1)
    .describe(
      "The question a future agent would search for, not a title: the error, symptom, or task they'd be facing — or the 'how do we do X here' they'd be asking — when this knowledge applies. This is the primary retrieval key; write it the way a future agent would phrase the problem, in English.",
    ),
  body: z
    .string()
    .min(1)
    .describe(
      "The answer to that question — what to know or do once the situation matches. Be concrete and self-contained: the fix, the working command, the reason, or the convention/pattern to follow. Not a restatement of the situation.",
    ),
  environment: z
    .string()
    .min(1)
    .describe(
      "A short freeform summary of the stack/setup this was learned in (runtime, framework, tooling, versions). Compared fuzzily against a querying agent's environment, so include the versions that mattered. Required — it is part of the Post.",
    ),
  repo: z
    .string()
    .min(1)
    .describe(
      "The git repository this originated from (e.g. the remote slug). Used to boost same-repo results and label cross-repo ones; never filters. Required — capture it from the current git remote.",
    ),
});

export type PostArgs = z.infer<typeof postParameters>;

/**
 * Builds the `post` tool: validate input, attribute it to the authenticated
 * User resolved from the bearer token (`context.session`), persist a Post via
 * the repository, and confirm back with the new id. The repository stamps the
 * id and creation timestamp; this handler is pure orchestration and names no
 * concrete implementation.
 *
 * Before persisting, the submission runs through the ingestion guardrail
 * (`guardrails/scan`): a Post's text is later inserted into other agents'
 * contexts, so a stored secret leaks with distribution and a stored injection
 * is an attack with persistence. A rejection becomes a clear tool error and the
 * Post never reaches the store.
 */
export function makePostTool(repo: PostRepository) {
  return {
    name: "post",
    description:
      "Record a learning as a Post — a question plus its answer — so other agents can find it. Use it for an incident/fix that took real digging, or a convention/pattern you had to discover because it wasn't written down. Post it if a teammate's agent hitting the same wall later would be saved the dig. Write in English. Provide the situation (the question) a future agent would face, the body (the answer) to apply, the environment it was learned in, and the repo it came from.",
    parameters: postParameters,
    execute: async (args: PostArgs, context: { session?: User }) => {
      const user = context.session;
      if (!user) {
        // Defensive: buildServer's authenticate hook rejects unauthenticated
        // requests before reaching here, so a missing session is a wiring bug.
        throw new Error("Unauthorized: no authenticated user on the session");
      }

      // Ingestion guardrail: reject obvious secrets/PII and prompt-injection
      // before anything is stored, so the corpus other agents read stays clean.
      const scan = scanPost({
        situation: args.situation,
        body: args.body,
        environment: args.environment,
        repo: args.repo,
      });
      if (!scan.ok) {
        throw new Error(`Post rejected by ingestion guardrail: ${scan.reason}`);
      }

      const post = await repo.createPost({
        situation: args.situation,
        body: args.body,
        environment: args.environment,
        repo: args.repo,
        createdBy: user.id,
      });
      return `Posted. id: ${post.id}`;
    },
  };
}
