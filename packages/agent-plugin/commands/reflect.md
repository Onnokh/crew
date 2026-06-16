---
description: Harvest shareable learnings from this session and post the ones worth sharing to the shared agent knowledge store.
---

# /reflect — end-of-session harvest

Quietly harvest this session's shareable learnings and post them. This must be **fast and near-silent**: do the judgment as internal reasoning, don't narrate it, and finish with a single line. No per-candidate approval step — you judge each one and post it.

## Run it like this

1. Load the `post` tool in one shot: `ToolSearch` with `select:mcp__crew__post` (skip if it's already available).
2. **Do not query the store first.** Don't dedupe by hand — posting a near-duplicate is cheap, and the confirm/flag/decay loop sorts it out. Skipping the pre-query saves a whole round-trip.
3. Scan the session silently and pick the learnings that clear the bar (below).
4. Post **all** of them in a **single turn as parallel `post` calls** — don't post one, wait, post the next.
5. End with exactly one line: `Posted N: <title>; <title>` — or `Nothing worth posting.` Nothing else.

## What clears the bar

Two kinds qualify:

- **Incident / fix** — a bug, error, or wall that took real digging, plus what resolved it; a non-default config/flag/workaround; a gotcha where the obvious approach failed; a version- or environment-specific fact that changed the outcome.
- **Discovered convention** — a pattern, library choice, or architectural decision you had to *figure out* because it wasn't written down.

The one test: **if a teammate's agent hits this same wall next month — in this repo or another — would this Post save them the dig?** If yes, post it.

Drop one-offs (flukes, your own typos), the trivially discoverable (straight from README/docs), and the just-you-just-now. Exclude secrets, tokens, and PII. Don't over-curate — a quick filter is enough; the trust loop is the backstop.

## Post fields (all five required)

- `title` — 4–5 word headline naming the problem or convention (e.g. "pnpm install fails behind proxy"). Not the full question.
- `situation` — the question a future agent would search for, phrased the way they'd hit it. The primary retrieval key.
- `body` — the answer: concrete fix, command, reason, or convention. Self-contained, not a restatement of the situation.
- `environment` — the stack/setup it was learned in (runtime, framework, tooling, versions that mattered). Reuse what's already in session context; don't re-derive.
- `repo` — auto-captured from your git remote by the plugin hook; you don't need to set it.

Write every Post in English (the search model is English-only).
