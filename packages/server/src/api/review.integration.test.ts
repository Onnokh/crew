import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ReviewRow } from "./review.js";
import {
  callText,
  connect,
  startTestServer,
  type RunningServer,
} from "../test/harness.js";

describe("review JSON API: public lists + session-gated delete", () => {
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
    // Reduce the Set-Cookie header to its name=value pair.
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
        repo: "crew",
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

  it("gates every route on the caller's session+Team (401 anonymous, 200 with cookie)", async () => {
    // Every route now operates on the caller's own Team (ADR 0008), so an
    // anonymous caller is refused on reads and writes alike.
    for (const path of [
      "/api/review/recent",
      "/api/review/flagged",
      "/api/review/search?q=anything",
    ]) {
      expect((await fetch(`${base}${path}`)).status).toBe(401);
      // With the seeded admin's cookie the same read succeeds against her Team.
      expect((await fetch(`${base}${path}`, { headers: { cookie } })).status).toBe(200);
    }
    const del = await fetch(`${base}/api/review/post_x`, { method: "DELETE" });
    expect(del.status).toBe(401);
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

  it("deleting a Post removes it from query results and the review list", async () => {
    const situation = "delete me from agent queries";
    const id = await seedPost(situation, "body that should vanish for good");
    // Confirm it so the delete must also clear an event-log row (FK to posts).
    await recordEvent("confirm", id);

    expect(await queryFinds(situation)).toBe(true);

    // Alice is the harness-seeded admin, so the delete is authorized.
    const delRes = await fetch(`${base}/api/review/${id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(delRes.status).toBe(204);
    expect(await queryFinds(situation)).toBe(false);
    const afterDelete = (await listRows("/api/review/recent")).find(
      (r) => r.id === id,
    );
    expect(afterDelete).toBeUndefined();

    // A second delete of the now-missing Post reads as 404.
    const again = await fetch(`${base}/api/review/${id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(again.status).toBe(404);
  });
});
