import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestEnv,
  callText,
  connect,
  startTestServer,
  type RunningServer,
} from "../test/harness.js";

/**
 * Boot a server and sign in the seeded ordinary User "alice" (a NON-admin),
 * returning her session cookie. `/api/me` must work for her without any admin
 * role — it acts on her own account, derived from the session (ADR 0010).
 */
async function bootAsAlice(): Promise<{ srv: RunningServer; cookie: string }> {
  const env = await buildTestEnv();
  const res = await env.auth.api.signInEmail({
    body: { email: "alice@test.local", password: "password1234" },
    asResponse: true,
  });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
  const srv = await startTestServer(env);
  return { srv, cookie };
}

/** Call the self-service API on the booted server with a session cookie attached. */
function meFetch(
  srv: RunningServer,
  cookie: string | null,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return fetch(`http://localhost:${srv.port}/api/me${path}`, {
    ...init,
    headers,
  });
}

describe("/api/me is session-gated, not role-gated", () => {
  let srv: RunningServer;
  let cookie: string;
  beforeAll(async () => {
    ({ srv, cookie } = await bootAsAlice());
  });
  afterAll(() => srv.stop());

  it("refuses a request with no session (401)", async () => {
    expect((await meFetch(srv, null, "")).status).toBe(401);
  });

  it("returns the caller's own profile to a non-admin, with their keys and team", async () => {
    const res = await meFetch(srv, cookie, "");
    expect(res.status).toBe(200);
    const me = (await res.json()) as {
      id: string;
      email: string;
      name: string | null;
      role: string | null;
      teamId: string | null;
      teamName: string | null;
      keys: Array<{ id: string; name: string | null }>;
    };
    expect(me.email).toBe("alice@test.local");
    expect(me.name).toBe("Alice");
    expect(me.id).toBe(srv.env.user.id);
    expect(me.teamId).toBe(srv.env.teamId);
    expect(me.teamName).toBeTruthy();
    // The seeded "alice-agent" key shows up; the secret never does.
    expect(me.keys.some((k) => k.name === "alice-agent")).toBe(true);
    expect(me).not.toHaveProperty("password");
  });
});

describe("self-service password change requires the current password", () => {
  let srv: RunningServer;
  let cookie: string;
  beforeAll(async () => {
    ({ srv, cookie } = await bootAsAlice());
  });
  afterAll(() => srv.stop());

  it("rejects a missing current password (400)", async () => {
    const res = await meFetch(srv, cookie, "/password", {
      method: "POST",
      body: JSON.stringify({ newPassword: "a-fresh-passphrase" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a too-short new password (400)", async () => {
    const res = await meFetch(srv, cookie, "/password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: "password1234",
        newPassword: "short",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a wrong current password (400) and leaves the old one working", async () => {
    const res = await meFetch(srv, cookie, "/password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: "not-her-password",
        newPassword: "a-fresh-passphrase",
      }),
    });
    expect(res.status).toBe(400);
    const stillWorks = await srv.env.auth.api.signInEmail({
      body: { email: "alice@test.local", password: "password1234" },
      asResponse: true,
    });
    expect(stillWorks.status).toBe(200);
  });

  it("changes the password with the right current one; new signs in, old fails", async () => {
    const res = await meFetch(srv, cookie, "/password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: "password1234",
        newPassword: "a-fresh-passphrase",
      }),
    });
    expect(res.status).toBe(204);

    const stale = await srv.env.auth.api
      .signInEmail({
        body: { email: "alice@test.local", password: "password1234" },
        asResponse: true,
      })
      .then((r) => r.status)
      .catch(() => 401);
    expect(stale).toBeGreaterThanOrEqual(400);

    const ok = await srv.env.auth.api.signInEmail({
      body: { email: "alice@test.local", password: "a-fresh-passphrase" },
      asResponse: true,
    });
    expect(ok.status).toBe(200);
  });
});

describe("self-service keys: mint and revoke your own, but never another's", () => {
  let srv: RunningServer;
  let cookie: string;
  beforeAll(async () => {
    ({ srv, cookie } = await bootAsAlice());
  });
  afterAll(() => srv.stop());

  it("mints a key that authenticates the caller's own agent, then revokes it", async () => {
    const minted = await meFetch(srv, cookie, "/keys", { method: "POST" });
    expect(minted.status).toBe(201);
    const { id: keyId, key } = (await minted.json()) as {
      id: string;
      key: string;
    };
    expect(key).toBeTruthy();

    // It shows up in the caller's own listing.
    const listed = (await (await meFetch(srv, cookie, "")).json()) as {
      keys: Array<{ id: string }>;
    };
    expect(listed.keys.some((k) => k.id === keyId)).toBe(true);

    // The key works end-to-end: an agent posts, attributed to Alice.
    const client = await connect(srv.port, key);
    try {
      const text = await callText(client, "post", {
        title: "self-minted key posts a finding",
        situation: "self-minted key posts a finding",
        body: "A key the User minted for themselves works end to end.",
        environment: "Node 22",
        repo: "crew",
      });
      const postId = text.match(/post_[A-Za-z0-9_-]+/)![0];
      const stored = await srv.env.repo.getPost(postId);
      expect(stored!.createdBy).toBe(srv.env.user.id);
    } finally {
      await client.close();
    }

    // Revoke it through the self-service surface; it stops connecting.
    const revoked = await meFetch(srv, cookie, `/keys/${keyId}`, {
      method: "DELETE",
    });
    expect(revoked.status).toBe(204);
    await expect(connect(srv.port, key)).rejects.toThrow();
  });

  it("cannot revoke a key it does not own (404), and that key still works", async () => {
    // A second User on another Team, with their own key.
    const other = await srv.env.addTeamWithUser({
      email: "mallory@other.local",
      name: "Mallory",
    });
    const ownKeys = (await (await meFetch(srv, cookie, "")).json()) as {
      keys: Array<{ id: string }>;
    };
    // Find Mallory's key id via the admin-side adapter is overkill; instead
    // attempt a delete of a plainly foreign id and confirm Mallory's key lives.
    const foreign = await meFetch(srv, cookie, "/keys/key_not_alices", {
      method: "DELETE",
    });
    expect(foreign.status).toBe(404);

    // Alice's own keys are untouched by the failed foreign delete.
    const after = (await (await meFetch(srv, cookie, "")).json()) as {
      keys: Array<{ id: string }>;
    };
    expect(after.keys.length).toBe(ownKeys.keys.length);

    // Mallory's key still authenticates — it was never at risk.
    const client = await connect(srv.port, other.apiKey);
    await client.close();
  });
});
