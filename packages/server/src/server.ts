import { FastMCP } from "fastmcp";
import type { IncomingMessage } from "node:http";
import { mountReview } from "./api/review.js";
import type { User } from "./core/user.js";
import type { Deps } from "./deps.js";
import { registerTools } from "./mcp/register.js";

/**
 * The composition root. Given a fully-assembled {@link Deps}, wires them into a
 * FastMCP server and returns it unstarted. This is the ONLY function that knows
 * how the pieces fit together; `main.ts` calls it with real implementations and
 * the integration test calls it with fakes — neither duplicates the wiring.
 *
 * Auth is bridged through FastMCP's `authenticate` hook, whose shape matches our
 * {@link Authenticator} seam: a valid token resolves to the session `User`; a
 * missing or invalid token throws, which FastMCP turns into a 401 (see ADR 0002).
 */
export function buildServer(deps: Deps): FastMCP<User> {
  const server = new FastMCP<User>({
    name: "stack-overflow-agent",
    version: "0.0.0",
    authenticate: async (request: IncomingMessage): Promise<User> => {
      const user = await deps.auth.authenticate(request);
      if (user === null) {
        // FastMCP/mcp-proxy maps a thrown "Unauthorized" error to a 401 in
        // stateless HTTP mode; our Authenticator seam owns the null decision.
        throw new Error("Unauthorized: invalid or missing bearer token");
      }
      return user;
    },
  });

  registerTools(server, deps);

  // The human surface (slice 0007) hangs off the same Hono app FastMCP exposes,
  // behind the same auth seam — one app, one port (see TECH.md "Human surface").
  mountReview(server.getApp(), deps);

  return server;
}
