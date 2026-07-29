---
name: introduce
description: Introduce Crew to a codebase by finding the few anchored, consequential, surprising or foundational facts that would trip a fresh agent, then seed them as Posts after user approval. Use when the user asks to introduce or seed a repository, project, or path.
---

# Introduce

Cold-start Crew for the requested repository, subsystem, or path. This is a
deliberate seeding pass, not a routine query, so do not query first.

## Process

1. Explore the requested scope by major area: build/config, runtime/framework
   boundaries, external integrations, auth, persistence, and testing.
2. Keep only facts that are **Anchored** in a named API/library/version or the
   repository's real structure, **Consequential** if misunderstood, and
   **Surprising** or **Foundational**. Drop obvious architecture and one-offs.
3. Consolidate near-duplicates and present a numbered shortlist for approval.
   For each item show its proposed `title`, searchable `situation`, one-line
   `body`, and why it clears the gate.
4. After the user approves, post the selected items. Each Post requires
   `title`, `situation`, `body`, `environment`, and exact `repo` from
   `git remote get-url origin` when that command succeeds.

Write Posts in English. Never include secrets, PII, or exhaustive architecture.
End with `Seeded N: <title>; <title>` or `Nothing cleared the bar.`
