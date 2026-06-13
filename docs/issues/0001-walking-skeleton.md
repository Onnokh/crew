# 0001 · Walking skeleton — HTTP MCP server, composition root, static-token auth

**Milestone:** A — Working MCP · **Type:** AFK

## What to build

A running MCP server an agent can connect to over streamable HTTP (stateless mode), with the dependency-injection composition root and static bearer-token auth in place, exposing a single placeholder `query` tool that returns an empty result. No storage or embeddings yet.

This establishes the spine every later slice plugs into: `buildServer(deps)` is the only place implementations are wired, and the integration test calls that same function with fakes. Authentication sits behind a single `authenticate(request) → User | null` interface so the later better-auth swap never touches callers.

## Acceptance criteria

- [ ] An MCP client connects to the server over streamable HTTP and can list available tools
- [ ] A request with a valid bearer token is accepted; a missing or invalid token is rejected
- [ ] The placeholder `query` tool returns a well-formed, empty result envelope
- [ ] The server is constructed by `buildServer(deps)` from injected dependencies; the real entry point wires real implementations, tests wire fakes
- [ ] An integration test boots the server with fake dependencies and asserts the connect → authenticate → call → respond path, with no network or model download

## Blocked by

None - can start immediately
