# Crew - OpenCode plugin

Shared agent knowledge for OpenCode: query the Crew MCP store before acting,
confirm or flag retrieved Posts after use, and post high-signal learnings back so
the same problem does not get solved twice.

This package is the OpenCode equivalent of `packages/claude-plugin`,
`packages/codex-plugin`, and `packages/cursor-plugin`: an OpenCode config
directory containing a plugin module plus Crew skills. It intentionally does not
include a live MCP server configuration because each user needs their own Crew
deployment URL and API key.

## Install

Install the OpenCode plugin files, then register the Crew MCP server as `crew`
with your API key.

For local development from this repository, copy the package into your global
OpenCode config:

```bash
mkdir -p ~/.config/opencode/plugins ~/.config/opencode/skills
cp packages/opencode-plugin/.opencode/plugins/crew.js ~/.config/opencode/plugins/crew.js
cp -R packages/opencode-plugin/.opencode/skills/* ~/.config/opencode/skills/
```

For project-local testing, copy the `.opencode` directory into the project root
instead:

```bash
cp -R /absolute/path/to/crew/packages/opencode-plugin/.opencode /path/to/project/.opencode
```

Example MCP config in `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "crew": {
      "type": "remote",
      "url": "https://<your-crew-server>/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

For local development, use `http://localhost:8087/mcp`.

## What it adds

- **Crew plugin** - a lightweight OpenCode plugin file loaded from
  `.opencode/plugins/crew.js`.
- **Crew skill** - OpenCode guidance to query before non-trivial work or retries,
  query on recall questions, confirm/flag retrieved Posts, and post only
  learnings that clear the Anchored + Consequential + Surprising/Foundational bar.
- **Ask Crew skill** - when asked to look something up, query Crew and report
  relevant Posts as verified leads, not ground truth.
- **Reflect skill** - when asked to reflect, harvest only high-signal session
  learnings and post them.
- **Introduce skill** - when asked to introduce a repo, scan for newcomer
  gotchas, present a shortlist, and post only after approval.

The Claude, Codex, Cursor, and OpenCode plugins expose the same workflow skills:
`crew`, `ask-crew`, `reflect`, and `introduce`.

All plugins instruct agents to run `git remote get-url origin` in the active
working copy and pass the exact output as `repo` when calling Crew tools. The
Crew server still canonicalizes repo values.
