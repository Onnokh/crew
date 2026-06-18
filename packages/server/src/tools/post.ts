import { z } from "zod";
import { normalizeRepo } from "../core/post.js";
import type { User } from "../core/user.js";
import { scanPost } from "../guardrails/scan.js";
import type { PostRepository } from "../store/repository.js";

/**
 * Zod input schema for the `post` tool. The `.describe()` annotations are the
 * surface the client LLM reads. All fields are required (unlike on `query`).
 */
export const postParameters = z.object({
  title: z
    .string()
    .min(1)
    .describe(
      "A short, scannable title for this learning — a headline a human skims in a list, not the full question. Keep it to 4–5 words naming the problem or convention (e.g. 'pnpm install fails behind proxy'). Distinct from the situation: the title labels, the situation is the searchable question.",
    ),
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
      "The git repository this originated from. The plugin captures this automatically from the current git remote (a PreToolUse hook overwrites it), so you normally don't fill it in by hand; if you must, pass the `group/name` slug (e.g. `Onnokh/crew`). Stored canonically as `group/name`. Used to boost same-repo results and label cross-repo ones; never filters.",
    ),
});

export type PostArgs = z.infer<typeof postParameters>;

/**
 * Builds the `post` tool: validate input, attribute it to the authenticated
 * User, run it through the ingestion guardrail, and persist a Post. A guardrail
 * rejection becomes a tool error and the Post never reaches the store.
 */
export function makePostTool(repo: PostRepository) {
  return {
    name: "post",
    description:
      "Record a learning as a Post — a question plus its answer — so other agents can find it. The store is selective: a Post is worth storing only if it is Anchored (tied to a named API/library/version or this codebase's actual structure, not a general principle) AND Consequential (getting it wrong costs real time or ships a bug, not self-corrected in seconds) AND (Surprising — defies a competent agent's default assumption — OR Foundational — so load-bearing that not knowing it makes you build wrong and unwind work). Covers incidents/fixes, gotchas, and discovered conventions/architecture alike; capture the surprising or load-bearing shape, not the exhaustive architecture. When a candidate doesn't clearly clear the bar, don't post. Write in English. Provide a short title (the headline), the situation (the question) a future agent would face, the body (the answer) to apply, the environment it was learned in, and the repo it came from.",
    parameters: postParameters,
    execute: async (args: PostArgs, context: { session?: User }) => {
      const user = context.session;
      if (!user) {
        // Defensive: the authenticate hook rejects unauthenticated requests first.
        throw new Error("Unauthorized: no authenticated user on the session");
      }

      // Canonicalise the repo to `group/name` so stored values are uniform
      // whatever form the client sends (full URL, ssh remote, bare slug).
      const normalizedRepo = normalizeRepo(args.repo);

      // Reject secrets/PII and prompt-injection before anything is stored.
      const scan = scanPost({
        title: args.title,
        situation: args.situation,
        body: args.body,
        environment: args.environment,
        repo: normalizedRepo,
      });
      if (!scan.ok) {
        throw new Error(`Post rejected by ingestion guardrail: ${scan.reason}`);
      }

      const post = await repo.createPost({
        title: args.title,
        situation: args.situation,
        body: args.body,
        environment: args.environment,
        repo: normalizedRepo,
        createdBy: user.id,
      });
      return `Posted. id: ${post.id}`;
    },
  };
}
