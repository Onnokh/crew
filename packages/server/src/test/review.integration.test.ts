import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildFakeDeps,
  buildSqliteRepo,
  callText,
  connect,
  startTestServer,
  VALID_TOKEN,
  type RunningServer,
} from "./harness.js";
import type { SqliteRepository } from "../store/sqlite-repository.js";

/**
 * Integration test for the human `/review` page (slice 0007). Drives the page
 * through the REAL Hono app FastMCP exposes — the same store over `:memory:`,
 * fake embedder, no model download — exercising what can only be observed
 * through the browser-facing HTTP boundary: cookie login behind the shared auth
 * seam, the listing with counts, and that retire/restore actually move a Post in
 * and out of agent `query` results.
 *
 * The page is fetched with plain `fetch` (not the MCP client) against the same
 * port; retire/restore effects are then confirmed back through the MCP `query`
 * tool, proving the two surfaces share one store.
 */
describe("/review human page + cookie auth", () => {
  const repo: SqliteRepository = buildSqliteRepo();
  let srv: RunningServer;
  let base: string;

  beforeAll(async () => {
    srv = await startTestServer(buildFakeDeps(repo));
    base = `http://localhost:${srv.port}`;
  });
  afterAll(() => srv.stop());

  /** Seed one Post via its tool and return its id. */
  async function seedPost(situation: string, body: string): Promise<string> {
    const client = await connect(srv.port);
    try {
      const text = await callText(client, "post", {
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

  /** Log in and return the session cookie header value to replay on requests. */
  async function login(token = VALID_TOKEN): Promise<string> {
    const form = new URLSearchParams({ token });
    const res = await fetch(`${base}/review/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("soa_session=");
    expect(setCookie.toLowerCase()).toContain("httponly");
    // Reduce "soa_session=<token>; Path=/; ..." to the name=value pair to replay.
    return setCookie.split(";")[0]!;
  }

  it("an unauthenticated GET /review serves the login form, not the data", async () => {
    const res = await fetch(`${base}/review`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Paste your bearer token");
    expect(html).toContain('name="token"');
    expect(html).not.toContain("Recent Posts");
  });

  it("a bad token is rejected by the same auth seam", async () => {
    const form = new URLSearchParams({ token: "bogus-token" });
    const res = await fetch(`${base}/review/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      redirect: "manual",
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("logging in sets a cookie and the page then lists Posts with counts", async () => {
    const id = await seedPost(
      "review page lists this post",
      "the body of the listed post",
    );
    // Give it a confirm so a non-zero count renders.
    const client = await connect(srv.port);
    try {
      await callText(client, "confirm", { post_id: id, note: "works" });
    } finally {
      await client.close();
    }

    const cookie = await login();
    const res = await fetch(`${base}/review`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Recent Posts");
    expect(html).toContain("review page lists this post");
    expect(html).toContain("1 confirms / 0 flags");
    expect(html).toContain("Signed in as");
  });

  it("retiring a Post removes it from query results; restoring brings it back", async () => {
    const situation = "retire me from agent queries";
    const id = await seedPost(situation, "body that should vanish then return");

    const queryFinds = async (): Promise<boolean> => {
      const client = await connect(srv.port);
      try {
        const text = await callText(client, "query", { situation });
        return text.includes(situation);
      } finally {
        await client.close();
      }
    };

    // Visible to agents before retiring.
    expect(await queryFinds()).toBe(true);

    const cookie = await login();
    const retire = await fetch(`${base}/review/${id}/retire`, {
      method: "POST",
      headers: { cookie },
      redirect: "manual",
    });
    expect(retire.status).toBe(303);

    // A retired Post is invisible to agent `query`.
    expect(await queryFinds()).toBe(false);
    // ...but still shown on the review page, tagged retired, so it can be restored.
    const afterRetire = await (
      await fetch(`${base}/review`, { headers: { cookie } })
    ).text();
    expect(afterRetire).toContain(situation);
    expect(afterRetire).toContain("retired");

    const restore = await fetch(`${base}/review/${id}/restore`, {
      method: "POST",
      headers: { cookie },
      redirect: "manual",
    });
    expect(restore.status).toBe(303);

    // Restoring returns it to agent `query` results.
    expect(await queryFinds()).toBe(true);
  });

  it("retire is refused without a session cookie", async () => {
    const id = await seedPost("unauthenticated retire probe", "body");
    const res = await fetch(`${base}/review/${id}/retire`, {
      method: "POST",
      redirect: "manual",
    });
    expect(res.status).toBe(401);
    // Still queryable — the action was not performed.
    const client = await connect(srv.port);
    try {
      const text = await callText(client, "query", {
        situation: "unauthenticated retire probe",
      });
      expect(text).toContain("unauthenticated retire probe");
    } finally {
      await client.close();
    }
  });
});
