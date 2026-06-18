import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import type { Database } from "better-sqlite3";

/**
 * Constructs the single better-auth instance: owner of the
 * `user`/`session`/`account`/`verification`/`apikey` tables. Agents use API keys
 * (linked to their owner via `referenceId`); humans use email+password sessions
 * with the `admin` plugin's `role` column. The same better-sqlite3 handle the
 * store uses is passed in; tables come from `migrations/0000_better_auth.sql`.
 */
export function createAuth(db: Database, config: AuthConfig): Auth {
  return makeAuth(db, config);
}

// Un-exported so its huge inferred return type need not be nameable at an export
// boundary under `declaration: true`; {@link Auth} is derived and re-annotated.
function makeAuth(db: Database, config: AuthConfig) {
  return betterAuth({
    database: db,
    secret: config.secret,
    baseURL: config.baseURL,
    // Trust extra origins beyond `baseURL` (dev console on the Vite port proxies here).
    ...(config.trustedOrigins ? { trustedOrigins: config.trustedOrigins } : {}),
    // Drop "Invalid API key" log lines — expected on bad credentials, not a fault.
    logger: {
      log: (level, message, ...args) => {
        if (/api key/i.test(message)) return;
        // eslint-disable-next-line no-console
        console[level === "error" ? "error" : "log"](message, ...args);
      },
    },
    emailAndPassword: { enabled: true },
    // Disable per-key rate limiting: every MCP request re-verifies the key, so the
    // default low budget would exhaust almost immediately for a normal agent loop.
    plugins: [admin(), apiKey({ rateLimit: { enabled: false } })],
  });
}

/** Boot-time configuration for {@link createAuth}. */
export type AuthConfig = {
  /** Signing secret for sessions/tokens; required, must be stable across boots. */
  secret: string;
  /** Public base URL better-auth builds its routes and cookies against. */
  baseURL: string;
  /** Extra trusted origins beyond `baseURL` (needed in dev; omit in same-origin prod). */
  trustedOrigins?: string[];
};

/** The concrete better-auth instance type, carrying the plugin-augmented `api`. */
export type Auth = ReturnType<typeof makeAuth>;
