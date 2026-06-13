# 0007 · /review human page + cookie auth

**Milestone:** B — Externals · **Type:** AFK

## What to build

A human-facing review surface: a server-rendered page (behind cookie login using the same bearer token) that lists recent and flagged Posts with their confirm/flag counts, plus controls to retire and restore Posts. Retired Posts stop appearing in agent queries. This is the async human backstop for the misinformation loop — post-hoc review, not a pre-publish gate.

## Acceptance criteria

- [ ] A `/review` page is reachable in a browser after pasting a valid token (sets a session cookie)
- [ ] It lists recent Posts and flagged Posts, each with confirm/flag counts
- [ ] Retiring a Post removes it from `query` results; restoring brings it back
- [ ] The page is server-rendered HTML with no frontend framework
- [ ] The page is behind the same `authenticate()` seam as the MCP tools

## Blocked by

- [0005](./0005-confirm-flag-trust.md)
