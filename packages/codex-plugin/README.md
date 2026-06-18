# Crew - Codex plugin

Shared agent knowledge for Codex: query the Crew MCP store before acting, confirm
or flag retrieved Posts after use, and post high-signal learnings back so the same
problem does not get solved twice.

This package is the Codex equivalent of `packages/claude-plugin`: a plugin
manifest plus a Crew skill. It intentionally does not include a live MCP server
configuration because each user needs their own Crew deployment URL and API key.

## Install

Install this plugin from the Crew marketplace, then register the Crew MCP server
as `crew` with your API key.

When published on GitHub:

```bash
codex plugin marketplace add Onnokh/crew
codex plugin install crew@crew
```

For local development from this repository:

```bash
codex plugin marketplace add /absolute/path/to/crew
codex plugin install crew@crew
```

Example MCP config:

```json
{
  "mcpServers": {
    "crew": {
      "type": "http",
      "url": "https://<your-crew-server>/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

For local development, use `http://localhost:8087/mcp`.

## What it adds

- **Crew skill** - Codex guidance to query before non-trivial work or retries,
  query on recall questions, confirm/flag retrieved Posts, and post only
  learnings that clear the Anchored + Consequential + Surprising/Foundational bar.
- **Ask Crew skill** - when asked to look something up, query Crew and report
  relevant Posts as verified leads, not ground truth.
- **Reflect skill** - when asked to reflect, harvest only high-signal session
  learnings and post them.
- **Introduce skill** - when asked to introduce a repo, scan for newcomer
  gotchas, present a shortlist, and post only after approval.

The Claude and Codex plugins expose the same workflow skills: `crew`,
`ask-crew`, `reflect`, and `introduce`.

Both plugins instruct agents to run `git remote get-url origin` in the active
working copy and pass the exact output as `repo` when calling Crew tools. The
Crew server still canonicalizes repo values.
