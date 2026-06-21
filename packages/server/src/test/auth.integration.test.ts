import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import type { IncomingMessage } from "node:http";
import * as sqliteVec from "sqlite-vec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BetterAuthAuthenticator } from "../auth/better-auth-authenticator.js";
import type { Auth } from "../auth/better-auth.js";
import { migrate } from "../store/migrate.js";
import { SqliteRepository } from "../store/sqlite-repository.js";
import { FakeEmbedder } from "./fakes.js";
import { connect, startTestServer, type RunningServer } from "./harness.js";

/** A request the seam can read, carrying just the headers under test. */
function reqWith(headers: Record<string, string>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

function createTestAuth(raw: Database.Database): Auth {
  return betterAuth({
    database: raw,
    secret: "test-secret-test-secret-test-secret",
    baseURL: "http://localhost",
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

describe("BetterAuthAuthenticator resolves both caller shapes", () => {
  let auth: Auth;
  let authn: BetterAuthAuthenticator;
  let adminId: string;
  let apiKey: string;

  beforeAll(async () => {
    const raw = new Database(":memory:");
    raw.pragma("foreign_keys = ON");
    sqliteVec.load(raw);
    migrate(raw);
    const repo = new SqliteRepository(
      drizzle(raw),
      raw,
      new FakeEmbedder(),
    );
    auth = createTestAuth(raw);
    authn = new BetterAuthAuthenticator(auth, repo);

    // Seed a first admin: sign up, then promote the row directly.
    const signUp = await auth.api.signUpEmail({
      body: { email: "boss@test.local", password: "password1234", name: "Boss" },
    });
    adminId = signUp.user.id;
    raw.prepare(`UPDATE "user" SET role = 'admin' WHERE id = ?`).run(adminId);

    apiKey = (await auth.api.createApiKey({ body: { name: "k", userId: adminId } }))
      .key;
  });

  it("resolves an agent's Bearer API key to its owning User", async () => {
    const user = await authn.authenticate(
      reqWith({ authorization: `Bearer ${apiKey}` }),
    );
    expect(user?.id).toBe(adminId);
    expect(user?.name).toBe("Boss");
  });

  it("resolves a human's session cookie to the User, carrying the admin role", async () => {
    const res = await auth.api.signInEmail({
      body: { email: "boss@test.local", password: "password1234" },
      asResponse: true,
    });
    const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
    expect(cookie).toBeTruthy();

    const user = await authn.authenticate(reqWith({ cookie }));
    expect(user?.id).toBe(adminId);
    expect(user?.role).toBe("admin");
  });

  it("rejects a missing credential and a bogus Bearer key", async () => {
    expect(await authn.authenticate(reqWith({}))).toBeNull();
    expect(
      await authn.authenticate(reqWith({ authorization: "Bearer nope" })),
    ).toBeNull();
  });
});

describe("better-auth routes mount on the Hono app beside /mcp", () => {
  let srv: RunningServer;
  beforeAll(async () => {
    srv = await startTestServer();
  });
  afterAll(() => srv.stop());

  it("serves better-auth's sign-in route without /mcp shadowing it", async () => {
    const res = await fetch(`http://localhost:${srv.port}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "alice@test.local",
        password: "password1234",
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeTruthy();
  });

  it("still rejects an unauthenticated MCP request on the same port", async () => {
    await expect(connect(srv.port, null)).rejects.toThrow();
  });
});
