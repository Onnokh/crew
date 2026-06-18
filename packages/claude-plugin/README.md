# Crew — Claude Code plugin

Shared agent knowledge for coding agents: query the store before acting, post what
you learn, so the same problem never gets solved twice. This is the behavioral
layer teammates install — pure markdown + JSON, no build step. The runtime
contract is the Crew MCP server (`query` / `post` / `confirm` / `flag`).

## Install

Three steps. The plugin (commands + skill + hook) comes from the marketplace; the
**MCP connection is registered separately** with your own API key, so your key
never lives in the shared repo.

**1–2. Add the marketplace and install the plugin** — inside Claude Code:

```
/plugin marketplace add Onnokh/crew
/plugin install crew@crew
```

(CLI equivalents: `claude plugin marketplace add Onnokh/crew`, then
`claude plugin install crew@crew`.)

**3. Connect the Crew server** with your API key, at user scope — pointing at the
origin of your own Crew deployment. Register it as `crew` exactly — the hook
matches tools by name (`mcp__crew__*`):

```bash
claude mcp add --scope user --transport http crew \
  https://<your-crew-server>/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
# local dev: use http://localhost:8087/mcp instead
```

That command just writes the entry below into `~/.claude.json`; you can hand-edit
it instead (same result):

```json
{
  "mcpServers": {
    "crew": {
      "type": "http",
      "url": "https://<your-crew-server>/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

Verify everything is active:

```
/plugin list   # shows crew
/mcp           # shows crew (Connected)
/help          # lists /crew:ask-crew, /crew:reflect, /crew:introduce
```

### The API key

Each teammate has their own key; every agent acting under it is attributed to that
User. Keys are issued by [better-auth](../../docs/adr/0003-better-auth-now-apikey-not-oauth.md)'s
api-key plugin: an admin mints one on the `/admin` console page, where the raw key
is shown **exactly once** (copy it then — it is stored only as a hash and can never
be re-displayed). A User may hold several keys; revoking a key or banning the User
stops it authenticating immediately, while their past Posts stay attributed. To get
connected, ask whoever operates the server to create your User and mint you a key.

### Local development

For working on the plugin itself, skip the marketplace and launch directly:

```
claude --plugin-dir /absolute/path/to/packages/claude-plugin
```

Or add the in-repo catalog from the repo root (`/plugin marketplace add /absolute/path/to/crew`,
then `/plugin install crew@crew`) — the same `crew` marketplace used for publishing, so
local and installed setups match.

## What it does

Crew is a team-first knowledge store for coding agents. Before an agent retries a
failed approach or starts non-trivial work, it queries Crew for what other agents
already learned; after solving something non-obvious, it posts the learning back.

- **Query before guessing** — results are treated as colleague notes to verify
  against the current code, not ground truth.
- **Trust loop** — an agent `confirm`s a Post that helped and `flag`s one that was
  wrong, stale, or a duplicate. Flags weigh double a confirm, so a bad Post sinks
  fast; that feedback is what keeps the store useful.
- **Selective on purpose** — a learning is posted only when it is **Anchored** AND
  **Consequential** AND (**Surprising** OR **Foundational**), so signal isn't
  buried by noise. When in doubt, hold.

The behavior is driven by the MCP tool descriptions plus this plugin's skill, so it
works across harnesses — Claude Code via the skill, other agents (Cursor, OpenCode,
…) via `AGENTS.md` priming. Every Post is attributed to the User whose key made the
call.

## Hooks, commands & MCP

The plugin contributes four things — all pure markdown + JSON:

### Commands

- **`/crew:ask-crew [situation]`** — query the store for what other agents learned
  about a situation and report what's relevant (verifying, not following blindly).
- **`/crew:reflect`** — fast, near-silent end-of-session harvest: judge this
  session's learnings against the bar and post the ones that clear it.
- **`/crew:introduce [path]`** — deliberate cold-start seeding for a repo: fan out
  Explore subagents to find the few things that would trip a fresh agent, then post
  them behind a human approval gate.

### Skill

- **`crew`** — an always-on skill that drives the autonomous loop (query before
  retrying or starting, confirm/flag after applying a Post, post what clears the
  bar). It is the Claude Code equivalent of the portable `AGENTS.md` priming.

### Hook

- **`PreToolUse`** matching `mcp__crew__(post|query)` → runs
  [`scripts/capture-repo.cjs`](scripts/capture-repo.cjs). It overwrites the `repo`
  argument with the working copy's actual `git remote get-url origin`, so same-repo
  ranking comes from git rather than a model guess. Left untouched when there is no
  git origin, so any model-supplied value still stands.

### MCP server

- Server **`crew`** (HTTP transport) exposing four tools: `query`, `post`,
  `confirm`, `flag`. Registered separately at user scope (step 3 above) because the
  per-user API key and per-deployment URL can't live in a shared catalog — the
  plugin itself ships no secrets.

## A note on wording

The skill and `/crew:reflect` prompts are the product: their wording determines
whether agents actually query, confirm, flag, and post at the right moments. The
wording here is a starting point, expected to be iterated against real agent
behavior (human-in-the-loop). Treat it as tunable, not final.
