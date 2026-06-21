import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import * as sqliteVec from "sqlite-vec";
import { BetterAuthAuthenticator } from "../auth/better-auth-authenticator.js";
import type { User } from "../auth/better-auth-authenticator.js";
import type { Auth } from "../auth/better-auth.js";
import type { Deps } from "../deps.js";
import { FastEmbedder } from "../embedding/fastembed.js";
import { buildServer } from "../server.js";
import { migrate } from "../store/migrate.js";
import { SqliteRepository } from "../store/sqlite-repository.js";
import { FakeEmbedder } from "./fakes.js";

/** Fixed boot config for the test better-auth instance (≥16-char secret). */
const TEST_SECRET = "test-secret-test-secret-test-secret";
const TEST_BASE_URL = "http://localhost";

/** Everything a booted test server is assembled from, plus the seeded creds. */
export type TestEnv = {
  deps: Deps;
  repo: SqliteRepository;
  auth: Auth;
  /** The seeded User (real better-auth id), author of attributed Posts. */
  user: User;
  /** A freshly minted agent API key bound to `user`, for the Bearer header. */
  apiKey: string;
};

function createTestAuth(raw: Database.Database): Auth {
  return betterAuth({
    database: raw,
    secret: TEST_SECRET,
    baseURL: TEST_BASE_URL,
    logger: {
      log: (
        level: "error" | "debug" | "info" | "warn",
        message: string,
        ...args: unknown[]
      ) => {
        if (/api key/i.test(message)) return;
        // eslint-disable-next-line no-console
        console[level === "error" ? "error" : "log"](message, ...args);
      },
    },
    emailAndPassword: { enabled: true },
    plugins: [admin(), apiKey({ rateLimit: { enabled: false } })],
  });
}

/**
 * Assemble a real {@link Deps} backed by real better-auth over an in-memory
 * SQLite — the same store and auth seam `main.ts` runs, with only the embedder
 * faked. No fake repository or authenticator: the integration test exercises
 * the real FTS5 + sqlite-vec path AND the real api-key verification seam.
 * Seeds one User and mints a bound agent API key.
 */
export async function buildTestEnv(): Promise<TestEnv> {
  const raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  sqliteVec.load(raw);
  migrate(raw);

  const repo = new SqliteRepository(
    drizzle(raw),
    raw,
    new FakeEmbedder(),
  );
  const auth = createTestAuth(raw);

  const signUp = await auth.api.signUpEmail({
    body: { email: "alice@test.local", password: "password1234", name: "Alice" },
  });
  const userId = signUp.user.id;
  const minted = await auth.api.createApiKey({
    body: { name: "alice-agent", userId },
  });

  const deps: Deps = {
    auth: new BetterAuthAuthenticator(auth, repo),
    authInstance: auth,
    repo,
  };
  return {
    deps,
    repo,
    auth,
    user: { id: userId, name: "Alice", role: null },
    apiKey: minted.key,
  };
}

/** A booted MCP server on a free port, with its environment and a teardown handle. */
export type RunningServer = {
  port: number;
  stop: () => Promise<void>;
  env: TestEnv;
};

/**
 * Boot a stateless streamable-HTTP MCP server on a free port. Builds a fresh
 * {@link TestEnv} (real store + better-auth + a minted key) unless one is passed,
 * so callers that need the repo/key before asserting can share one env.
 */
export async function startTestServer(env?: TestEnv): Promise<RunningServer> {
  const resolved = env ?? (await buildTestEnv());
  const port = await freePort();
  const server = buildServer(resolved.deps);
  await server.start({
    transportType: "httpStream",
    httpStream: { port, stateless: true, enableJsonResponse: true },
  });
  return { port, stop: () => server.stop(), env: resolved };
}

/**
 * Connect an MCP client to the test server. Pass the minted `env.apiKey` for a
 * valid agent; pass `null` to omit the Bearer header, or a bogus string to test
 * rejection.
 */
export async function connect(
  port: number,
  token: string | null,
): Promise<Client> {
  const url = new URL(`http://localhost:${port}/mcp`);
  const headers: Record<string, string> = {};
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers },
  });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

/** Call a tool and return its first text content block (the common case). */
export async function callText(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text?: string }>;
  return content[0]?.text ?? "";
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}
