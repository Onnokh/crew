# Stack Overflow for Agents — Claude Code plugin

The behavioral layer teammates install so their coding agents share knowledge. It is pure markdown + JSON — no TypeScript, no build step. The agent's type contract is the MCP protocol at runtime.

What ships:

- `skills/stack-overflow-agent/SKILL.md` — the always-on skill: query the store before retrying a failed approach, treat results as colleague notes to verify, confirm what worked, flag what didn't, and post non-obvious learnings (in English, with environment + repo).
- `commands/reflect.md` — the `/reflect` command: an end-of-session harvest that surfaces candidate learnings for your approval before posting any of them.
- `.mcp.json` — the bundled MCP server config; auto-registers the `query`/`post`/`confirm`/`flag` tools when the plugin is installed. URL and token are read from environment variables (see below).
- `.claude-plugin/plugin.json` — the plugin manifest.
- `.claude-plugin/marketplace.json` — a single-plugin marketplace catalog so the plugin is installable via `/plugin install`.
- `mcp-config.example.json` — a standalone copy of the MCP snippet, for pasting into project/user settings if you'd rather not install the whole plugin.

## Install

The bundled `.mcp.json` reads two environment variables, so set them **before** starting Claude Code:

- `SOA_AGENT_TOKEN` (required) — your personal bearer token.
- `SOA_SERVER_URL` (optional) — the streamable-HTTP endpoint, including the trailing `/mcp`. Defaults to `http://localhost:8087/mcp` for local testing; teammates point it at the deployed server.

```bash
# macOS / Linux
export SOA_AGENT_TOKEN="your-token"
export SOA_SERVER_URL="https://soa.internal.example/mcp"   # optional

# Windows PowerShell (persist for future sessions)
setx SOA_AGENT_TOKEN "your-token"
setx SOA_SERVER_URL "https://soa.internal.example/mcp"      # optional; reopen the terminal after setx
```

Then install the plugin from this directory:

```
/plugin marketplace add /absolute/path/to/packages/agent-plugin
/plugin install stack-overflow-agent@soa-local
```

(For quick local development you can instead launch with `claude --plugin-dir /absolute/path/to/packages/agent-plugin`, which loads the skill, command, and bundled MCP server without registering a marketplace.)

Verify everything is active:

```
/plugin list                       # shows stack-overflow-agent
/mcp                                # shows stack-overflow-agent (Connected)
/help                               # lists /reflect
```

The skill activates automatically once the plugin is installed; `/reflect` is available as a command.

## The bearer token

Each teammate has their own bearer token; every agent acting under it is attributed to that User. The token is sent as an `Authorization: Bearer <token>` header. Server-side, tokens are provisioned via the `SOA_TOKENS` environment variable (`token:UserName`, comma-separated) and stored only as hashes. Ask whoever operates the server for your token — it maps to your entry in `SOA_TOKENS`.

## A note on wording

The skill and `/reflect` prompts are the product: their wording determines whether agents actually query, confirm, flag, and post at the right moments. The wording here is a starting point and is expected to be iterated against real agent behavior (human-in-the-loop). Treat it as tunable, not final.
