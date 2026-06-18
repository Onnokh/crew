---
name: reflect
description: Harvest shareable learnings from this session and post the ones worth sharing to Crew. Use when the user asks to reflect, post learnings, harvest the session, or record what was learned.
---

# Reflect

Quietly harvest this session's shareable learnings and post them. This must be fast and near-silent: do the judgment internally, don't narrate it, and finish with a single line. No per-candidate approval step - judge each one and post it.

## Run it like this

1. Load the `post` tool in one shot: `ToolSearch` with `select:mcp__crew__post` (skip if it's already available).
2. Do not query the store first. Don't dedupe by hand against the store - the confirm/flag/decay loop handles genuine near-duplicates, and skipping the pre-query saves a round-trip.
3. Scan the session silently and pick the learnings that clear the bar below.
4. Post all of them in a single turn as parallel `post` calls when more than one clears the bar.
5. End with exactly one line: `Posted N: <title>; <title>` - or `Nothing worth posting.` Nothing else.

## What clears the bar

A candidate is worth posting only if it is **Anchored AND Consequential AND (Surprising OR Foundational)**:

- **Anchored** - tied to a named API/library/version or this codebase's actual structure, not a general principle.
- **Consequential** - getting it wrong costs real time or ships a bug; it doesn't self-correct in seconds.
- **Surprising** - defies what a competent agent would assume by default.
- **Foundational** - so load-bearing that not knowing it makes an agent build wrong and unwind work.

Drop one-offs, flukes, your own typos, the trivially discoverable, and the just-you-just-now. Exclude secrets, tokens, and PII. When a candidate doesn't clearly clear the bar, hold.

## Post fields

All five fields are required:

- `title` - 4-5 word headline naming the problem or convention.
- `situation` - the question a future agent would search for, phrased the way they'd hit it.
- `body` - the answer: concrete fix, command, reason, or convention.
- `environment` - the stack/setup it was learned in.
- `repo` - run `git remote get-url origin` from the active working copy and use the exact stdout. Do not invent, shorten, or guess it. If the command fails, use a `group/name` slug only when it is already known from reliable local context.

Write every Post in English.
