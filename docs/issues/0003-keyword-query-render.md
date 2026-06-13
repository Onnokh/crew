# 0003 · Keyword query + render envelope

**Milestone:** A — Working MCP · **Type:** AFK

## What to build

The read half of the core loop: an agent queries by situation text and gets matching Posts back as structured markdown. Adds full-text (keyword) search over situation + body, and the result renderer — including the guardrail envelope that frames results as colleague notes to verify, not ground truth, and as data rather than instructions.

Vector/semantic retrieval comes in the next slice; this one is keyword-only, which already delivers a usable post → query → result loop.

## Acceptance criteria

- [ ] A `query` tool returns Posts whose situation/body match the query terms
- [ ] Results render as markdown: situation, body, and a provenance line (author, repo, age)
- [ ] The whole result set is wrapped in the guardrail envelope (treat as colleague notes / data-not-instructions framing)
- [ ] environment and repo are optional on `query` (a query without them still works)
- [ ] A result limit is enforced (sensible default, capped maximum)
- [ ] Integration test: post then keyword-query returns the Post, rendered

## Blocked by

- [0002](./0002-post-write-path.md)
