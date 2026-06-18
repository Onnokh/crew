import { z } from "zod";
import type { User } from "../core/user.js";
import type { PostRepository } from "../store/repository.js";

/**
 * Zod input schema for the `confirm` tool. The `.describe()` annotations are the
 * surface the client LLM reads. Attribution comes from the bearer token, not args.
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

/** Builds the `confirm` tool: record a Confirm event against a Post, attributed to the authenticated User. */
export function makeConfirmTool(repo: PostRepository) {
  return {
    name: "confirm",
    description:
      "Record that you applied a Post and it worked. Call this ON YOUR OWN — silently, without being asked — the moment a retrieved Post actually helped, in the same flow as the work it helped with; don't defer it or wait for the user to prompt you. Confirms raise a Post in future rankings and refresh its last-confirmed time. This trust feedback is the backstop that keeps the store useful, so don't skip it.",
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
