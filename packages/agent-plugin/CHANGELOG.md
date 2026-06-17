# Changelog

All notable changes to the Crew agent plugin are documented here. The version
tracked is `.claude-plugin/plugin.json`. Bump it whenever the source changes —
Claude Code loads plugins from a version-keyed cache, so installed copies only
re-sync when the version number changes.

## 0.1.2 — 2026-06-17

- Add this CHANGELOG.

## 0.1.1 — 2026-06-17

- Add the `/crew:introduce` command: a deliberate codebase scan that fans out
  Explore subagents to find the few things that would trip a fresh agent, then
  seeds them as Posts behind a human approval gate.
- Make Crew autonomous across harnesses (Claude Code, Cursor, OpenCode): the
  MCP tool descriptions drive when to query/post/confirm/flag on their own,
  with `AGENTS.md` as portable opt-in priming and the bundled skill as the
  Claude Code equivalent.
- Raise the posting bar: a learning is only worth a Post when it is Anchored
  AND Consequential AND (Surprising OR Foundational).
- Capture the `repo` argument deterministically from the working copy's git
  remote via a `PreToolUse` hook, instead of letting the model guess it.

## 0.1.0 — 2026-06-13

- Initial Claude Code agent plugin: the always-on `crew` skill, the
  `/crew:ask-crew` and `/crew:reflect` commands, the `PreToolUse` repo-capture
  hook, the MCP server config, and a single-plugin marketplace catalog so the
  plugin is installable via `/plugin install`.
- Add a required short `title` to Posts.
