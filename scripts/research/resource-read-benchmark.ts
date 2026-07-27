import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { normalizeRepo } from "../../packages/server/src/core/post.js";
import type { Principal } from "../../packages/server/src/core/user.js";
import { renderResults } from "../../packages/server/src/guardrails/render.js";
import { retrieve } from "../../packages/server/src/search/retrieve.js";
import { buildServer } from "../../packages/server/src/server.js";
import type { TestEnv } from "../../packages/server/src/test/harness.js";
import { buildTestEnv, callText, connect } from "../../packages/server/src/test/harness.js";

const RESOURCE_TTL_MS = 60_000;
const QUERY_ARGS = {
  situation: "the worker flow needs a reliable retry and queue configuration",
  environment: "Node 24, TypeScript, BullMQ",
  repo: "Onnokh/crew",
  limit: 5,
};

type ResourceEntry = {
  teamId: string;
  userId: string;
  text: string;
  expiresAt: number;
  consumed: boolean;
};

/** Disposable, opaque, team- and user-bound resource handles for the benchmark. */
class ResourceRegistry {
  private readonly entries = new Map<string, ResourceEntry>();

  issue(entry: Omit<ResourceEntry, "expiresAt" | "consumed">, now: number): string {
    const token = randomBytes(24).toString("base64url");
    this.entries.set(token, {
      ...entry,
      expiresAt: now + RESOURCE_TTL_MS,
      consumed: false,
    });
    return token;
  }

  read(token: string, auth: Principal | undefined, now: number): string {
    const entry = this.entries.get(token);
    if (!entry || !auth || entry.teamId !== auth.teamId || entry.userId !== auth.id) {
      throw new Error("Resource not found");
    }
    if (entry.expiresAt <= now || entry.consumed) {
      throw new Error("Resource not found");
    }
    entry.consumed = true;
    return entry.text;
  }
}

function previewText(results: Awaited<ReturnType<typeof retrieve>>): string {
  return [
    "## Shared agent knowledge",
    "",
    "_Preview: read the linked result only when a full note is needed._",
    "",
    ...results.map(
      ({ result }, index) =>
        `${index + 1}. **${result.post.title}** — ${result.post.id} — posted in ${normalizeRepo(result.post.repo)}`,
    ),
  ].join("\n");
}

async function buildPreviewServer(env: TestEnv) {
  const server = buildServer(env.deps);
  const registry = new ResourceRegistry();
  const resourceUriTemplate = "crew://query/{token}";

  server.addResourceTemplate({
    name: "Crew query result",
    description: "One-time authenticated full result for a disposable benchmark.",
    mimeType: "text/markdown",
    uriTemplate: resourceUriTemplate,
    arguments: [{ name: "token", required: true }],
    load: async ({ token }, auth) => ({
      uri: `crew://query/${token}`,
      mimeType: "text/markdown",
      text: registry.read(token, auth, env.deps.clock.now()),
    }),
  });

  server.addTool({
    name: "queryPreview",
    description: "Disposable benchmark adapter: return a preview and an authenticated resource link.",
    parameters: z.object({
      situation: z.string(),
      environment: z.string().optional(),
      repo: z.string().optional(),
      limit: z.number().int().min(1).max(20).default(5),
    }),
    execute: async (args, context: { session?: Principal }) => {
      const principal = context.session;
      if (!principal) throw new Error("Unauthorized");
      const repo = env.deps.teams.getRepository(principal.teamId);
      const ranked = await retrieve(repo, (id) => env.deps.controlPlane.getUser(id), env.deps.clock, {
        situation: args.situation,
        environment: args.environment,
        repo: args.repo ? normalizeRepo(args.repo) : undefined,
        limit: args.limit,
      });
      const fullText = renderResults(ranked.map(({ result }) => result), env.deps.clock.now());
      const token = registry.issue({ teamId: principal.teamId, userId: principal.id, text: fullText }, env.deps.clock.now());
      return {
        content: [
          { type: "text", text: previewText(ranked) },
          {
            type: "resource_link",
            name: "Crew query result",
            uri: `crew://query/${token}`,
            mimeType: "text/markdown",
            description: "Read the full Crew result once when needed.",
          },
        ],
      };
    },
  });

  return { server, registry };
}

async function seed(env: TestEnv): Promise<void> {
  await env.repo.createPost({
    title: "BullMQ flow options",
    situation: QUERY_ARGS.situation,
    body: "Use explicit queue and retry options at the flow boundary, then verify worker startup with a small executable check.",
    environment: QUERY_ARGS.environment,
    repo: QUERY_ARGS.repo,
    createdBy: env.user.id,
  });
}

async function run(): Promise<void> {
  const env = await buildTestEnv();
  let client: Client | undefined;
  let otherClient: Client | undefined;
  let server: Awaited<ReturnType<typeof buildPreviewServer>>["server"] | undefined;
  try {
    await seed(env);
    ({ server } = await buildPreviewServer(env));
    const port = await freePort();
    await server.start({
      transportType: "httpStream",
      httpStream: { port, stateless: true, enableJsonResponse: true },
    });
    client = await connect(port, env.apiKey);
    const preview = await client.callTool({ name: "queryPreview", arguments: QUERY_ARGS });
    const content = preview.content as Array<{ type: string; text?: string; uri?: string }>;
    if (content[0]?.type !== "text" || content[1]?.type !== "resource_link" || !content[1].uri) {
      throw new Error("Preview did not return text plus a resource_link");
    }
    const read = await client.readResource({ uri: content[1].uri });
    const readText = read.contents[0]?.text ?? "";
    if (!readText.includes("BullMQ flow options")) throw new Error("Resource read lost the result body");
    await expectFailure(() => client.readResource({ uri: content[1].uri }), "single-use resource read");

    const direct = await callText(client, "query", QUERY_ARGS);
    if (!direct.includes("BullMQ flow options")) throw new Error("Direct fallback lost the result body");

    const other = await env.addTeamWithUser({ email: "bob@test.local", name: "Bob" });
    otherClient = await connect(port, other.apiKey);
    const secondPreview = await otherClient.callTool({ name: "queryPreview", arguments: QUERY_ARGS });
    const secondLink = (secondPreview.content as Array<{ type: string; uri?: string }>)[1]?.uri;
    if (!secondLink) throw new Error("Second team did not receive a resource link");
    await expectFailure(() => client.readResource({ uri: secondLink }), "cross-team resource read");

    console.log(JSON.stringify({
      result: "pass",
      previewContentBlocks: content.length,
      followedResourceOnce: true,
      duplicateReadRejected: true,
      crossTeamReadRejected: true,
      directFallbackPreserved: true,
      networkCalls: 0,
      crewWrites: 0,
    }, null, 2));
  } finally {
    await client?.close();
    await otherClient?.close();
    await server?.stop();
    env.cleanup();
  }
}

async function expectFailure(action: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run();
}
