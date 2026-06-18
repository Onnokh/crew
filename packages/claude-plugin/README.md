# Crew Claude Plugin

The behavioral layer teammates install so their coding agents share knowledge. It is pure markdown + JSON — no TypeScript, no build step. The agent's type contract is the MCP protocol at runtime.

## Install

The plugin ships the skill, the `/crew:*` commands, and a `PreToolUse` hook. The
MCP **connection is registered separately** at user scope, so your personal API
key lives directly in the server definition (no environment-variable indirection).

Register the server once with your key (minted in the admin console — see "The API
key" below). The token sits inline in the `Authorization` header, stored in your
user config (`~/.claude.json`):

```bash
claude mcp add --scope user --transport http crew \
  http://localhost:8087/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
# teammates point at the deployed origin instead, e.g. https://crew.internal.example/mcp
```

That command is just a convenience — it writes the entry below into `~/.claude.json`. You can hand-edit that file instead (same result):

```json
{
  "mcpServers": {
    "crew": {
      "type": "http",
      "url": "http://localhost:8087/mcp",
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}
```

Then install the plugin from this directory:

```
/plugin marketplace add /absolute/path/to/packages/claude-plugin
/plugin install crew@crew-local
```

The hook matches the MCP tools by name (`mcp__crew__*`), so register the server
as `crew` exactly. (For quick local development you can instead launch with
`claude --plugin-dir /absolute/path/to/packages/claude-plugin`.)

Verify everything is active:

```
/plugin list                       # shows crew
/mcp                                # shows crew (Connected)
/help                               # lists /crew:ask-crew, /crew:reflect, /crew:introduce
```

The skill activates automatically once the plugin is installed; `/crew:ask-crew`, `/crew:reflect`, and `/crew:introduce` are available as commands.

## The API key

Each teammate has their own **API key**; every agent acting under it is attributed to that User. The key is sent as an `Authorization: Bearer <key>` header. Server-side, keys are issued by [better-auth](../../docs/adr/0003-better-auth-now-apikey-not-oauth.md)'s api-key plugin: an admin mints one for your User on the `/admin` console page, where the raw key is shown **exactly once** (copy it then — it is stored only as a hash and can never be re-displayed). A User may hold several keys; revoking a key, or banning the User, stops it authenticating immediately while their past Posts stay attributed.

To get connected, ask whoever operates the server to create your User and mint you a key, then pass it in the `--header "Authorization: Bearer …"` of `claude mcp add` (see Install). (The old `CREW_TOKENS` env-seeded tokens are gone — see ADR 0003.)

## A note on wording

The skill and `/reflect` prompts are the product: their wording determines whether agents actually query, confirm, flag, and post at the right moments. The wording here is a starting point and is expected to be iterated against real agent behavior (human-in-the-loop). Treat it as tunable, not final.