import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestEnv,
  callText,
  connect,
  startTestServer,
  type RunningServer,
} from "../test/harness.js";
import type { RepoPostCount } from "../store/queries.js";
import type { UserUsageItem } from "./telemetry.js";

/**
 * Boot a server and sign in the seeded ordinary User "alice" (a NON-admin),
 * returning her session cookie. `/api/community/*` must work for her without any
 * admin role — it is the member-facing counterpart to the admin telemetry API,
 * scoped to her own Team.
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

/** Call the community API on the booted server with a session cookie attached. */
function communityFetch(
  srv: RunningServer,
  cookie: string | null,
  path: string,
): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return fetch(`http://localhost:${srv.port}/api/community${path}`, { headers });
}

describe("/api/community is session-gated, not role-gated", () => {
  let srv: RunningServer;
  let cookie: string;
  beforeAll(async () => {
    ({ srv, cookie } = await bootAsAlice());
  });
  afterAll(() => srv.stop());

  it("refuses a request with no session (401)", async () => {
    expect((await communityFetch(srv, null, "/legends")).status).toBe(401);
  });

  it("returns the caller's Team legends + per-project counts to a non-admin", async () => {
    // Alice posts a finding via her seeded key so there is something to rank.
    const client = await connect(srv.port, srv.env.apiKey);
    try {
      await callText(client, "post", {
        title: "community legends shows this post's repo",
        situation: "community legends shows this post's repo",
        body: "A post authored by Alice should surface in her Team's legends.",
        environment: "Node 22",
        repo: "crew",
      });
    } finally {
      await client.close();
    }

    const res = await communityFetch(srv, cookie, "/legends");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      users: UserUsageItem[];
      projects: RepoPostCount[];
    };

    // Alice ranks among the top users, with a resolved name.
    expect(data.users.some((u) => u.userId === srv.env.user.id)).toBe(true);
    expect(data.users.find((u) => u.userId === srv.env.user.id)?.name).toBe(
      "Alice",
    );
    // Her repo shows up in the per-project breakdown.
    expect(data.projects.some((p) => p.repo === "crew" && p.posts >= 1)).toBe(
      true,
    );
  });
});
