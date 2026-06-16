---
description: Introduce Crew to this codebase — scan it for the handful of things that would trip a fresh agent, and seed them as Posts.
---

# /crew:introduce — seed the store from a codebase

Cold-start Crew for this repository: explore the codebase the way a newcomer agent would, find the few things that would **trip a fresh agent or make it build wrong**, and post those. This is a deliberate seeding pass, not a session harvest — so it ends with a **human approval gate** before anything is written.

The scope is `$ARGUMENTS` if given (a path or subsystem); otherwise the whole repository.

## What you're hunting

The signal is **friction a newcomer hits** — the same bar every Post clears:

> **Anchored** (a named API/library/version, or this codebase's actual structure — not a general principle) **AND Consequential** (getting it wrong costs real time or ships a bug) **AND (Surprising** — defies a default assumption — **OR Foundational** — not knowing it makes an agent build on a wrong assumption and unwind work).

You are **not** documenting the architecture. Capture the surprising or load-bearing *shape* — the exception, the non-default choice, the landmine. "Errors come back as HTTP 200 from the Novula client" ✅; "factory pattern everywhere except the review route" ✅; "all I/O goes through Effect, not bare async/await" ✅ (Foundational). "The repo uses TypeScript" ❌; "there's a `routes/` folder" ❌; a faithful description of the module graph ❌ — that's docs, and Crew is not docs.

## Process

1. **Load the `post` tool**: `ToolSearch` with `select:mcp__crew__post` (skip if already available). Do **not** query the store first — the confirm/flag/decay loop handles genuine duplicates.

2. **Fan out Explore subagents** (Agent tool, `subagent_type=Explore`) — one per major area (e.g. build/config, the main runtime/framework seams, external integrations & API clients, auth, data/persistence, testing setup). Give each the same brief: *explore like a newcomer; note where you were surprised, where you'd have guessed wrong, where a wrong assumption would cost real work. Return only candidates that clear the bar above — each as `{title, situation, body, environment, why-it-clears-the-bar}`. Return nothing rather than padding with architecture description.*

3. **Consolidate**: merge near-duplicates across subagents, drop anything that on second look fails the bar (especially "true but obvious" and "architecture-as-docs"). Expect a **short** list — a handful for most repos, not dozens. If the scan produced many, that's a sign the bar wasn't applied; cut hard.

4. **Present the shortlist for approval.** Show a numbered list; for each: the proposed `title` and `situation`, a one-line `body`, and one line on *why it clears the bar* (which dimensions). Ask the user which to post (default: all). This gate is what stops a scan from flooding the store — do not skip it.

5. **Post the approved ones** in a single turn as parallel `post` calls. Each needs `title`, `situation`, `body`, `environment` (the repo's stack/setup — versions that matter), and `repo` (auto-captured from the git remote by the plugin hook; you don't set it). Write every Post in English; no secrets, tokens, or PII.

6. End with one line: `Seeded N: <title>; <title>` — or `Nothing cleared the bar.`
