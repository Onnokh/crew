import type { FastMCP } from "fastmcp";
import type { User } from "../core/user.js";
import type { Deps } from "../deps.js";
import { makeConfirmTool } from "../tools/confirm.js";
import { makeFlagTool } from "../tools/flag.js";
import { makePostTool } from "../tools/post.js";
import { makeQueryTool } from "../tools/query.js";

/**
 * Maps the `tools/` handlers onto FastMCP `addTool` calls. This is the only
 * place that knows the MCP wiring; the tools themselves stay framework-agnostic
 * orchestration. Tools that need a seam (e.g. `post` needs the repository)
 * receive it here from {@link Deps}.
 */
export function registerTools(server: FastMCP<User>, deps: Deps): void {
  server.addTool(makeQueryTool(deps.repo, deps.clock));
  server.addTool(makePostTool(deps.repo));
  server.addTool(makeConfirmTool(deps.repo));
  server.addTool(makeFlagTool(deps.repo));
}
