import type { FastMCP } from "fastmcp";
import type { User } from "../core/user.js";
import type { Deps } from "../deps.js";
import { makeConfirmTool } from "../tools/confirm.js";
import { makeFlagTool } from "../tools/flag.js";
import { makePostTool } from "../tools/post.js";
import { makeQueryTool } from "../tools/query.js";

/** Maps the `tools/` handlers onto FastMCP `addTool` calls, wiring in their {@link Deps}. */
export function registerTools(server: FastMCP<User>, deps: Deps): void {
  server.addTool(makeQueryTool(deps.repo, deps.clock));
  server.addTool(makePostTool(deps.repo));
  server.addTool(makeConfirmTool(deps.repo));
  server.addTool(makeFlagTool(deps.repo));
}
