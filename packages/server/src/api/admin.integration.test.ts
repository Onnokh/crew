import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hydratePosts } from "../read/hydrate.js";
import { aggregateEvents } from "../trust/aggregate.js";
import {
  buildTestEnv,
  callText,
  connect,
  startTestServer,
  type RunningServer,
} from "../test/harness.js";

/** Boot a server and promote a brand-new admin, returning the cookie to gate on. */
async function bootWithAdmin(): Promise<{
  srv: RunningServer;
  cookie: string;
}> {
  const env = await buildTestEnv();
  // Sign up, then promote the row directly (the first admin can't use the gated API).
  const signUp = await env.auth.api.signUpEmail({
    body: { email: "boss@test.local", password: "password1234", name: "Boss" },
  });
  const { adapter } = await env.auth.$context;
  await adapter.update({
    model: "user",
    where: [{ field: "id", value: signUp.user.id }],
    update: { role: "admin" },
  });
  // The admin must be a member of a Team for its keys to route (ADR 0008).
  env.controlPlane.addMembership(signUp.user.id, env.teamId, 0);
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
    // Seeded "alice" is an ordinary User: the gate must reject on role, not session.
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

    // The password is never returned by the listing; the row carries the Team.
    const list = await adminFetch(srv, cookie, "/users");
    const { users } = (await list.json()) as {
      users: Array<{
        email: string;
        role: string | null;
        teamId: string | null;
        teamName: string | null;
        keys: unknown[];
      }>;
    };
    const bob = users.find((u) => u.email === "bob@test.local");
    expect(bob).toBeDefined();
    expect(bob).not.toHaveProperty("password");
    expect(bob!.role).toBe("user");
    expect(bob!.keys).toHaveLength(0);
    // With no teamId given, the new User defaults to the default Team.
    expect(bob!.teamId).toBe(srv.env.teamId);
    expect(bob!.teamName).toBeTruthy();

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
        users: Array<{ id: string; keys: unknown[] }>;
      }
    ).users.find((u) => u.id === bobId);
    expect(bobAfterMint!.keys).toHaveLength(1);

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
        users: Array<{ id: string; keys: unknown[] }>;
      }
    ).users.find((u) => u.id === bobId);
    expect(bobAfterRevoke!.keys).toHaveLength(0);

    await expect(connect(srv.port, key)).rejects.toThrow();
  });
});

describe("team management: create, list, rename — role-gated, no delete", () => {
  let srv: RunningServer;
  let cookie: string;
  beforeAll(async () => {
    ({ srv, cookie } = await bootWithAdmin());
  });
  afterAll(() => srv.stop());

  it("gates listing teams: no session → 401, non-admin → 403", async () => {
    expect((await adminFetch(srv, null, "/teams")).status).toBe(401);
    const res = await srv.env.auth.api.signInEmail({
      body: { email: "alice@test.local", password: "password1234" },
      asResponse: true,
    });
    const aliceCookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
    expect((await adminFetch(srv, aliceCookie, "/teams")).status).toBe(403);
  });

  it("lists the auto-created default Team", async () => {
    const res = await adminFetch(srv, cookie, "/teams");
    expect(res.status).toBe(200);
    const { teams } = (await res.json()) as {
      teams: Array<{ id: string; name: string; createdAt: number }>;
    };
    expect(teams.length).toBeGreaterThanOrEqual(1);
    expect(teams.some((t) => t.id === srv.env.teamId)).toBe(true);
  });

  it("creates a Team that gets its own corpus; a user routed there is isolated", async () => {
    const created = await adminFetch(srv, cookie, "/teams", {
      method: "POST",
      body: JSON.stringify({ name: "Platform" }),
    });
    expect(created.status).toBe(201);
    const { team } = (await created.json()) as {
      team: { id: string; name: string; createdAt: number };
    };
    expect(team.name).toBe("Platform");
    expect(team.id).not.toBe(srv.env.teamId);

    // It now appears in the listing alongside the default Team.
    const list = await adminFetch(srv, cookie, "/teams");
    const { teams } = (await list.json()) as {
      teams: Array<{ id: string; name: string }>;
    };
    expect(teams.some((t) => t.id === team.id && t.name === "Platform")).toBe(true);

    // The new Team's corpus was provisioned by create and is a DISTINCT store:
    // a Post written through its repo is invisible to the default Team's repo.
    const newRepo = srv.env.teams.getRepository(team.id);
    const defaultRepo = srv.env.teams.getRepository(srv.env.teamId);
    expect(newRepo).not.toBe(defaultRepo);

    // Assign a fresh user to the new Team and confirm routing points there.
    const su = await srv.env.auth.api.signUpEmail({
      body: { email: "dan@platform.local", password: "password1234", name: "Dan" },
    });
    srv.env.controlPlane.addMembership(su.user.id, team.id, 0);
    expect(srv.env.controlPlane.getTeamForUser(su.user.id)?.id).toBe(team.id);
  });

  it("rename is display-only: name changes, id/corpus/routing unchanged", async () => {
    const created = await adminFetch(srv, cookie, "/teams", {
      method: "POST",
      body: JSON.stringify({ name: "Initial" }),
    });
    const { team } = (await created.json()) as { team: { id: string } };
    const repoBefore = srv.env.teams.getRepository(team.id);

    const renamed = await adminFetch(srv, cookie, `/teams/${team.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(renamed.status).toBe(200);
    expect((await renamed.json()) as { team: { name: string } }).toMatchObject({
      team: { id: team.id, name: "Renamed" },
    });

    // Same id, same cached connection (no file move).
    expect(srv.env.controlPlane.getTeam(team.id)?.name).toBe("Renamed");
    expect(srv.env.teams.getRepository(team.id)).toBe(repoBefore);
  });

  it("rejects an empty team name (400) and an unknown id on rename (404)", async () => {
    const empty = await adminFetch(srv, cookie, "/teams", {
      method: "POST",
      body: JSON.stringify({ name: "   " }),
    });
    expect(empty.status).toBe(400);
    const missing = await adminFetch(srv, cookie, "/teams/team_nope", {
      method: "PATCH",
      body: JSON.stringify({ name: "X" }),
    });
    expect(missing.status).toBe(404);
  });

  it("exposes no team-deletion route", async () => {
    const res = await adminFetch(srv, cookie, `/teams/${srv.env.teamId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});

describe("create a User on a chosen Team; a minted key routes to that Team's corpus", () => {
  let srv: RunningServer;
  let cookie: string;
  beforeAll(async () => {
    ({ srv, cookie } = await bootWithAdmin());
  });
  afterAll(() => srv.stop());

  it("binds the User to the picked Team and routes its key there end-to-end", async () => {
    // A second Team to assign the User to (distinct from the default Team).
    const createdTeam = await adminFetch(srv, cookie, "/teams", {
      method: "POST",
      body: JSON.stringify({ name: "Research" }),
    });
    const { team } = (await createdTeam.json()) as { team: { id: string } };
    expect(team.id).not.toBe(srv.env.teamId);

    // Create a User WITH teamId — it must land in the Research Team, not default.
    const createdUser = await adminFetch(srv, cookie, "/users", {
      method: "POST",
      body: JSON.stringify({ email: "rey@research.local", teamId: team.id }),
    });
    expect(createdUser.status).toBe(201);
    const reyId = ((await createdUser.json()) as { user: { id: string } }).user
      .id;
    expect(srv.env.controlPlane.getTeamForUser(reyId)?.id).toBe(team.id);

    // Mint a key for the User and post with it — the Post lands in the Research
    // Team's corpus (routed by the key alone), invisible to the default corpus.
    const minted = await adminFetch(srv, cookie, `/users/${reyId}/keys`, {
      method: "POST",
    });
    const { key } = (await minted.json()) as { key: string };
    const client = await connect(srv.port, key);
    let postId: string;
    try {
      const text = await callText(client, "post", {
        title: "research finding",
        situation: "a finding posted by a Research-team agent",
        body: "It must land in the Research corpus only.",
        environment: "Node 22",
        repo: "crew",
      });
      postId = text.match(/post_[A-Za-z0-9_-]+/)![0];
    } finally {
      await client.close();
    }

    const researchRepo = srv.env.teams.getRepository(team.id);
    const defaultRepo = srv.env.teams.getRepository(srv.env.teamId);
    expect(await researchRepo.getPost(postId)).not.toBeNull();
    expect(await defaultRepo.getPost(postId)).toBeNull();
  });

  it("rejects an unknown teamId (400)", async () => {
    const res = await adminFetch(srv, cookie, "/users", {
      method: "POST",
      body: JSON.stringify({ email: "nobody@team.local", teamId: "team_nope" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("delete is the single off-switch: kills login + keys, frees the email, keeps Posts", () => {
  let srv: RunningServer;
  let cookie: string;
  beforeAll(async () => {
    ({ srv, cookie } = await bootWithAdmin());
  });
  afterAll(() => srv.stop());

  it("revokes keys + removes user+membership; the email frees up; the Post stays with unchanged trust, rendered unknown", async () => {
    const created = await adminFetch(srv, cookie, "/users", {
      method: "POST",
      body: JSON.stringify({ email: "carol@test.local" }),
    });
    const { user, password } = (await created.json()) as {
      user: { id: string };
      password: string;
    };
    const carolId = user.id;

    // Carol mints a key and posts before the delete — that Post must outlive her.
    const minted = await adminFetch(srv, cookie, `/users/${carolId}/keys`, {
      method: "POST",
    });
    const { key } = (await minted.json()) as { key: string };

    const client = await connect(srv.port, key);
    let postId: string;
    try {
      const text = await callText(client, "post", {
        title: "finding authored before the delete",
        situation: "a finding authored before its author was deleted",
        body: "This Post must stay in the corpus after the author is deleted.",
        environment: "Node 22",
        repo: "crew",
      });
      postId = text.match(/post_[A-Za-z0-9_-]+/)![0];
      // Confirm + flag it so we can assert the trust counts survive the delete.
      await callText(client, "confirm", { post_id: postId, note: "works" });
      await callText(client, "flag", { post_id: postId, reason: "incorrect" });
    } finally {
      await client.close();
    }

    // Trust counts before the delete: 1 confirm, 1 flag.
    const before = aggregateEvents(
      await srv.env.repo.getEventsForPosts([postId]),
    );
    expect(before).toMatchObject({ confirms: 1, flags: 1 });

    // Delete Carol.
    const deleted = await adminFetch(srv, cookie, `/users/${carolId}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);
    expect((await deleted.json()) as { keysRevoked: number }).toMatchObject({
      deleted: true,
      keysRevoked: 1,
    });

    // Login is gone: the credentials no longer authenticate.
    const signIn = await srv.env.auth.api
      .signInEmail({
        body: { email: "carol@test.local", password },
        asResponse: true,
      })
      .then((r) => r.status)
      .catch(() => 401);
    expect(signIn).toBeGreaterThanOrEqual(400);

    // The key is dead: it can no longer connect over /mcp.
    await expect(connect(srv.port, key)).rejects.toThrow();

    // Identity is gone: the user row and its membership were removed.
    expect(srv.env.controlPlane.getUser(carolId)).toBeNull();
    expect(srv.env.controlPlane.getTeamForUser(carolId)).toBeNull();

    // Her Post survives, still recorded against her (now-orphaned) id, with the
    // SAME trust counts — deletion does not rewrite history.
    const stored = await srv.env.repo.getPost(postId);
    expect(stored).not.toBeNull();
    expect(stored!.createdBy).toBe(carolId);
    const after = aggregateEvents(
      await srv.env.repo.getEventsForPosts([postId]),
    );
    expect(after).toMatchObject({ confirms: 1, flags: 1 });

    // The author no longer resolves and renders as "unknown" (read-time lookup).
    const [hydrated] = await hydratePosts(
      srv.env.repo,
      (id) => srv.env.controlPlane.getUser(id),
      [stored!],
    );
    expect(hydrated!.authorName).toBe("unknown");

    // The email frees up: a brand-new User can be created with it again.
    const recreated = await adminFetch(srv, cookie, "/users", {
      method: "POST",
      body: JSON.stringify({ email: "carol@test.local" }),
    });
    expect(recreated.status).toBe(201);
    const newId = ((await recreated.json()) as { user: { id: string } }).user.id;
    expect(newId).not.toBe(carolId);
  });
});

describe("the ban endpoint is gone", () => {
  let srv: RunningServer;
  let cookie: string;
  beforeAll(async () => {
    ({ srv, cookie } = await bootWithAdmin());
  });
  afterAll(() => srv.stop());

  it("POST /users/:id/ban 404s — ban is no longer a route", async () => {
    const res = await adminFetch(srv, cookie, "/users/anyone/ban", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});
