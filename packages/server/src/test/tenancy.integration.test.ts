import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildTestEnv,
  callText,
  connect,
  startTestServer,
  type RunningServer,
  type TestEnv,
} from "./harness.js";

/**
 * PLO-54 acceptance: two Teams on one host have physically separate corpora, and
 * the API key alone selects the corpus (no team parameter on the agent path).
 * A Post created under Team A's key must never be returned by a `query` under
 * Team B's key.
 */
describe("two-team corpus isolation over one host", () => {
  let srv: RunningServer;
  let env: TestEnv;
  let teamBKey: string;

  beforeAll(async () => {
    env = await buildTestEnv(); // seeds Team A (Alice) + her key
    const teamB = await env.addTeamWithUser({
      email: "bob@team-b.local",
      name: "Bob",
    });
    teamBKey = teamB.apiKey;
    // Sanity: the two teams are distinct DBs (distinct ids → distinct files).
    expect(teamB.teamId).not.toBe(env.teamId);
    srv = await startTestServer(env);
  });
  afterAll(() => srv.stop());

  const situation = "team-a only secret about the deployment pipeline";

  it("a Post under Team A's key is invisible to a query under Team B's key", async () => {
    // Team A's agent posts into Team A's corpus.
    const aClient = await connect(srv.port, env.apiKey);
    try {
      const text = await callText(aClient, "post", {
        title: "team A secret",
        situation,
        body: "Only Team A should ever see this.",
        environment: "Node 22",
        repo: "team-a/app",
      });
      expect(text).toContain("Posted.");
    } finally {
      await aClient.close();
    }

    // Team A can find its own Post.
    const aFind = await connect(srv.port, env.apiKey);
    try {
      const text = await callText(aFind, "query", { situation });
      expect(text).toContain(situation);
    } finally {
      await aFind.close();
    }

    // Team B, querying the exact same situation, sees an empty corpus.
    const bClient = await connect(srv.port, teamBKey);
    try {
      const text = await callText(bClient, "query", { situation });
      expect(text).not.toContain(situation);
      expect(text).toContain("No matching Posts yet.");
    } finally {
      await bClient.close();
    }
  });
});
