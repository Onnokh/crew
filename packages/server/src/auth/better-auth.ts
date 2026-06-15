import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import type { Database } from "better-sqlite3";

/**
 * Constructs the single better-auth instance (see ADR 0003). It is the canonical
 * owner of the `user`/`session`/`account`/`verification`/`apikey` tables and the
 * one place auth behaviour is configured:
 *
 * - **Agents** authenticate with a long-lived API key. The plugin lives in the
 *   version-locked `@better-auth/api-key` package — in better-auth 1.6.x the
 *   api-key plugin was extracted out of core (`better-auth/plugins` no longer
 *   exports it). A key row links to its owner through `referenceId`, which we
 *   set to the owning User's id, so `verifyApiKey` resolves one identity even
 *   when a User holds many keys (trust counts Users, not keys).
 * - **Humans (admins)** authenticate with email + password sessions; the `admin`
 *   plugin supplies the `role` column that gates `/admin` in a later slice.
 *
 * The same better-sqlite3 handle the rest of the store uses is passed in, so the
 * auth tables and `posts`/`post_events` live in one database file and the
 * `created_by` foreign keys into `user(id)` hold. The tables themselves are
 * created by our hand-written migration (`migrations/0000_better_auth.sql`),
 * whose DDL was captured verbatim from better-auth's own generator at this
 * pinned version — so the schema is exactly what better-auth expects without a
 * second, CLI-driven migration path at boot.
 */
export function createAuth(db: Database, config: AuthConfig): Auth {
  return makeAuth(db, config);
}

/**
 * The actual better-auth construction. Kept un-exported so its (huge, inferred)
 * return type — which embeds the better-sqlite3 `Database` type — does not have
 * to be nameable at an export boundary under `declaration: true`. {@link Auth}
 * is derived from it, and the exported {@link createAuth} re-annotates to `Auth`,
 * breaking the otherwise-circular inference.
 */
function makeAuth(db: Database, config: AuthConfig) {
  return betterAuth({
    database: db,
    secret: config.secret,
    baseURL: config.baseURL,
    // Bearer API keys and probes against `/mcp` produce a steady trickle of
    // "Invalid API key" rejections; that is the seam doing its job, not a fault,
    // so we drop those lines rather than let them spam the log on every bad
    // credential. Everything else logs normally.
    logger: {
      log: (level, message, ...args) => {
        if (/api key/i.test(message)) return;
        // eslint-disable-next-line no-console
        console[level === "error" ? "error" : "log"](message, ...args);
      },
    },
    emailAndPassword: { enabled: true },
    // Disable the api-key plugin's built-in per-key rate limiting. It defaults to
    // a low request budget over a 24h window, but every MCP request re-verifies
    // the key, so a normal agent session (post/query/confirm/flag in a loop)
    // would exhaust it almost immediately. Throttling trusted team agents on a
    // single node is not our concern — the trust model counts Users, not request
    // volume — so verification stays a pure validity check.
    plugins: [admin(), apiKey({ rateLimit: { enabled: false } })],
  });
}

/** Boot-time configuration for {@link createAuth}. */
export type AuthConfig = {
  /** Signing secret for sessions/tokens; required, must be stable across boots. */
  secret: string;
  /** Public base URL better-auth builds its routes and cookies against. */
  baseURL: string;
};

/**
 * The concrete better-auth instance type, inferred from the construction so it
 * carries the plugin-augmented `api` (e.g. `verifyApiKey`, `createApiKey`, the
 * admin endpoints) — not just the base surface.
 */
export type Auth = ReturnType<typeof makeAuth>;
