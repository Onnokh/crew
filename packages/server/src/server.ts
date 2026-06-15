import { FastMCP } from "fastmcp";
import type { IncomingMessage } from "node:http";
import { mountAuth } from "./api/auth.js";
import { mountConsole } from "./api/console.js";
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
 * {@link Authenticator} seam: a valid agent API key (Bearer) resolves to the
 * owning `User`; a missing or invalid credential throws, which FastMCP turns into
 * a 401 (see ADR 0003). better-auth's own routes are mounted on the same Hono app
 * for human sessions and the admin/api-key endpoints.
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
        throw new Error("Unauthorized: invalid or missing API key");
      }
      return user;
    },
  });

  registerTools(server, deps);

  // better-auth's session/api-key/admin routes hang off the same Hono app
  // FastMCP exposes — one app, one port (see ADR 0003/0004). The review/admin
  // JSON API (later slices) mounts here too.
  mountAuth(server.getApp(), deps.authInstance);

  // The built console SPA is served statically off the same app, with a
  // client-route fallback. Mounted LAST so its catch-all only ever sees what
  // `/api/auth/*` and `/mcp` left behind. No-ops gracefully when the console
  // hasn't been built (dev, tests) — see `mountConsole`.
  mountConsole(server.getApp());

  return server;
}
