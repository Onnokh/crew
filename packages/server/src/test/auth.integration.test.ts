import Database from "better-sqlite3";
import type { IncomingMessage } from "node:http";
import * as sqliteVec from "sqlite-vec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BetterAuthAuthenticator } from "../auth/better-auth-authenticator.js";
import { createAuth, type Auth } from "../auth/better-auth.js";
import { ensureDefaultOrgAndTeam } from "../store/bootstrap.js";
import { ControlPlaneRepository } from "../store/control-plane-repository.js";
import { migrate } from "../store/migrate.js";
import { FakeClock, FakeIdGen } from "./fakes.js";
import { connect, startTestServer, type RunningServer } from "./harness.js";

/** A request the seam can read, carrying just the headers under test. */
function reqWith(headers: Record<string, string>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

describe("BetterAuthAuthenticator resolves both caller shapes", () => {
  let auth: Auth;
  let authn: BetterAuthAuthenticator;
  let adminId: string;
  let apiKey: string;

  let controlPlane: ControlPlaneRepository;
  let teamId: string;

  beforeAll(async () => {
    // The control-plane DB: identity + org/team/membership (no corpus tables).
    const raw = new Database(":memory:");
    raw.pragma("foreign_keys = ON");
    sqliteVec.load(raw);
    migrate(raw, "control-plane");
    controlPlane = new ControlPlaneRepository(raw);
    teamId = ensureDefaultOrgAndTeam(controlPlane, new FakeIdGen(), new FakeClock());

    auth = createAuth(raw, {
      secret: "test-secret-test-secret-test-secret",
      baseURL: "http://localhost",
    });
    authn = new BetterAuthAuthenticator(auth, controlPlane);

    // Seed a first admin: sign up, promote the row, make it a Team member.
    const signUp = await auth.api.signUpEmail({
      body: { email: "boss@test.local", password: "password1234", name: "Boss" },
    });
    adminId = signUp.user.id;
    raw.prepare(`UPDATE "user" SET role = 'admin' WHERE id = ?`).run(adminId);
    controlPlane.addMembership(adminId, teamId, 0);

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

  it("resolves the caller's Team onto the Principal", async () => {
    const user = await authn.authenticate(
      reqWith({ authorization: `Bearer ${apiKey}` }),
    );
    expect(user?.teamId).toBe(teamId);
  });

  it("rejects a missing credential and a bogus Bearer key", async () => {
    expect(await authn.authenticate(reqWith({}))).toBeNull();
    expect(
      await authn.authenticate(reqWith({ authorization: "Bearer nope" })),
    ).toBeNull();
  });

  it("rejects a valid key whose User belongs to no Team (401)", async () => {
    // A User with no membership resolves to no Team — the credential routes
    // nowhere and authenticate returns null.
    const teamless = await auth.api.signUpEmail({
      body: { email: "teamless@test.local", password: "password1234", name: "Teamless" },
    });
    const key = (
      await auth.api.createApiKey({ body: { name: "k2", userId: teamless.user.id } })
    ).key;
    expect(
      await authn.authenticate(reqWith({ authorization: `Bearer ${key}` })),
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
