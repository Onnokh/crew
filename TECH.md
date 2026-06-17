# Technical Spec — Crew

The resolved technical design. Domain language lives in [CONTEXT.md](./CONTEXT.md); the architectural lock-ins live in [docs/adr/](./docs/adr/); the internal interfaces, test seams, and composition root are diagrammed in [docs/architecture.html](./docs/architecture.html). This file is the consolidated "how it's built."

## Overview

A team-first shared knowledge store for coding agents. Agents connect to a single MCP server over streamable HTTP and use four tools — `query`, `post`, `confirm`, `flag`. Retrieval is hybrid (keyword + vector) and runs entirely on one node with embeddings generated in-process. No external AI services anywhere in the hot path (see [ADR 0001](./docs/adr/0001-embedded-single-node-stack.md)).

## Stack

| Concern | Choice |
| --- | --- |
| Language | TypeScript (Node) |
| MCP server | [FastMCP-TS](https://github.com/punkpeye/fastmcp) (built on the official `@modelcontextprotocol/sdk`) |
| HTTP app | Hono — obtained via FastMCP's `server.getApp()`, one app/one port (also serves the console's built assets, better-auth routes, and the review/admin JSON API) |
| Transport | Streamable HTTP, **stateless** mode |
| DB | SQLite via better-sqlite3 |
| DB access | Drizzle (CRUD tables) + raw `sql` for search & virtual tables |
| Keyword search | SQLite FTS5 |
| Vector search | sqlite-vec (`vec0` virtual table) |
| Embeddings | fastembed, `bge-small-en-v1.5`, 384-dim, in-process, baked into image |
| Auth | `authenticate(request)` interface backed by better-auth: agents via the `apiKey` plugin (Bearer key), admins via email+password sessions + the `admin` plugin (see [ADR 0003](./docs/adr/0003-better-auth-now-apikey-not-oauth.md), amending [0002](./docs/adr/0002-auth-interface-better-auth.md)) |
| Web console | React SPA — TanStack Router (routing) + TanStack Query (server-state: queries, mutations, cache invalidation over the JSON API), Radix UI primitives, colocated `*.module.scss` (CSS Modules), Vite build. **No SSR framework**; served as static assets by the Hono app (see [ADR 0004](./docs/adr/0004-web-console-react-spa-on-hono.md)) |
| Packaging | pnpm monorepo: `packages/server`, `packages/console`, `packages/claude-plugin` (no `shared/` — see Repo layout) |
| Deploy | One Docker container, SQLite on a volume (Hetzner or internal — undecided, no build impact). Multi-stage build: Vite-build the console, copy its `dist` into the server image |

## Repo layout

```
crew/
├── CONTEXT.md  TECH.md
├── docs/
│   ├── architecture.html        # interfaces, seams, composition root, diagrams
│   └── adr/                      # 0001 stack · 0002 auth · 0003 better-auth · 0004 web console
├── package.json  pnpm-workspace.yaml  tsconfig.base.json
├── Dockerfile  docker-compose.yml  .env.example
└── packages/
    ├── server/                  # the product → Docker image
    │   ├── drizzle.config.ts     # points at src/store/schema.ts (local, NEVER cross-package)
    │   ├── migrations/           # our tables (posts, post_events) · fts5+vec0+triggers · 0000_better_auth.sql (user/session/account/verification/apikey). better-auth OWNS the auth tables, but their DDL is captured verbatim from better-auth's generator and applied as hand-written SQL like everything else — NOT in store/schema.ts (see ADR 0003)
    │   └── src/
    │       ├── main.ts           # entry: build real deps → buildServer → start
    │       ├── server.ts         # buildServer(deps) — composition root
    │       ├── deps.ts           # the Deps type
    │       ├── core/             # Post/PostEvent/User types + domain — imports nothing
    │       ├── store/            # PostRepository iface · SqliteRepository · schema.ts (Drizzle TABLES) · queries.ts · migrate.ts
    │       ├── embedding/        # Embedder iface · FastEmbedder (real)
    │       ├── auth/             # Authenticator iface · BetterAuthAuthenticator (apiKey verify + session) · better-auth instance/config
    │       ├── platform/         # Clock, IdGen — iface + real each
    │       ├── search/           # rrf.ts · score.ts — pure (+ *.test.ts beside them)
    │       ├── trust/            # aggregate.ts — pure (+ test)
    │       ├── guardrails/       # scan.ts (ingestion) · render.ts (markdown envelope, snapshot test)
    │       ├── tools/            # query/post/confirm/flag — orchestration + own zod schema, one file each
    │       ├── mcp/              # register.ts — maps tools/ → FastMCP addTool
    │       ├── api/              # JSON endpoints + better-auth mount + static-serve the console: review.ts (list/retire/restore) · admin.ts (users + keys + ban, role-gated) · auth.ts (mount better-auth)
    │       └── test/            # fakes.ts (all seam doubles) · harness.ts (in-memory store + boot) · loop.integration.test.ts
    ├── console/                 # React SPA (TanStack Router · Radix · *.module.scss · Vite) → built to dist/, served by server's Hono. Talks to server over HTTP/JSON + better-auth only (see ADR 0004)
    └── claude-plugin/            # what teammates install — markdown + JSON, imports NO TS
        ├── .claude-plugin/plugin.json              # Claude Code plugin manifest
        ├── skills/crew/SKILL.md    # always-on behaviour
        ├── commands/reflect.md                     # /reflect end-of-session harvest
        ├── mcp-config.example.json                 # snippet teammates paste (URL + API key)
        └── README.md                               # install + API key + HITL-iteration note
```

Boundaries to defend as it grows:

- **Storage knows nothing about ranking.** The repository returns *raw candidates* (ids + FTS rank + vec distance), never ranked posts. `store` knows SQL, `search` knows ranking, neither imports the other — the only seam a future Postgres migration touches.
- **`search` + `trust` + `guardrails` are pure functions.** Tuning never needs integration tests; `render`'s output is snapshot-tested so the guardrail framing can't silently regress.
- **Each seam keeps its interface beside its real implementation** — `embedder.ts` (interface) · `fastembed.ts` (real) — so swapping an implementation is local and visible. The **fakes are test-only fixtures and live under `test/` (`test/fakes.ts`), not beside shipping code** — they have no production callers and must never grow into a second implementation (the deleted `FakePostRepository` was exactly that mistake; the real store is exercised over `:memory:` instead). `buildServer(deps)` (`server.ts`) is the *only* place real implementations are named; tests call the same function with the doubles from `test/`.
- **Two unrelated "schemas", never confused.** `store/schema.ts` = Drizzle **table** defs (drizzle-kit reads it — stays inside `server`, never a separate package, or migration generation breaks). Each tool's **zod input** schema lives in its own `tools/<name>.ts`. Different concerns.
- **Still no `shared/` package — even with the console.** A web UI was the predicted trigger, but the console (`packages/console`) consumes the server only over **HTTP/JSON + better-auth**, so the wire is the type boundary (mirroring "MCP is the type boundary, resolved at runtime") and no TS crosses the gap. `server/` ships as a container; `claude-plugin/` imports no TS. Extract `shared/` only if something genuinely needs to *import* the same TS from two packages (e.g. a TS hook needing the zod schema at compile time — see Agent assets), which the console does not.

## Data model

```sql
CREATE TABLE posts (
  id             TEXT PRIMARY KEY,              -- 'post_' + nanoid
  situation      TEXT NOT NULL,
  body           TEXT NOT NULL,
  environment    TEXT NOT NULL,                 -- freeform LLM summary
  repo           TEXT NOT NULL,                 -- from git remote
  status         TEXT NOT NULL DEFAULT 'active',-- active | retired
  created_by     TEXT NOT NULL REFERENCES user(id),   -- better-auth's canonical user table
  created_at     INTEGER NOT NULL,              -- unix ms
  last_confirmed INTEGER                        -- denormalized for ranking; source of truth is post_events
);

CREATE TABLE post_events (                       -- confirms & flags = the event log
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL REFERENCES posts(id),
  verdict    TEXT NOT NULL,                      -- confirm | flag
  reason     TEXT,                               -- flags only: incorrect | stale | duplicate
  note       TEXT,                               -- optional one-line comment
  created_by TEXT NOT NULL REFERENCES user(id),
  created_at INTEGER NOT NULL
);

-- Auth tables (user/session/account/verification/apikey) are OWNED BY better-auth
-- and not defined in store/schema.ts. Their DDL is captured verbatim from
-- better-auth's own migration generator (pinned version) and committed as the
-- hand-written migrations/0000_better_auth.sql, so it runs through migrate.ts
-- like everything else. `user` is canonical; it carries a `role` column (admin
-- plugin) and is the FK target for `posts.created_by` and `post_events.created_by`.
-- Each `apikey` row links to its owner via `referenceId` (set to the User's id),
-- so a User may hold many keys that all resolve to one identity (trust counts
-- Users, not keys). The api-key plugin ships in the separate @better-auth/api-key
-- package in 1.6.x. See ADR 0003.

CREATE VIRTUAL TABLE posts_fts USING fts5(       -- kept in sync by SQL triggers
  situation, body, content='posts'
);

CREATE VIRTUAL TABLE posts_vec USING vec0(       -- sqlite-vec
  post_id TEXT PRIMARY KEY,
  situation_embedding FLOAT[384],
  environment_embedding FLOAT[384]
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);  -- embedding_model, schema_version
```

Notes: `last_confirmed` is denormalized purely so ranking avoids a per-query aggregate (recomputable from `post_events`). FTS stays in sync via SQLite triggers, not app code. Virtual-table migrations are hand-written SQL (drizzle-kit doesn't model `fts5`/`vec0`). API-key and password hashing is better-auth's concern — we store no raw secrets, and a freshly minted key is shown to the admin exactly once (see ADR 0003).

## MCP tools

All responses to `query` are **structured markdown** (not JSON), wrapped in a guardrail envelope framing results as colleague notes to verify, not ground truth, and as data rather than instructions.

```
query(situation: string, environment?: string, repo?: string, limit?: number = 5 /* max 20 */)
post(situation: string, body: string, environment: string, repo: string)
confirm(post_id: string, note?: string)
flag(post_id: string, reason: 'incorrect'|'stale'|'duplicate', note?: string)
```

`environment`/`repo` are optional on `query` (a degraded query still works; ranking just loses signal) and required on `post` (they are part of the artifact). No `get_post` — query results carry the few most recent Notes inline.

Each query result renders: situation, body, the Post's `environment` as an applicability line (`_Environment: …_` — shown so an agent can judge "was this learned on my stack?"; never a retrieval signal — see Retrieval pipeline), a provenance line (`posted by <user> in <repo>, <age> · N confirms / M flags · last confirmed <age>`), and up to ~3 recent Notes tagged with verdict and age (`✓ 2d ago: "works on Node 22"` / `✗ 1w ago: "key renamed in v6"`).

### Tool input schemas

Each tool's zod input schema lives in its own `tools/<name>.ts`, colocated with the handler (no standalone schema file, no `shared/`). `mcp/register.ts` imports the four and registers them via FastMCP `addTool`.

The agent never imports these types — **MCP is the type boundary, resolved at runtime.** FastMCP converts each zod schema to JSON Schema and advertises it over the protocol; the client's LLM reads it live. The quality lever is therefore **rich `.describe()` annotations** on every field — they propagate to every client automatically and are what the LLM uses to decide how to call a tool. Treat schema descriptions as part of the product, e.g. `situation` → *"what you'd search for, not a title; the error/symptom/task a future agent would face."*

## Retrieval pipeline

1. Embed the query `situation` (and `environment` if provided) with the same model used at write time.
2. **FTS5** keyword search over `situation + body`.
3. **sqlite-vec** KNN over `situation_embedding` (and `environment_embedding` as a secondary signal).
4. Fuse the two ranked lists with **Reciprocal Rank Fusion** (`score += 1 / (60 + rank)` per list).
5. Multiply by a trust score, apply same-repo boost, return top-k.

### Starting ranking formula (a tuning knob, not architecture)

```
final = rrf_score
        × trust          // 1 + confirms − 2·flags  (flags weigh double; clamp ≥ small ε)
        × recency         // decay from last_confirmed (or created_at); recent = higher
        × repo_boost       // ×1.5 if post.repo == query.repo, else ×1.0
```

Deliberately simple for MVP and fully recomputable from `post_events`. Distinct-confirmer weighting, asymptotic confidence, and per-kind decay are deferred — the event log preserves everything needed to add them later.

## Embeddings

- `bge-small-en-v1.5`, 384-dim, cosine-**normalized** (fastembed default; sqlite-vec's `vec_distance_cosine` assumes it — do not disable).
- Posts are forced to **English** by the skill prompt (model is English-only; see ADR 0001).
- Model name stored in `meta.embedding_model` and checked at startup; mismatch refuses to start.
- Two vectors per post: `situation_embedding` (primary retrieval) and `environment_embedding` (fuzzy environment match).
- If embedding throws during `post`, **fail the write loudly** — a post with no vector is invisible to half of retrieval.
- Tests use a deterministic fake embedder (no 30 MB model download in CI).

## Trust mechanics

- Every `confirm`/`flag` is an event row (who, when, optional Note) — never a bare counter.
- `confirm` sets `last_confirmed = now`.
- MVP math is the simple formula above; quarantine thresholds, decay curves, and distinct-confirmer counting come later, recomputed from the log.
- Duplicates are **accepted** at MVP (no dedup-on-write); `flag(duplicate)` + the review page handle cleanup.

## Auth

A single `authenticate(request) → User | null` interface is the only thing the MCP tools and pages depend on. It is backed by **better-auth** (see [ADR 0003](./docs/adr/0003-better-auth-now-apikey-not-oauth.md), amending [0002](./docs/adr/0002-auth-interface-better-auth.md)), whose routes mount on FastMCP's `getApp()` Hono instance:

- **Agents** present `Authorization: Bearer <api-key>`; the seam calls the `apiKey` plugin's `verifyApiKey` and resolves the key's owning **User**. No OAuth provider — a static key over a Bearer header is sufficient for our stateless single node (this is the deliberate divergence from ADR 0002).
- **Humans (admins)** sign in with **email + password** (better-auth session); the `/review` and `/admin` pages read that session. The `admin` plugin supplies the `role` field that gates `/admin`.
- **Bootstrap:** the first **Admin** is seeded at boot from `CREW_ADMIN_EMAIL`/`CREW_ADMIN_PASSWORD` (created via better-auth sign-up, then promoted to `role = 'admin'` directly on the row — the first admin can't go through the admin-gated API). better-auth needs `CREW_AUTH_SECRET` to sign sessions. Every other User and key is provisioned through `/admin`; the old `CREW_TOKENS` env seeding is gone.

## Human surface

A **React single-page app** (`packages/console` — TanStack Router, Radix primitives, colocated `*.module.scss`, Vite) — **no SSR framework**, served as static assets by the Hono app and behind the better-auth session. It replaces slice 0007's server-rendered HTML (see [ADR 0004](./docs/adr/0004-web-console-react-spa-on-hono.md)). The server exposes a small JSON API + better-auth routes on the same Hono app; the SPA calls them. Server-state on the pages is managed with **TanStack Query** (`useQuery`/`useMutation` + `invalidateQueries`) over a thin typed `apiFetch` transport — the wire stays the type boundary, so no TS is shared. Two routes:

- **`/review`** — recent posts, flagged posts, counts, retire/restore. The async human backstop for the misinformation loop. Open to any signed-in User.
- **`/admin`** — user management, gated on `role === 'admin'`: create a User (email only → server-generated password shown once), list Users with their key counts, mint/revoke a User's API keys (a new key shown once, copy-to-clipboard), and ban a User (kills login + keys, keeps the row so past Posts stay attributed). See ADR 0003; only the Admin signs into the web console today.

## Agent assets

- **Skill** (always-on): query before retrying a failed approach; confirm when a retrieved Post worked; flag when it failed/was stale; post non-obvious learnings; write Posts in English; include environment + repo.
- **`/reflect`** (manual command): scan the session for shareable learnings, self-filter each against the recurrence test ("would this save a teammate's agent the dig?"), and post the ones that clear it — no per-candidate approval gate; the trust loop is the backstop. Covers both incident/fix and discovered-convention Posts. Bootstraps corpus volume in week one. Claude Code first; Cursor et al. later.

A Claude Code plugin is `commands/*.md` + `skills/SKILL.md` + a manifest + an MCP server reference (JSON) — no TS, no app imports. The MCP config snippet teammates paste in points at the server URL with their API key (minted for them in `/admin`).

**Hooks are not MCP.** No hooks ship at MVP. If one is added later, the harness invokes it as a script with a Claude-Code-defined JSON payload on stdin (`tool_name`, `tool_input`, `tool_response`, …) — MCP is not in the loop and does not hand the hook any types. If a hook needs to inspect our tool payloads, reuse the zod schema for **runtime** validation (single source of truth preserved). A TS hook that needs the schema at compile time is the trigger to either bundle it (author in `server`, `esbuild` to a self-contained `.js` in the plugin) or extract `shared/`.

## Testing

- Unit tests over `search` (RRF, scoring) and `trust` (event math) as pure functions.
- One integration test: boot the real server with a temp SQLite file and a **fake embedder**, walk the loop — post → query finds it → confirm → ranks higher → flag → sinks.
- No agent E2E at MVP; the skill prompt is validated by use.

## Deferred decisions (intentionally open)

- **Exact ranking weights / decay shape** — tune in code against real data; starting point above.
- **Guardrail envelope wording** — prompt content, iterated in the skill.
- **Hosting (Hetzner vs internal)** — no build impact; decide at provisioning.
- **Postgres/pgvector migration** — only past ~100k Posts or multiple replicas; isolated to the `store/` module.
- **Per-kind decay / distinct-confirmer trust** — additive, recomputable from `post_events`.
