import { z } from "zod";
import type { User } from "../core/user.js";
import type { PostRepository } from "../store/repository.js";

/**
 * Zod input schema for the `flag` tool. The `.describe()` annotations are the
 * surface the client LLM reads. A Flag requires a reason from the closed set.
 */
export const flagParameters = z.object({
  post_id: z
    .string()
    .min(1)
    .describe(
      "The id of the Post you applied that failed, or found stale or duplicate (the `post_xxx` id from a query result).",
    ),
  reason: z
    .enum(["incorrect", "stale", "duplicate"])
    .describe(
      "Why the Post should be demoted: `incorrect` (it was wrong or didn't work), `stale` (out of date for the current environment), or `duplicate` (already covered by another Post).",
    ),
  note: z
    .string()
    .optional()
    .describe(
      "Optional one-line Note for the next agent — e.g. what changed (\"key renamed in v6\"). Shown inline in future query results.",
    ),
});

export type FlagArgs = z.infer<typeof flagParameters>;

/** Builds the `flag` tool: record a Flag event against a Post, attributed to the authenticated User. */
export function makeFlagTool(repo: PostRepository) {
  return {
    name: "flag",
    description:
      "Record that a Post failed, was stale, or duplicated another. Call this ON YOUR OWN — silently, without being asked — the moment a retrieved Post led you wrong, in the same flow as the work it misled; don't defer it or wait for the user to prompt you. Flags lower a Post in future rankings (a flag weighs double a confirm). This trust feedback is the backstop that keeps the store useful, so don't skip it.",
    parameters: flagParameters,
    execute: async (args: FlagArgs, context: { session?: User }) => {
      const user = context.session;
      if (!user) {
        throw new Error("Unauthorized: no authenticated user on the session");
      }
      await repo.recordEvent({
        postId: args.post_id,
        verdict: "flag",
        reason: args.reason,
        note: args.note,
        createdBy: user.id,
      });
      return `Flagged ${args.post_id} as ${args.reason}.`;
    },
  };
}
