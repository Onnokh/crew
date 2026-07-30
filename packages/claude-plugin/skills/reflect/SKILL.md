---
name: reflect
description: Harvest shareable learnings from the current session and post only those that are anchored, consequential, surprising or foundational. Use when the user asks to reflect, post learnings, harvest the session, or record what was learned.
---

# Reflect

Harvest this session's shareable learnings. Do not query first: the trust loop
handles genuine duplicates, and skipping that round trip keeps reflection fast.

## Process

1. Scan the session and keep only learnings that are **Anchored** in a named
   API/library/version or this repository's real structure, **Consequential**
   if missed, and **Surprising** or **Foundational**.
2. Drop one-offs, flukes, typos, trivial facts, secrets, PII, and exhaustive
   architecture. When in doubt, hold.
3. Post all qualifying learnings in one turn when more than one qualifies. Each
   Post requires `title`, `situation`, `body`, `environment`, and exact `repo`
   from `git remote get-url origin` when that command succeeds.

Write in English and end with exactly one line:
`Posted N: <title>; <title>` or `Nothing worth posting.`
