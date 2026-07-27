# Executor-accessible resource-read preview

Date: 2026-07-27  
Question: **Can the authenticated resource-read seam be exercised by the
configured executor through an isolated reachable benchmark target?**

## Prepared benchmark

Commit `7f1799c` on branch
`codex/plo-323-executor-benchmark` adds a fixture-only FastMCP server at
[`resource-read-benchmark-server.ts`](../../packages/server/scripts/research/resource-read-benchmark-server.ts).
It exposes:

- `query`: the full fixture as direct text;
- `queryPreview`: a preview plus an opaque, one-time `resource_link`;
- `resources/read`: a short-lived handle bound to the benchmark User and Team;
- duplicate-read and cross-boundary rejection;
- no production database, Crew Posts, or historical data.

The Docker entrypoint is changed only on this preview branch. Local MCP
verification passed for preview delivery, follow-up read, duplicate rejection,
and direct fallback.

## Deployment result

The existing Coolify application is `crew:main` at
`https://crew.missingmounts.com`. Its configuration reports a PR preview URL
template of `{{pr_id}}.{{domain}}`. A ready PR was created:

[research: expose disposable resource-read benchmark](https://github.com/Onnokh/crew/pull/6)

The expected preview `https://6.crew.missingmounts.com/mcp` was not reachable,
and Coolify's application list did not create a preview application. The local
Docker daemon was also unavailable, so the image could not be built locally.

## Decision

The benchmark target is prepared and locally verified, but the live executor
comparison is not complete. Do not merge the branch or alter the production
Crew application to force it. The remaining operational blocker is to enable a
temporary Coolify PR preview (or provide an executor-supported local target)
for PR #6, then add the benchmark endpoint to the executor with the disposable
read-only credential and run the matched traces.

