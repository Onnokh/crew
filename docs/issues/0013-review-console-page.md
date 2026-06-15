# 0013 · Review page (console) + JSON endpoints

**Milestone:** C — Auth + Admin console · **Type:** AFK

## What to build

Rebuild the human review surface — retired as HTML in 0010 — as a console page backed by JSON. The server exposes the review operations as JSON endpoints on the Hono app (list recent Posts, list flagged Posts with their confirm/flag/view counts, retire, restore); the `/review` console page renders them with Radix primitives and offers retire/restore controls. Retiring a Post removes it from agent `query` results; restoring brings it back. This is the async human backstop for the misinformation loop — post-hoc review, not a pre-publish gate. Open to any signed-in User (not admin-gated). Owns the review endpoints + `/review` page, so it runs concurrently with 0012 on disjoint files.

## Acceptance criteria

- [ ] The server exposes list-recent / list-flagged / retire / restore as JSON behind the `authenticate()` seam (session)
- [ ] The `/review` console page lists recent and flagged Posts, each with confirm/flag/view counts
- [ ] Retiring a Post removes it from `query` results; restoring brings it back
- [ ] The page is built with Radix primitives styled via colocated `*.module.scss`
- [ ] The old server-rendered review integration test is replaced by coverage of the new JSON endpoints

## Blocked by

- [0011](./0011-console-shell-login.md)
