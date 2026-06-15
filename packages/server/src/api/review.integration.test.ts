import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReviewRow } from "./review.js";
import {
  callText,
  connect,
  startTestServer,
  type RunningServer,
} from "../test/harness.js";

/**
 * Integration test for the review JSON API (slice 0013) — the JSON successor to
 * the server-rendered `/review` integration test 0010 deleted. Drives the REAL
 * Hono app FastMCP exposes (real store over `:memory:`, real better-auth, fake
 * embedder — no model download), exercising what can only be observed through the
 * HTTP boundary: that the endpoints sit behind the session seam (401 without a
 * cookie), that the lists carry correct confirm/flag/view counts, and that
 * retire/restore actually move a Post in and out of agent `query` results.
 *
 * Posts are seeded and the retire/restore effect is confirmed back through the
 * MCP `query` tool, proving the review surface and the agent surface share one
 * store. The human session cookie is minted through better-auth's email sign-in
 * (the harness seeds Alice with a known password), the same path the console's
 * login flow drives in production.
 */
describe("review JSON API: session-gated lists + retire/restore", () => {
  let srv: RunningServer;
  let base: string;
  let cookie: string;

  beforeAll(async () => {
    srv = await startTestServer();
    base = `http://localhost:${srv.port}`;
    cookie = await signIn();
  });
  afterAll(() => srv.stop());

  /** Sign in as the harness-seeded Alice and return the session cookie pair. */
  async function signIn(): Promise<string> {
    const res = await fetch(`${base}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "alice@test.local",
        password: "password1234",
      }),
    });
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toBeTruthy();
    // Reduce "better-auth.session_token=<v>; Path=/; ..." to the name=value pair.
    return setCookie.split(";")[0]!;
  }

  /** Seed one Post via its MCP tool and return its id. */
  async function seedPost(situation: string, body: string): Promise<string> {
    const client = await connect(srv.port, srv.env.apiKey);
    try {
      const text = await callText(client, "post", {
        title: situation,
        situation,
        body,
        environment: "Node 22",
        repo: "stack-overflow-agent",
      });
      const id = text.match(/post_[A-Za-z0-9_-]+/)?.[0];
      if (!id) throw new Error(`no post id in: ${text}`);
      return id;
    } finally {
      await client.close();
    }
  }

  /** Confirm or flag a Post through its MCP tool. */
  async function recordEvent(
    verdict: "confirm" | "flag",
    id: string,
  ): Promise<void> {
    const client = await connect(srv.port, srv.env.apiKey);
    try {
      const args =
        verdict === "confirm"
          ? { post_id: id, note: "works" }
          : { post_id: id, reason: "incorrect" as const };
      await callText(client, verdict, args);
    } finally {
      await client.close();
    }
  }

  /** GET a review list with the session cookie; assert 200 and return its rows. */
  async function listRows(path: string): Promise<ReviewRow[]> {
    const res = await fetch(`${base}${path}`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { posts: ReviewRow[] };
    return body.posts;
  }

  /** Does the agent `query` tool currently surface this situation? */
  async function queryFinds(situation: string): Promise<boolean> {
    const client = await connect(srv.port, srv.env.apiKey);
    try {
      const text = await callText(client, "query", { situation });
      return text.includes(situation);
    } finally {
      await client.close();
    }
  }

  it("refuses every endpoint without a session (401)", async () => {
    for (const [method, path] of [
      ["GET", "/api/review/recent"],
      ["GET", "/api/review/flagged"],
      ["POST", "/api/review/post_x/retire"],
      ["POST", "/api/review/post_x/restore"],
    ] as const) {
      const res = await fetch(`${base}${path}`, { method });
      expect(res.status).toBe(401);
    }
  });

  it("list-recent returns Posts with correct confirm/flag/view counts", async () => {
    const id = await seedPost(
      "recent list surfaces this post",
      "body of the recent post",
    );
    await recordEvent("confirm", id);
    await recordEvent("confirm", id);
    await recordEvent("flag", id);
    // One agent query surfaces it once, so its view tally reads 1 afterwards.
    await queryFinds("recent list surfaces this post");

    const rows = await listRows("/api/review/recent");
    const row = rows.find((r) => r.id === id);
    expect(row).toBeDefined();
    expect(row!.situation).toBe("recent list surfaces this post");
    expect(row!.authorName).toBe("Alice");
    expect(row!.confirms).toBe(2);
    expect(row!.flags).toBe(1);
    expect(row!.views).toBe(1);
  });

  it("list-flagged returns only flagged Posts, with their counts", async () => {
    const flaggedId = await seedPost(
      "flagged list surfaces this post",
      "body of the flagged post",
    );
    const cleanId = await seedPost(
      "clean post stays out of flagged list",
      "body of the clean post",
    );
    await recordEvent("flag", flaggedId);

    const rows = await listRows("/api/review/flagged");
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(flaggedId);
    expect(ids).not.toContain(cleanId);
    expect(rows.find((r) => r.id === flaggedId)!.flags).toBe(1);
  });

  it("retiring a Post removes it from query results; restoring brings it back", async () => {
    const situation = "retire me from agent queries";
    const id = await seedPost(situation, "body that should vanish then return");

    expect(await queryFinds(situation)).toBe(true);

    const retireRes = await fetch(`${base}/api/review/${id}/retire`, {
      method: "POST",
      headers: { cookie },
    });
    expect(retireRes.status).toBe(204);
    expect(await queryFinds(situation)).toBe(false);
    // The retired Post still appears in the review list (so it can be restored).
    const afterRetire = (await listRows("/api/review/recent")).find(
      (r) => r.id === id,
    );
    expect(afterRetire!.status).toBe("retired");

    const restoreRes = await fetch(`${base}/api/review/${id}/restore`, {
      method: "POST",
      headers: { cookie },
    });
    expect(restoreRes.status).toBe(204);
    expect(await queryFinds(situation)).toBe(true);
  });
});
