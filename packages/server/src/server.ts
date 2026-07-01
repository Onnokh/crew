import { FastMCP, type Logger } from "fastmcp";
import type { IncomingMessage } from "node:http";
import { mountAdmin } from "./api/admin.js";
import { mountAuth } from "./api/auth.js";
import { mountCommunity } from "./api/community.js";
import { mountConsole } from "./api/console.js";
import { mountMe } from "./api/me.js";
import { mountReview } from "./api/review.js";
import { mountTelemetry } from "./api/telemetry.js";
import type { Principal } from "./core/user.js";
import type { Deps } from "./deps.js";
import { registerTools } from "./mcp/register.js";

// FastMCP's default logger is `console`. Wrap it to swallow the spurious
// "could not infer client capabilities" warning emitted per request under
// stateless HTTP; everything else passes through untouched.
const quietLogger: Logger = {
  debug: (...args) => console.debug(...args),
  error: (...args) => console.error(...args),
  info: (...args) => console.info(...args),
  log: (...args) => console.log(...args),
  warn: (...args) => {
    if (typeof args[0] === "string" && args[0].includes("could not infer client capabilities")) {
      return;
    }
    console.warn(...args);
  },
};

// The composition root: wire Deps into an unstarted FastMCP server. The only
// place that knows how the pieces fit together. The session is a {@link Principal}
// carrying the caller's Team, so tools route to that Team's corpus.
export function buildServer(deps: Deps): FastMCP<Principal> {
  const server = new FastMCP<Principal>({
    name: "crew",
    version: "0.0.0",
    // In stateless HTTP mode every request is its own session, so FastMCP's
    // capability-inference loop never sees a persistent client and warns once
    // per request — pure noise that floods the logs. Drop just that line.
    logger: quietLogger,
    authenticate: async (request: IncomingMessage): Promise<Principal> => {
      const principal = await deps.auth.authenticate(request);
      if (principal === null) {
        // A thrown "Unauthorized" error maps to a 401 in stateless HTTP mode.
        // Also covers a valid credential that resolves to no Team.
        throw new Error("Unauthorized: invalid or missing API key");
      }
      return principal;
    },
  });

  registerTools(server, deps);

  // better-auth's session/api-key/admin routes hang off the same Hono app.
  mountAuth(server.getApp(), deps.authInstance);

  // The human JSON API. Mounts under `/api/*` BEFORE the console so its SPA
  // catch-all never shadows them.
  mountAdmin(server.getApp(), deps);
  mountMe(server.getApp(), deps);
  mountCommunity(server.getApp(), deps);
  mountReview(server.getApp(), deps);
  mountTelemetry(server.getApp(), deps);

  // Liveness probe for the reverse proxy / orchestrator. Registered before the
  // console so its SPA catch-all doesn't swallow it; cheap (no SPA render).
  server.getApp().get("/healthz", (c) => c.json({ ok: true }));

  // The built console SPA, served statically with a client-route fallback.
  // Mounted LAST so its catch-all only sees what `/api/auth/*` and `/mcp` left
  // behind. No-ops when the console hasn't been built (dev, tests).
  mountConsole(server.getApp());

  return server;
}
