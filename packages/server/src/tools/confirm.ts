import { z } from "zod";
import type { User } from "../core/user.js";
import type { PostRepository } from "../store/repository.js";

/**
 * Zod input schema for the `confirm` tool. Lives beside the handler — MCP is the
 * type boundary resolved at runtime, so these `.describe()` annotations are the
 * product surface the client LLM reads to decide how to call the tool (see
 * TECH.md "Tool input schemas"). A Confirm carries the Post id and an optional
 * one-line Note; attribution comes from the bearer token, not the args.
 */
export const confirmParameters = z.object({
  post_id: z
    .string()
    .min(1)
    .describe(
      "The id of the Post you applied and observed work (the `post_xxx` id from a query result). Confirm only after you actually tried it.",
    ),
  note: z
    .string()
    .optional()
    .describe(
      "Optional one-line Note for the next agent — e.g. what it confirmed for, or a caveat (\"works on Node 22\"). Shown inline in future query results.",
    ),
});

export type ConfirmArgs = z.infer<typeof confirmParameters>;

/**
 * Builds the `confirm` tool: record a Confirm event ("an agent applied this Post
 * and it worked") against a Post, attributed to the authenticated User, with an
 * optional Note. The repository refreshes the Post's `last_confirmed` so ranking
 * recency lifts it. Pure orchestration — names no concrete implementation.
 */
export function makeConfirmTool(repo: PostRepository) {
  return {
    name: "confirm",
    description:
      "Record that you applied a Post and it worked. Confirms raise a Post in future rankings and refresh its last-confirmed time, so confirm whenever a retrieved Post actually helped.",
    parameters: confirmParameters,
    execute: async (args: ConfirmArgs, context: { session?: User }) => {
      const user = context.session;
      if (!user) {
        throw new Error("Unauthorized: no authenticated user on the session");
      }
      await repo.recordEvent({
        postId: args.post_id,
        verdict: "confirm",
        note: args.note,
        createdBy: user.id,
      });
      return `Confirmed ${args.post_id}.`;
    },
  };
}
