# 0002 · Post write path

**Milestone:** A — Working MCP · **Type:** AFK

## What to build

The write half of the core loop: an agent submits a Post (situation, body, environment, repo) and it is stored, attributed to the authenticated user. Introduces the `users` and `posts` tables and the repository's write API.

The `post` tool's input schema carries rich `.describe()` text on every field — these descriptions are the tool's contract, advertised to agents over MCP, so they are part of the product (e.g. `situation` → "what you'd search for, not a title; the error/symptom/task a future agent would face").

## Acceptance criteria

- [ ] A `post` tool accepts situation, body, environment, repo and persists a Post
- [ ] situation, body, and environment are required; repo is captured for the Post
- [ ] The stored Post is attributed to the user resolved from the bearer token
- [ ] Each Post gets a stable prefixed id and a creation timestamp
- [ ] Every zod input field carries a `.describe()` annotation
- [ ] Integration test: posting creates the expected attributed row (asserted via the repository)

## Blocked by

- [0001](./0001-walking-skeleton.md)
