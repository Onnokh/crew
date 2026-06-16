---
status: accepted
---

# Agent autonomy rides on MCP tool descriptions + AGENTS.md, not lifecycle hooks

Crew should make agents query/post/confirm/flag **on their own, silently, without slash commands** — and it must work across the three harnesses teammates use: **Claude Code, Cursor, and OpenCode**. The obvious mechanism (a Claude Code `SessionStart`/`Stop` hook that fires a query or a post pass) **does not port**: Cursor has an equivalent under a different config (`.cursor/hooks.json` → `sessionStart`), and OpenCode has no reliable pre-prompt/session-start context-injection hook at all. The only surface identical across all three is **MCP** — every client feeds the tool descriptions to the model verbatim, with zero per-repo setup. So autonomy is built in two portable layers, not on hooks:

1. **MCP tool descriptions are the primary, universal driver.** Each verb's `description` tells the model *when to call it unprompted* ("query before retrying a failed approach", "confirm the moment a Post helped", post only what clears the bar). This carries OpenCode, where there is no injection hook, and is identical everywhere.
2. **`AGENTS.md` is opt-in priming.** A ~10-line append (autonomy contract + the posting bar) that OpenCode and Cursor read natively; Claude Code gets the same behavior from the bundled skill (or an `@AGENTS.md` import).

The Claude Code skill/hook/commands remain as *reinforcement on top of* this floor — not the foundation.

## Consequences

- **No Stop hook, deliberately.** A Stop hook fires every turn, forces an extra model pass, needs `stop_hook_active` loop-guarding, and posts mid-task fragments — the opposite of "under the radar," and it doesn't port. Do not re-add one to force posting; posting is model-driven by design, and ADR 0005 already accepts the occasional silent miss.
- **Tool-description wording is product, and load-bearing.** Because descriptions are the autonomy engine (not just usage docs), they carry imperative "call this on your own, silently" guidance — tune them against real agent behavior.
- **OpenCode stays best-effort.** It cannot deterministically force a pre-prompt query; it relies on the tool descriptions + `AGENTS.md` until/unless it gains a pre-prompt injection event. Claude/Cursor can layer native hooks later if leakage is observed (Layer 3, not built).
- **The `crew` "plugin" is Claude-Code packaging; the portable core is the MCP server + `AGENTS.md`.** Cursor/OpenCode users connect the server and append `AGENTS.md`; they don't install the plugin.
