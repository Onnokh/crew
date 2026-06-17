import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestEnv,
  callText,
  connect,
  startTestServer,
  type RunningServer,
} from "../test/harness.js";

/**
 * The admin user-management API end to end against the REAL booted server — real
 * better-auth over an in-memory SQLite, driven over HTTP exactly as the console
 * SPA drives it (session cookie) and exactly as an agent drives `/mcp` (Bearer
 * key). The harness seeds one ordinary User ("alice"); each leg promotes a fresh
 * admin and signs in to obtain the cookie the role gate reads.
 *
 * What this pins, per the slice's acceptance criteria (issue 0012):
 *  - the API is reachable only to `role === 'admin'` (401 with no session, 403
 *    for a signed-in non-admin);
 *  - creating a User from an email returns a one-time password;
 *  - the listing shows Users with role + api-key counts;
 *  - a freshly minted key lets an agent authenticate and `post`, revoking it
 *    stops that, and the count tracks both;
 *  - banning a User stops its login AND its keys while authored Posts survive.
 */

/** Boot a server and promote a brand-new admin, returning the cookie to gate on. */
async function bootWithAdmin(): Promise<{
  srv: RunningServer;
  cookie: string;
}> {
  const env = await buildTestEnv();
  // Seed the first admin exactly as main.ts does: sign up, then promote the row
  // directly (the very first admin can't go through the admin-gated API).
  const signUp = await env.auth.api.signUpEmail({
    body: { email: "boss@test.local", password: "password1234", name: "Boss" },
  });
  const { adapter } = await env.auth.$context;
  await adapter.update({
    model: "user",
    where: [{ field: "id", value: signUp.user.id }],
    update: { role: "admin" },
  });
  const res = await env.auth.api.signInEmail({
    body: { email: "boss@test.local", password: "password1234" },
    asResponse: true,
  });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
  const srv = await startTestServer(env);
  return { srv, cookie };
}

/** Call the admin API on the booted server with the admin cookie attached. */
function adminFetch(
  srv: RunningServer,
  cookie: string | null,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return fetch(`http://localhost:${srv.port}/api/admin${path}`, {
    ...init,
    headers,
  });
}

describe("admin API is role-gated", () => {
  let srv: RunningServer;
  let cookie: string;
  beforeAll(async () => {
    ({ srv, cookie } = await bootWithAdmin());
  });
  afterAll(() => srv.stop());

  it("refuses a request with no session (401)", async () => {
    const res = await adminFetch(srv, null, "/users");
    expect(res.status).toBe(401);
  });

  it("refuses a signed-in non-admin (403)", async () => {
    // The harness's seeded "alice" is an ordinary User (role null). Sign her in
    // and replay her cookie: the gate must reject on role, not on session.
    const res = await srv.env.auth.api.signInEmail({
      body: { email: "alice@test.local", password: "password1234" },
      asResponse: true,
    });
    const aliceCookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
    const gated = await adminFetch(srv, aliceCookie, "/users");
    expect(gated.status).toBe(403);
  });

  it("admits an admin (200)", async () => {
    const res = await adminFetch(srv, cookie, "/users");
    expect(res.status).toBe(200);
  });
});

describe("create User returns a one-time password and appears in the listing", () => {
  let srv: RunningServer;
  let cookie: string;
  beforeAll(async () => {
    ({ srv, cookie } = await bootWithAdmin());
  });
  afterAll(() => srv.stop());

  it("creates a User from an email and shows the generated password once", async () => {
    const created = await adminFetch(srv, cookie, "/users", {
      method: "POST",
      body: JSON.stringify({ email: "bob@test.local" }),
    });
    expect(created.status).toBe(201);
    const payload = (await created.json()) as {
      user: { id: string; email: string };
      password: string;
    };
    expect(payload.user.email).toBe("bob@test.local");
    expect(payload.password).toBeTruthy();
    expect(payload.password.length).toBeGreaterThanOrEqual(16);

    // The password is shown exactly once: it is never returned by the listing.
    const list = await adminFetch(srv, cookie, "/users");
    const { users } = (await list.json()) as {
      users: Array<{ email: string; role: string | null; keyCount: number }>;
    };
    const bob = users.find((u) => u.email === "bob@test.local");
    expect(bob).toBeDefined();
    expect(bob).not.toHaveProperty("password");
    expect(bob!.role).toBe("user");
    expect(bob!.keyCount).toBe(0);

    // The password actually works: Bob can sign in with it.
    const signIn = await srv.env.auth.api.signInEmail({
      body: { email: "bob@test.local", password: payload.password },
      asResponse: true,
    });
    expect(signIn.status).toBe(200);
  });
});

describe("mint and revoke keys; an agent posts with a minted key", () => {
  let srv: RunningServer;
  let cookie: string;
  let bobId: string;
  beforeAll(async () => {
    ({ srv, cookie } = await bootWithAdmin());
    const created = await adminFetch(srv, cookie, "/users", {
      method: "POST",
      body: JSON.stringify({ email: "bob@test.local" }),
    });
    bobId = ((await created.json()) as { user: { id: string } }).user.id;
  });
  afterAll(() => srv.stop());

  it("a freshly minted key authenticates an agent and lets it post; revoking stops it", async () => {
    const minted = await adminFetch(srv, cookie, `/users/${bobId}/keys`, {
      method: "POST",
    });
    expect(minted.status).toBe(201);
    const { id: keyId, key } = (await minted.json()) as {
      id: string;
      key: string;
    };
    expect(key).toBeTruthy();

    // The listing's key count for Bob is now 1.
    const afterMint = await adminFetch(srv, cookie, "/users");
    const bobAfterMint = (
      (await afterMint.json()) as {
        users: Array<{ id: string; keyCount: number }>;
      }
    ).users.find((u) => u.id === bobId);
    expect(bobAfterMint!.keyCount).toBe(1);

    // An agent authenticates with the raw key over /mcp and completes a post,
    // attributed to Bob.
    const client = await connect(srv.port, key);
    let postId: string;
    try {
      const text = await callText(client, "post", {
        title: "minted-key agent posts a finding",
        situation: "minted-key agent posts a finding",
        body: "It works end to end through the admin-minted key.",
        environment: "Node 22",
        repo: "crew",
      });
      expect(text).toContain("Posted.");
      postId = text.match(/post_[A-Za-z0-9_-]+/)![0];
    } finally {
      await client.close();
    }
    const stored = await srv.env.repo.getPost(postId);
    expect(stored!.createdBy).toBe(bobId);

    // Revoke the key: the count drops back to 0 and the key no longer connects.
    const revoked = await adminFetch(srv, cookie, `/keys/${keyId}`, {
      method: "DELETE",
    });
    expect(revoked.status).toBe(204);

    const afterRevoke = await adminFetch(srv, cookie, "/users");
    const bobAfterRevoke = (
      (await afterRevoke.json()) as {
        users: Array<{ id: string; keyCount: number }>;
      }
    ).users.find((u) => u.id === bobId);
    expect(bobAfterRevoke!.keyCount).toBe(0);

    await expect(connect(srv.port, key)).rejects.toThrow();
  });
});

describe("ban stops login + keys while authored Posts stay attributed", () => {
  let srv: RunningServer;
  let cookie: string;
  beforeAll(async () => {
    ({ srv, cookie } = await bootWithAdmin());
  });
  afterAll(() => srv.stop());

  it("a banned User can no longer sign in or use its keys, but its Post remains", async () => {
    const created = await adminFetch(srv, cookie, "/users", {
      method: "POST",
      body: JSON.stringify({ email: "carol@test.local" }),
    });
    const { user, password } = (await created.json()) as {
      user: { id: string };
      password: string;
    };
    const carolId = user.id;

    // Carol mints a key and posts before the ban — that Post must outlive her.
    const minted = await adminFetch(srv, cookie, `/users/${carolId}/keys`, {
      method: "POST",
    });
    const { key } = (await minted.json()) as { key: string };

    const client = await connect(srv.port, key);
    let postId: string;
    try {
      const text = await callText(client, "post", {
        title: "finding authored before the ban",
        situation: "a finding authored before its author was banned",
        body: "This Post must stay attributed after the ban.",
        environment: "Node 22",
        repo: "crew",
      });
      postId = text.match(/post_[A-Za-z0-9_-]+/)![0];
    } finally {
      await client.close();
    }

    // Ban Carol.
    const banned = await adminFetch(srv, cookie, `/users/${carolId}/ban`, {
      method: "POST",
    });
    expect(banned.status).toBe(200);
    expect((await banned.json()) as { keysRevoked: number }).toMatchObject({
      banned: true,
      keysRevoked: 1,
    });

    // Login is blocked (banned users are refused, 4xx).
    const signIn = await srv.env.auth.api
      .signInEmail({
        body: { email: "carol@test.local", password },
        asResponse: true,
      })
      .then((r) => r.status)
      .catch(() => 403);
    expect(signIn).toBeGreaterThanOrEqual(400);

    // The key is dead: it can no longer connect over /mcp.
    await expect(connect(srv.port, key)).rejects.toThrow();

    // Her Post survives, still attributed to her id — the row was kept.
    const stored = await srv.env.repo.getPost(postId);
    expect(stored).not.toBeNull();
    expect(stored!.createdBy).toBe(carolId);
  });
});
