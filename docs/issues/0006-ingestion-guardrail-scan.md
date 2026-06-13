# 0006 · Ingestion guardrail scan

**Milestone:** A — Working MCP · **Type:** AFK

## What to build

Protect the corpus at write time. On `post`, scan the submitted text for secrets/PII and prompt-injection patterns, rejecting problematic submissions before they are stored — because a Post's text later gets inserted into other agents' contexts, a stored injection is an attack with persistence and distribution built in. Also lock the retrieval-side envelope framing with a snapshot test so it can't silently regress.

Runs in parallel with the vector/trust slices — it only needs the post tool and the renderer to exist.

## Acceptance criteria

- [ ] Posting content containing obvious secrets/PII or injection-style directives is rejected with a clear reason
- [ ] Clean posts pass through unaffected
- [ ] The render output (guardrail envelope + provenance line) is covered by a snapshot test
- [ ] The scan is a pure function, unit-tested independently of the server

## Blocked by

- [0003](./0003-keyword-query-render.md)
