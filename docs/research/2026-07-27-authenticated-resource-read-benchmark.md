# Authenticated Crew resource-read benchmark

Date: 2026-07-27  
Question: **Can Crew expose a retrieval result through a short-lived,
team-authorized resource link that an MCP client can follow exactly once, with
direct-text fallback?**

## Decision-relevant result

The disposable server-side seam passed against Crew's real FastMCP server,
better-auth authentication, team repository resolver, retrieval pipeline, and
the MCP SDK client:

| Gate | Result |
| --- | --- |
| Preview plus `resource_link` returned | pass: 2 content blocks |
| Authenticated `resources/read` follow-up | pass: full result body returned |
| Duplicate follow-up | pass: rejected as consumed |
| Cross-team follow-up | pass: rejected |
| Direct-text fallback | pass: existing `query` result remained consumable |
| Production/frozen-corpus writes | none |

The harness is [`resource-read-benchmark.ts`](../../scripts/research/resource-read-benchmark.ts).
It is disposable: the registry, preview tool, and resource template are
constructed only in the script around the existing server composition root.
No production tool, route, migration, or resource registration was changed.

## What the seam proves

The resource contract can be shaped safely around an opaque, short-lived
handle. The handle is bound to both the authenticated User and Team, the full
Markdown result stays server-side, and the `resources/read` loader re-checks
that boundary before returning it. A consumed handle cannot be read again.

The same harness also calls the existing direct `query` tool. That fallback
continues to return the full result as a normal text block, so a client that
does not understand resource links has a usable path.

Verification run:

```text
npx tsx scripts/research/resource-read-benchmark.ts       pass
npm run typecheck -w @crew/server                         pass
npm test -w @crew/server -- --run                         205 tests passed
git diff --check                                           pass
```

The harness uses temporary local control-plane and team databases. Its
`networkCalls: 0` and `crewWrites: 0` counters refer to the benchmark itself;
the local fixture necessarily writes temporary seed data and the normal direct
query writes only to that temporary telemetry store.

## Live executor boundary

A real read-only query through the configured executor returned one `text`
content block, no `resource_link`, and no resource-read follow-up surface. The
current live Crew deployment therefore still exposes direct text only. This is
consistent with the repository's production registration: it registers
`query`, `post`, `confirm`, and `flag`, but no resource template or preview tool.

Therefore the task proves the authenticated MCP seam locally, but it does not
yet prove a live Codex executor token or quality advantage. The next required
step is to expose this seam in a disposable remotely reachable benchmark
deployment (or an executor-supported local target), then replay matched direct
versus preview/link traces. Do not select resource-link as a production winner
until that executor trace exists.

## Acceptance decision

The security and transport acceptance gates pass in the disposable real-server
harness. The causal live-executor gate remains open. Direct text stays the
fallback; preview plus resource link remains the candidate for a live,
client-specific benchmark.

