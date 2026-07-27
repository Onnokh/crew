# PLO-290: Crew MCP result delivery strategies

Date: 2026-07-27

## Decision-ready read

The prototype compares six ways to deliver the same five-result Crew query:

1. current direct Markdown text;
2. MCP structured output plus compatibility text;
3. an embedded MCP resource;
4. a resource link followed by `resources/read`;
5. FastMCP's `notifications/tool/streamContent` extension;
6. a compact preview plus a resource link for selective expansion.

The prototype is [`mcp-result-delivery.mjs`](../../scripts/research/mcp-result-delivery.mjs),
with native Node tests in
[`mcp-result-delivery.test.mjs`](../../scripts/research/mcp-result-delivery.test.mjs).
Run it with:

```bash
node scripts/research/mcp-result-delivery.mjs
node --test scripts/research/mcp-result-delivery.test.mjs
```

These are serialized UTF-8 byte counts, not token counts. They measure the
protocol payloads and make the follow-up request explicit; they do not model a
particular executor's re-serialization policy.

## Fixture results

The fixture uses five realistic-shaped Posts with the same body content in
every variant. The current text renderer is the quality baseline.

| Strategy | Standard MCP | Initial bytes | Full read bytes | Follow-up | Read |
| --- | ---: | ---: | ---: | ---: | --- |
| Direct text | yes | 3,166 | 3,166 | no | Immediately consumable |
| Structured + text | yes | 6,342 | 6,342 | no | Duplicates authored data |
| Embedded resource | yes | 3,244 | 3,244 | no | One response, resource-aware client needed |
| Resource link | yes | **189** | 3,403 | yes | Smallest initial context |
| FastMCP stream | no | 14 + 3,497 event bytes | 3,511 | no | Extension; client behavior unknown |
| Preview + resource link | yes | **1,160** | 4,374 | yes | Selective expansion candidate |

The stream row shows the empty final result separately from the streamed
notifications: the complete transport is 3,511 bytes. A client that appends all
chunks before handing them to the model does not save the result body; it adds
notification framing instead.

## Findings

### Structured output is not a token-saving path by itself

MCP structured output is attractive for typed consumers, but a compatibility
text block is still kept in the prototype. With the result body represented in
both forms, the initial payload is 2.0× the direct text baseline. It should only
be considered if the consuming executor can prove that it forwards exactly one
canonical representation to the model.

### Embedded resources preserve payload size, not context size

An embedded resource is only about 2.5% larger than direct text in this fixture.
It avoids the structured-output duplication, but the client must turn resource
content into useful model context. It is a compatibility experiment, not a
selective-expansion mechanism.

### Resource links create the useful boundary

A resource link reduces initial context by about 94% in the fixture. If the
client follows it, the complete read is slightly larger than direct text due to
the second MCP envelope; if it does not, the agent sees only a handle. That is
the desired trade-off when most queries do not require every returned body.

The preview variant keeps titles, IDs, and provenance in the initial context.
It reduces the initial payload by about 63%, while intentionally paying more
than the baseline when the full result is later expanded. Its value is
selective expansion, not cheaper full reads.

### FastMCP streaming needs an executor proof

`notifications/tool/streamContent` is exposed by FastMCP 4.3.0, but it is not a
portable standard MCP result shape. The prototype therefore marks it
non-standard. Streaming can improve perceived latency, but it is not a token
optimization unless the downstream executor can consume chunks incrementally
without replaying or concatenating the complete result on every model turn.

## Recommendation

Do not replace the current Crew result with structured output, embedded
resources, or streaming based on this prototype. The next implementation slice
should prototype **preview + resource link** behind a client-specific feature
flag or benchmark adapter, with direct text as the fallback.

That slice needs to answer three questions against real Codex executor traces:

- Does the executor expose a `resource_link` as a followable handle, or does it
  discard it as non-text content?
- When a resource is read, is the body added once or duplicated in the
  executor-visible envelope?
- Across executable tasks, does selective expansion preserve the quality floor
  while reducing whole-task input tokens?

The server-side design should use an authenticated, short-lived retrieval
resource backed by the existing retrieval ID rather than putting the full Post
body in a URI. The current HTTP transport is stateless, so the resource read
must resolve the ID from the team database and re-apply the caller's Team
boundary. No production route or tool was changed in this POC.
