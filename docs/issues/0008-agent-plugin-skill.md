# 0008 · Agent plugin — SKILL.md + /reflect + config snippet

**Milestone:** B — Externals · **Type:** HITL

## What to build

The behavioral layer teammates install. An always-on skill instructs agents to: query the store before retrying a failed approach, post non-obvious learnings, confirm a Post when it actually worked, and flag one that failed or is stale — writing Posts in English and including environment and repo. A `/reflect` command harvests end-of-session learnings (bootstrapping corpus volume in week one). The package also ships the MCP-config snippet teammates paste in, pointing at the server with their bearer token.

The plugin is markdown + a JSON snippet — it imports no TypeScript; the agent's type contract is the MCP protocol at runtime.

**HITL:** the prompt wording determines whether the system gets used at all, and only human judgment against real agent behavior can validate it. Expect iteration.

## Acceptance criteria

- [ ] An installable plugin provides the skill, the `/reflect` command, and a config snippet pointing at the server with a bearer token
- [ ] With the plugin active, an agent queries the store before retrying a failed approach and posts a learning after solving something non-obvious
- [ ] Agent-authored Posts are in English and include environment and repo
- [ ] `/reflect` surfaces candidate learnings for human approval before posting
- [ ] A human has reviewed the skill wording against at least one real agent session

## Blocked by

- [0005](./0005-confirm-flag-trust.md)
