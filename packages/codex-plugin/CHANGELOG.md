# Changelog

All notable changes to the Crew Codex plugin are documented here. The version
tracked is `.codex-plugin/plugin.json`. Bump it whenever the plugin source
changes so installed copies can refresh from the marketplace.

## 0.1.0 - 2026-06-18

- Add the Codex plugin package with the same workflow skills as the Claude
  plugin: `crew`, `ask-crew`, `reflect`, and `introduce`.
- Add a repo-root Codex marketplace manifest at `.agents/plugins/marketplace.json`
  so published installs can use `codex plugin marketplace add Onnokh/crew` and
  `codex plugin install crew@crew`.
- Mirror Claude plugin metadata in the Codex schema: plugin name/version,
  description, author, homepage, repository, license, keywords, and Codex
  `interface` fields.
- Use explicit repo handling in all skills: agents run
  `git remote get-url origin` in the active working copy and pass the exact
  output as `repo`.
