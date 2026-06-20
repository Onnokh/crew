import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import * as sqliteVec from "sqlite-vec";
import { BetterAuthAuthenticator } from "../auth/better-auth-authenticator.js";
import { createAuth, type Auth } from "../auth/better-auth.js";
import type { User } from "../core/user.js";
import type { Deps } from "../deps.js";
import { buildServer } from "../server.js";
import { ensureDefaultOrgAndTeam } from "../store/bootstrap.js";
import { ControlPlaneRepository } from "../store/control-plane-repository.js";
import { migrate } from "../store/migrate.js";
import type { PostRepository } from "../store/repository.js";
import {
  createTeamRepositoryResolver,
  type TeamRepositoryResolver,
} from "../store/team-repository-resolver.js";
import { FakeClock, FakeEmbedder, FakeIdGen } from "./fakes.js";

/** Fixed boot config for the test better-auth instance (≥16-char secret). */
const TEST_SECRET = "test-secret-test-secret-test-secret";
const TEST_BASE_URL = "http://localhost";

/** Everything a booted test server is assembled from, plus the seeded creds. */
export type TestEnv = {
  deps: Deps;
  /** The default Team's corpus repository (Alice's team). */
  repo: PostRepository;
  controlPlane: ControlPlaneRepository;
  teams: TeamRepositoryResolver;
  auth: Auth;
  /** The seeded User (real better-auth id), author of attributed Posts. */
  user: User;
  /** The default Team id Alice belongs to. */
  teamId: string;
  /** A freshly minted agent API key bound to `user`, for the Bearer header. */
  apiKey: string;
  /** Provision a brand-new User on a brand-new Team; returns its id, team, and a minted key. */
  addTeamWithUser: (opts: {
    email: string;
    name: string;
  }) => Promise<{ userId: string; teamId: string; apiKey: string }>;
  /** Tear down the temp corpus files this env opened. */
  cleanup: () => void;
};

/**
 * Assemble a real {@link Deps} backed by real better-auth over an in-memory
 * control-plane SQLite plus per-team corpus DBs as REAL temp files (so two-team
 * isolation is physical — separate files). Only the embedder, clock, and id
 * generator are faked. Seeds a default Org + Team, one admin-capable User (Alice)
 * who is a member of it, and mints a bound agent API key.
 */
export async function buildTestEnv(): Promise<TestEnv> {
  const raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  sqliteVec.load(raw);
  // Control-plane schema (identity + org/team/membership) on this handle.
  migrate(raw, "control-plane");

  const clock = new FakeClock();
  const idGen = new FakeIdGen();
  const embedder = new FakeEmbedder();
  const controlPlane = new ControlPlaneRepository(raw);

  const teamsDir = mkdtempSync(join(tmpdir(), "crew-teams-"));
  const teams = createTeamRepositoryResolver({
    teamsDir,
    embedder,
    clock,
    idGen,
  });

  const auth = createAuth(raw, { secret: TEST_SECRET, baseURL: TEST_BASE_URL });

  // Default Org + Team, then Alice as a member of it.
  const teamId = ensureDefaultOrgAndTeam(controlPlane, idGen, clock);
  const signUp = await auth.api.signUpEmail({
    body: { email: "alice@test.local", password: "password1234", name: "Alice" },
  });
  const userId = signUp.user.id;
  controlPlane.addMembership(userId, teamId, clock.now());
  const minted = await auth.api.createApiKey({
    body: { name: "alice-agent", userId },
  });

  const deps: Deps = {
    auth: new BetterAuthAuthenticator(auth, controlPlane),
    authInstance: auth,
    controlPlane,
    teams,
    clock,
  };

  // Provision an isolated Team + member + key — used by the two-team isolation test.
  const addTeamWithUser: TestEnv["addTeamWithUser"] = async ({ email, name }) => {
    const orgId = idGen.next("org");
    const newTeamId = idGen.next("team");
    controlPlane.createOrg(orgId, `${name} Org`, clock.now());
    controlPlane.createTeam(
      { id: newTeamId, orgId, name: `${name} Team` },
      clock.now(),
    );
    const su = await auth.api.signUpEmail({
      body: { email, password: "password1234", name },
    });
    controlPlane.addMembership(su.user.id, newTeamId, clock.now());
    const key = await auth.api.createApiKey({ body: { name: `${name}-agent`, userId: su.user.id } });
    return { userId: su.user.id, teamId: newTeamId, apiKey: key.key };
  };

  return {
    deps,
    repo: teams.getRepository(teamId),
    controlPlane,
    teams,
    auth,
    user: { id: userId, name: "Alice", role: null },
    teamId,
    apiKey: minted.key,
    addTeamWithUser,
    cleanup: () => {
      teams.closeAll();
      rmSync(teamsDir, { recursive: true, force: true });
    },
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
  return {
    port,
    stop: async () => {
      await server.stop();
      resolved.cleanup();
    },
    env: resolved,
  };
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
