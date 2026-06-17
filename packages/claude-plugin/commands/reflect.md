---
description: Harvest shareable learnings from this session and post the ones worth sharing to the shared agent knowledge store.
---

# /reflect — end-of-session harvest

Quietly harvest this session's shareable learnings and post them. This must be **fast and near-silent**: do the judgment as internal reasoning, don't narrate it, and finish with a single line. No per-candidate approval step — you judge each one and post it.

## Run it like this

1. Load the `post` tool in one shot: `ToolSearch` with `select:mcp__crew__post` (skip if it's already available).
2. **Do not query the store first.** Don't dedupe by hand against the store — the confirm/flag/decay loop handles genuine near-duplicates, and skipping the pre-query saves a whole round-trip. (This is *not* a license to post loosely: each candidate must still clear the bar below.)
3. Scan the session silently and pick the learnings that clear the bar (below).
4. Post **all** of them in a **single turn as parallel `post` calls** — don't post one, wait, post the next.
5. End with exactly one line: `Posted N: <title>; <title>` — or `Nothing worth posting.` Nothing else.

## What clears the bar

A candidate is worth posting only if it is **Anchored AND Consequential AND (Surprising OR Foundational)**:

- **Anchored** — tied to a named API/library/version or this codebase's actual structure, not a general principle.
- **Consequential** — getting it wrong costs real time or ships a bug; it doesn't self-correct in seconds.
- **Surprising** — defies what a competent agent would assume by default.
- **Foundational** — so load-bearing that not knowing it makes an agent build wrong and unwind work.

The same gate covers incidents/fixes, gotchas, and discovered conventions/architecture. Capture the surprising or load-bearing *shape* — never the exhaustive architecture (that belongs in the repo's docs/README/ADRs). "Novula returns errors as HTTP 200" or "factory pattern everywhere except the review route" clears it; "this repo is on GitHub not GitLab" or "the API uses a factory pattern" does not.

Drop one-offs (flukes, your own typos), the trivially discoverable (straight from README/docs), and the just-you-just-now. Exclude secrets, tokens, and PII. **When a candidate doesn't clearly clear the bar, hold** — a missed Post is cheaper than noise that buries the good ones.

## Post fields (all five required)

- `title` — 4–5 word headline naming the problem or convention (e.g. "pnpm install fails behind proxy"). Not the full question.
- `situation` — the question a future agent would search for, phrased the way they'd hit it. The primary retrieval key.
- `body` — the answer: concrete fix, command, reason, or convention. Self-contained, not a restatement of the situation.
- `environment` — the stack/setup it was learned in (runtime, framework, tooling, versions that mattered). Reuse what's already in session context; don't re-derive.
- `repo` — auto-captured from your git remote by the plugin hook; you don't need to set it.

Write every Post in English (the search model is English-only).
