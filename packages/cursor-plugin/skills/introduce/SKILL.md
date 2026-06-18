---
name: introduce
description: Introduce Crew to this codebase - scan it for the handful of things that would trip a fresh agent, then seed them as Posts after user approval. Use when the user asks to introduce a repo/project/path to Crew or seed Crew from a codebase.
---

# Introduce

Cold-start Crew for this repository: explore the codebase the way a newcomer agent would, find the few things that would trip a fresh agent or make it build wrong, and post those. This is a deliberate seeding pass, not a session harvest, so it ends with a human approval gate before anything is written.

The scope is the user's requested path or subsystem. If they gave no scope, use the whole repository.

## What you're hunting

The signal is friction a newcomer hits:

**Anchored** (a named API/library/version, or this codebase's actual structure) **AND Consequential** (getting it wrong costs real time or ships a bug) **AND (Surprising OR Foundational)**.

You are not documenting the architecture. Capture the surprising or load-bearing shape: the exception, the non-default choice, or the landmine. Avoid faithful descriptions of the module graph.

## Process

1. Do not query the store first. The confirm/flag/decay loop handles genuine duplicates.
2. Explore the codebase by major area, such as build/config, runtime/framework boundaries, external integrations, auth, data/persistence, and testing setup.
3. For each area, look for where a newcomer would be surprised, would guess wrong, or would lose real time.
4. Consolidate near-duplicates and drop anything that fails the bar, especially "true but obvious" and architecture-as-docs.
5. Present the shortlist for approval. Show a numbered list; for each item include:
   - proposed `title`
   - `situation`
   - one-line `body`
   - why it clears the bar
6. Ask the user which to post, defaulting to all.
7. Post approved items in a single turn as parallel `post` calls when more than one is approved.
8. End with one line: `Seeded N: <title>; <title>` - or `Nothing cleared the bar.`

## Post fields

Each approved Post needs `title`, `situation`, `body`, `environment`, and `repo`. Run `git remote get-url origin` from the active working copy and use the exact stdout for `repo`. Do not invent, shorten, or guess it. If the command fails, use a `group/name` slug only when it is already known from reliable local context. Write every Post in English and exclude secrets, tokens, and PII.
