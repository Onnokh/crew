import type { FastMCP } from "fastmcp";
import type { Principal } from "../core/user.js";
import type { Deps } from "../deps.js";
import { makeConfirmTool } from "../tools/confirm.js";
import { makeFlagTool } from "../tools/flag.js";
import { makePostTool } from "../tools/post.js";
import { makeQueryTool } from "../tools/query.js";

/**
 * Maps the `tools/` handlers onto FastMCP `addTool` calls. Each tool is wired
 * with the {@link Deps.teams} resolver, not a fixed repo: it resolves its corpus
 * per-request from `context.session.teamId` (ADR 0008's `key → user → team → DB`),
 * so the agent path carries no team parameter.
 */
export function registerTools(server: FastMCP<Principal>, deps: Deps): void {
  // Author names resolve from the control plane at read time (per-team corpus
  // DBs carry no `user` table); a missing id renders as "unknown".
  const getUser = (id: string) => deps.controlPlane.getUser(id);
  server.addTool(makeQueryTool(deps.teams, getUser, deps.clock));
  server.addTool(makePostTool(deps.teams));
  server.addTool(makeConfirmTool(deps.teams));
  server.addTool(makeFlagTool(deps.teams));
}
