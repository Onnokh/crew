import type { Database } from "better-sqlite3";
import { betterAuth } from "better-auth";
import { apiKey } from "@better-auth/api-key";
import { admin } from "better-auth/plugins";

// Unexported helper so the exported `Auth` type captures the plugin-augmented
// better-auth API (admin + api-key). The real config lives in main.ts and the
// test harness; this file is only for the type alias.
function configuredAuth() {
  return betterAuth({
    secret: "",
    baseURL: "",
    database: undefined as unknown as Database,
    emailAndPassword: { enabled: true },
    logger: {
      log: (
        _level: "error" | "debug" | "info" | "warn",
        _message: string,
        ..._args: unknown[]
      ) => {},
    },
    plugins: [admin(), apiKey({ rateLimit: { enabled: false } })],
  });
}

/** The concrete better-auth instance type, carrying the plugin-augmented `api`. */
export type Auth = ReturnType<typeof configuredAuth>;
