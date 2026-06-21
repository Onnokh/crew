import { FastMCP } from "fastmcp";
import type { IncomingMessage } from "node:http";
import { mountAdmin } from "./api/admin.js";
import { mountConsole } from "./api/console.js";
import { mountReview } from "./api/review.js";
import type { User } from "./auth/better-auth-authenticator.js";
import type { Deps } from "./deps.js";
import {
  confirmDescription,
  confirmParameters,
  executeConfirm,
} from "./tools/confirm.js";
import {
  executeFlag,
  flagDescription,
  flagParameters,
} from "./tools/flag.js";
import { executePost, postDescription, postParameters } from "./tools/post.js";
import {
  executeQuery,
  queryDescription,
  queryParameters,
} from "./tools/query.js";

// The composition root: wire Deps into an unstarted FastMCP server. The only
// place that knows how the pieces fit together.
export function buildServer(deps: Deps): FastMCP<User> {
  const server = new FastMCP<User>({
    name: "crew",
    version: "0.0.0",
    authenticate: async (request: IncomingMessage): Promise<User> => {
      const user = await deps.auth.authenticate(request);
      if (user === null) {
        // A thrown "Unauthorized" error maps to a 401 in stateless HTTP mode.
        throw new Error("Unauthorized: invalid or missing API key");
      }
      return user;
    },
  });

  // MCP tools.
  server.addTool({
    name: "query",
    description: queryDescription,
    parameters: queryParameters,
    execute: (args, ctx) => executeQuery(args, ctx, deps.repo),
  });
  server.addTool({
    name: "post",
    description: postDescription,
    parameters: postParameters,
    execute: (args, ctx) => executePost(args, ctx, deps.repo),
  });
  server.addTool({
    name: "confirm",
    description: confirmDescription,
    parameters: confirmParameters,
    execute: (args, ctx) => executeConfirm(args, ctx, deps.repo),
  });
  server.addTool({
    name: "flag",
    description: flagDescription,
    parameters: flagParameters,
    execute: (args, ctx) => executeFlag(args, ctx, deps.repo),
  });

  // better-auth's session/api-key/admin routes hang off the same Hono app.
  server
    .getApp()
    .on(["GET", "POST"], "/api/auth/*", (c) =>
      deps.authInstance.handler(c.req.raw),
    );

  // The human JSON API. Mounts under `/api/*` BEFORE the console so its SPA
  // catch-all never shadows them.
  mountAdmin(server.getApp(), deps);
  mountReview(server.getApp(), deps);

  // The built console SPA, served statically with a client-route fallback.
  // Mounted LAST so its catch-all only sees what `/api/auth/*` and `/mcp` left
  // behind. No-ops when the console hasn't been built (dev, tests).
  mountConsole(server.getApp());

  return server;
}
