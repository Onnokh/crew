import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import * as sqliteVec from "sqlite-vec";
import type { User } from "../core/user.js";
import type { Deps } from "../deps.js";
import { buildServer } from "../server.js";
import { migrate } from "../store/migrate.js";
import { SqliteRepository } from "../store/sqlite-repository.js";
import { FakeAuthenticator, FakeClock, FakeEmbedder, FakeIdGen } from "./fakes.js";

export const TEST_USER: User = { id: "user_alice", name: "Alice" };
export const VALID_TOKEN = "test-token-alice";

/**
 * A real {@link SqliteRepository} over an in-memory database — the SAME store
 * `main.ts` runs in production, with only the embedder, clock, and id generator
 * swapped for deterministic fakes. There is deliberately no fake repository:
 * integration tests must exercise the real FTS5 + sqlite-vec query path, and a
 * `:memory:` SQLite gives that with no file and no model download. Seeds
 * {@link TEST_USER} so `getUser` resolves the author name in rendered provenance
 * and the `created_by` foreign key holds.
 */
export function buildSqliteRepo(): SqliteRepository {
  const raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  sqliteVec.load(raw);
  migrate(raw);
  raw
    .prepare("INSERT INTO users (id, name, token_hash) VALUES (?, ?, ?)")
    .run(TEST_USER.id, TEST_USER.name, `hash-${TEST_USER.id}`);
  return new SqliteRepository(
    drizzle(raw),
    raw,
    new FakeClock(),
    new FakeIdGen(),
    new FakeEmbedder(),
  );
}

/**
 * Assembles a {@link Deps} for integration tests. Mirrors `main.ts`'s
 * `buildRealDeps()` in shape — the same `buildServer(deps)` runs against it —
 * but with a `:memory:` store and a {@link FakeAuthenticator} (raw token → User,
 * no hashing). Pass a repo to share one corpus across calls; otherwise a fresh
 * one is built.
 */
export function buildFakeDeps(
  repo = buildSqliteRepo(),
  overrides: Partial<Deps> = {},
): Deps {
  return {
    auth: new FakeAuthenticator({ [VALID_TOKEN]: TEST_USER }),
    repo,
    clock: new FakeClock(),
    ...overrides,
  };
}

/** A booted MCP server on a free port, with a teardown handle. */
export type RunningServer = {
  port: number;
  stop: () => Promise<void>;
};

/**
 * Boot a stateless streamable-HTTP MCP server from the given deps on a free
 * port. Replaces the freePort/start/stop boilerplate every integration test
 * used to copy.
 */
export async function startTestServer(
  deps: Deps = buildFakeDeps(),
): Promise<RunningServer> {
  const port = await freePort();
  const server = buildServer(deps);
  await server.start({
    transportType: "httpStream",
    httpStream: { port, stateless: true, enableJsonResponse: true },
  });
  return { port, stop: () => server.stop() };
}

/** Connect an MCP client to the test server; pass `null` to omit the token. */
export async function connect(
  port: number,
  token: string | null = VALID_TOKEN,
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
