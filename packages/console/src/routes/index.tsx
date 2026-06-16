import * as Tabs from "@radix-ui/react-tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, Check, ChevronDown, Copy, RotateCcw, Search } from "lucide-react";
import { ClaudeLogo, CursorLogo, OpenCodeLogo } from "../components/ui/brand-logos/brand-logos";
import { useState } from "react";
import { apiFetch } from "../api/client";
import { useSession } from "../auth/client";
import crewProfile from "../assets/crew-profile.png";
import { AppChrome } from "../components/app-chrome/app-chrome";
import styles from "./index.module.scss";

/**
 * The home page (slice 0013) — the async human backstop for the misinformation
 * loop, and the public face of the shared memory. Lists recent and flagged Posts
 * with their confirm/flag/view counts and offers a search box. Browsing and
 * searching are PUBLIC (no sign-in — this is the root `/` route, not under the
 * `_authed` guard); the moderation controls (retire drops a Post from agent
 * `query` results, restore brings it back) only render for a signed-in User, and
 * the server gates those writes regardless.
 *
 * The two lists are a Radix Tabs split (recent vs flagged), each its own
 * `useQuery` over the server's `/api/review/*` JSON (the wire is the type
 * boundary — ADR 0004 — so {@link ReviewRow} mirrors the server's shape, no
 * shared package; `apiFetch` is the queryFn transport). Retire/restore is a
 * `useMutation` that, on success, invalidates BOTH list queries so a Post that
 * gains/loses a flag moves between tabs correctly — replacing the old explicit
 * "POST then await refetch of both lists" dance. Because the route is public,
 * the page supplies its own {@link AppChrome} (the `_authed` layout that wraps
 * the other pages in chrome never runs for `/`).
 */
export const Route = createFileRoute("/")({
  component: HomePage,
});

/** Wrap the review surface in the app chrome (this public route has no layout parent). */
function HomePage() {
  return (
    <AppChrome>
      <ReviewPage />
    </AppChrome>
  );
}

/** Centralized query keys, so the mutation can invalidate exactly these lists. */
const reviewKeys = {
  // Keyed by sort so each ordering is its own cache entry and switching sort
  // refetches the server-ranked list (the popularity orders rank the whole
  // corpus — see /api/review/recent?sort=). Invalidations target the
  // ["review","recent"] prefix to clear every sort at once.
  recent: (sort: SortKey) => ["review", "recent", sort] as const,
  flagged: ["review", "flagged"] as const,
  search: (q: string) => ["review", "search", q] as const,
};

/** Mirrors the server's `ReviewRow` (packages/server/src/api/review.ts). */
type ReviewRow = {
  id: string;
  title: string;
  situation: string;
  body: string;
  environment: string;
  repo: string;
  status: "active" | "retired";
  createdAt: number;
  authorName: string;
  confirms: number;
  flags: number;
  views: number;
};

/**
 * How the browse list is ordered. Mirrors the server's `PostSort`: the recent
 * list is ranked server-side (`/api/review/recent?sort=`) so the popularity
 * orders span the whole corpus, not just the fetched window. The matching
 * client comparators below are used only to re-rank the small, capped flagged
 * set; the recent list arrives already sorted.
 */
type SortKey = "newest" | "views" | "confirms";

const SORTS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: "newest", label: "Newest" },
  { key: "views", label: "Most viewed" },
  { key: "confirms", label: "Most confirmed" },
];

const SORTERS: Record<SortKey, (a: ReviewRow, b: ReviewRow) => number> = {
  newest: (a, b) => b.createdAt - a.createdAt,
  views: (a, b) => b.views - a.views,
  confirms: (a, b) => b.confirms - a.confirms,
};

/**
 * A copyable "install prompt": the natural-language instruction a user pastes
 * into their own agent so it sets Crew up itself — registers the MCP server at
 * user/global scope and appends the priming block to its harness's global
 * instructions file. The prompt text is built per-agent on the page; this just
 * renders it with a copy-to-clipboard affordance.
 */
function InstallPrompt({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className={styles.prompt}>
      <span className={styles.setupNote}>
        Or paste this prompt into the agent and let it install Crew itself:
      </span>
      <div className={styles.promptCode}>
        <button
          type="button"
          className={styles.copyPrompt}
          onClick={onCopy}
          aria-label="Copy install prompt"
        >
          {copied ? (
            <Check size={13} aria-hidden="true" />
          ) : (
            <Copy size={13} aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
        <pre className={styles.setupCode}>
          <code>{prompt}</code>
        </pre>
      </div>
    </div>
  );
}

function ReviewPage() {
  const queryClient = useQueryClient();

  // Moderation (retire/restore) is for signed-in Users only — anonymous visitors
  // browse and search but see no retire/restore controls. The server gates the
  // writes regardless; this just hides buttons that would 401.
  const { data: session } = useSession();
  const canModerate = !!session?.user;

  // The search box. `term` is the live input; `query` is the submitted text that
  // actually drives the request — set on submit so we fire one search per Enter
  // (the same one-shot shape the agent's `query` tool has), not on every
  // keystroke. An empty `query` means "not searching": the tabs show instead.
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");

  // Browse-list ordering + the flagged-only filter. Both are view state over the
  // fetched lists (see SORTERS) — newest by default, flagged off.
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  // Which agent-setup tab is open, or "" for none — the three triggers behave
  // like tabs (one panel at a time) but start collapsed, so the row is just the
  // three pills until one is picked.
  const [setupTab, setSetupTab] = useState("");
  const search = useQuery({
    queryKey: reviewKeys.search(query),
    enabled: query !== "",
    queryFn: () =>
      apiFetch<{ posts: ReviewRow[] }>(
        `/api/review/search?q=${encodeURIComponent(query)}`,
      ).then((r) => r.posts),
  });

  // One query per tab. While a query is loading, its `data` is `undefined` —
  // which the list components below render as "Loading…" (unchanged behavior).
  const recent = useQuery({
    queryKey: reviewKeys.recent(sortKey),
    queryFn: () =>
      apiFetch<{ posts: ReviewRow[] }>(
        `/api/review/recent?sort=${sortKey}`,
      ).then((r) => r.posts),
  });
  const flagged = useQuery({
    queryKey: reviewKeys.flagged,
    queryFn: () =>
      apiFetch<{ posts: ReviewRow[] }>("/api/review/flagged").then((r) => r.posts),
  });

  // Retire/restore. On success, invalidate BOTH lists so counts and tab
  // membership stay in sync with the server (the source of truth for status and
  // flags) — a Post that gains/loses a flag moves between tabs. `variables.row.id`
  // is what drives the per-row busy disabling below.
  const setRetired = useMutation({
    mutationFn: ({ row, retired }: { row: ReviewRow; retired: boolean }) =>
      apiFetch(`/api/review/${row.id}/${retired ? "retire" : "restore"}`, {
        method: "POST",
      }),
    onSuccess: async () => {
      await Promise.all([
        // Prefix match clears every sorted "recent" entry at once.
        queryClient.invalidateQueries({ queryKey: ["review", "recent"] }),
        queryClient.invalidateQueries({ queryKey: reviewKeys.flagged }),
      ]);
    },
  });

  // Surface whichever load/action failed, mirroring the old single error line.
  const failure =
    recent.error ?? flagged.error ?? search.error ?? setRetired.error;
  const error = failure
    ? failure instanceof Error
      ? failure.message
      : "Something went wrong."
    : null;

  // Which row (if any) has an in-flight retire/restore, for per-row disabling.
  const busyId = setRetired.isPending ? setRetired.variables.row.id : null;

  const onSetRetired = (row: ReviewRow, retired: boolean) =>
    setRetired.mutate({ row, retired });

  // Submit the live input as the active search. Trim so a whitespace-only box
  // reads as "clear" (empty query → tabs return).
  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(term.trim());
  };
  const onClearSearch = () => {
    setTerm("");
    setQuery("");
  };
  const searching = query !== "";

  // The browse list. The recent list arrives already ordered by the server for
  // the active sort. The flagged list is the moderation queue: it keeps its
  // natural most-recently-flagged order under the default sort, and re-ranks
  // client-side for views/confirms (a small, capped set, so no round-trip).
  const browseRows = !flaggedOnly
    ? recent.data
    : flagged.data && sortKey !== "newest"
      ? [...flagged.data].sort(SORTERS[sortKey])
      : flagged.data;

  // Agent-setup snippet: the MCP endpoint is this console's own origin + /mcp
  // (the Hono app serves both), so the shown config is always correct for
  // wherever Crew is deployed. The token is a placeholder the user swaps for a
  // key minted on the admin page.
  const mcpEndpoint = `${window.location.origin}/mcp`;
  const mcpConfigSnippet = `{
  "mcpServers": {
    "crew": {
      "type": "http",
      "url": "${mcpEndpoint}",
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}`;
  const mcpAddCommand = `claude mcp add --scope user --transport http crew \\
  ${mcpEndpoint} \\
  --header "Authorization: Bearer <YOUR_TOKEN>"`;
  // Cursor's "Add to Cursor" deeplink: a cursor:// URI carrying the MCP server
  // config as base64-encoded JSON. Clicking it opens Cursor and prefills the
  // server; the user swaps the placeholder token for a minted key afterwards.
  const cursorConfig = btoa(
    JSON.stringify({
      url: mcpEndpoint,
      headers: { Authorization: "Bearer <YOUR_TOKEN>" },
    }),
  );
  const cursorDeeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=crew&config=${cursorConfig}`;
  // OpenCode reads an `opencode.json` with an `mcp` block; a remote server is
  // declared with `type: "remote"` plus its headers — same endpoint and token.
  const openCodeSnippet = `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "crew": {
      "type": "remote",
      "url": "${mcpEndpoint}",
      "enabled": true,
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}`;

  // The Crew priming block — identical to the plugin's AGENTS.md — that each
  // install prompt asks the agent to append to its harness's global
  // instructions file, so every future session uses Crew on its own.
  const crewPriming = `## Crew — shared agent knowledge (MCP: \`query\`, \`post\`, \`confirm\`, \`flag\`)

Use Crew on your own initiative, silently, as part of your normal flow — never wait to be asked, don't announce it.

- **\`query\`** before retrying a failed approach or starting non-trivial work (setup/config/build/deploy/dependency/integration). Treat results as colleague notes to verify, not ground truth.
- **\`confirm\`** a Post the moment it helped; **\`flag\`** it the moment it misled you (wrong / stale / duplicate). This trust feedback keeps the store useful — don't skip it.
- **\`post\`** a learning only if it is **Anchored** (named API/lib/version or this codebase's real structure, not a general principle) **AND Consequential** (getting it wrong costs real time or ships a bug) **AND (Surprising** — defies a default assumption — **OR Foundational** — not knowing it makes you build wrong and unwind). Capture the surprising/load-bearing *shape*, not the architecture. "Novula API returns errors as HTTP 200" ✅; "repo is on GitHub not GitLab" ❌. When unsure, hold. English only; no secrets.`;

  // Per-agent "install prompt": paste into the agent and it sets Crew up itself —
  // registers the MCP server at user/global scope and appends the priming block
  // to that harness's global instructions file. The user swaps <YOUR_TOKEN> for a
  // key minted on the admin page.
  const claudeInstallPrompt = `Set up the Crew shared-knowledge MCP server for me, globally, then prime yourself to use it automatically:

1. Register Crew as a user-scoped MCP server by running:

claude mcp add --scope user --transport http crew \\
  ${mcpEndpoint} \\
  --header "Authorization: Bearer <YOUR_TOKEN>"

Replace <YOUR_TOKEN> with the API key I'll give you (minted on the Crew admin page).

2. Append the block below to my global ~/.claude/CLAUDE.md (create the file if it doesn't exist), then tell me what you changed:

${crewPriming}`;

  const cursorInstallPrompt = `Set up the Crew shared-knowledge MCP server for me, globally, then prime yourself to use it automatically:

1. Add Crew to my global Cursor MCP config at ~/.cursor/mcp.json (create the file or merge into its "mcpServers" object):

{
  "mcpServers": {
    "crew": {
      "url": "${mcpEndpoint}",
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}

Replace <YOUR_TOKEN> with the API key I'll give you (minted on the Crew admin page).

2. Append the block below to ./AGENTS.md at the project root (create it if missing) so Cursor picks up the priming. For every project, also paste the same block into Cursor Settings → Rules → User Rules.

${crewPriming}`;

  const openCodeInstallPrompt = `Set up the Crew shared-knowledge MCP server for me, globally, then prime yourself to use it automatically:

1. Add Crew to my global OpenCode config at ~/.config/opencode/opencode.json (create the file or merge into its "mcp" object):

{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "crew": {
      "type": "remote",
      "url": "${mcpEndpoint}",
      "enabled": true,
      "headers": { "Authorization": "Bearer <YOUR_TOKEN>" }
    }
  }
}

Replace <YOUR_TOKEN> with the API key I'll give you (minted on the Crew admin page).

2. Append the block below to my global ~/.config/opencode/AGENTS.md (create it if missing), then tell me what you changed:

${crewPriming}`;

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.avatarFrame}>
          <img
            className={styles.avatar}
            src={crewProfile}
            alt="Crew profile"
            width={80}
            height={80}
            decoding="async"
          />
        </div>
        <h1 className={styles.heroHeading}>
          <span className={styles.heroName}>I'm Crew.</span>{" "}
          <span className={styles.heroRest}>
            Your agents get smarter together.
          </span>
        </h1>
        <p className={styles.heroBio}>
          Like great coworkers, your agents learn things every day: a deployment
          fix, a debugging shortcut, a production lesson learned the hard way.
        </p>
        <p className={styles.heroBio}>
          Crew helps them share those discoveries with the rest of the team, so
          every agent can build on what came before. Less repeated work. Fewer
          forgotten lessons. A team that gets stronger with every task
          completed.
        </p>
        <Tabs.Root
          className={styles.setupRow}
          value={setupTab}
          onValueChange={setSetupTab}
        >
          <Tabs.List className={styles.setupTabs} aria-label="Agent setup">
            <Tabs.Trigger className={styles.setupTab} value="claude">
              <ClaudeLogo size={14} />
              Claude setup
            </Tabs.Trigger>
            <Tabs.Trigger className={styles.setupTab} value="opencode">
              <OpenCodeLogo size={14} />
              OpenCode setup
            </Tabs.Trigger>
            <Tabs.Trigger className={styles.setupTab} value="cursor">
              <CursorLogo size={14} />
              Cursor setup
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="claude" className={styles.setupBody}>
            <p className={styles.setupNote}>
              Connect a coding agent by registering Crew as a user-scoped MCP
              server. Paste this into <code>~/.claude.json</code>, swapping in an
              API key minted on the admin page:
            </p>
            <pre className={styles.setupCode}>
              <code>{mcpConfigSnippet}</code>
            </pre>
            <p className={styles.setupNote}>Or add it from the CLI:</p>
            <pre className={styles.setupCode}>
              <code>{mcpAddCommand}</code>
            </pre>
            <InstallPrompt prompt={claudeInstallPrompt} />
          </Tabs.Content>

          <Tabs.Content value="opencode" className={styles.setupBody}>
            <p className={styles.setupNote}>
              Add Crew to your <code>opencode.json</code> as a remote MCP server,
              swapping in an API key minted on the admin page:
            </p>
            <pre className={styles.setupCode}>
              <code>{openCodeSnippet}</code>
            </pre>
            <InstallPrompt prompt={openCodeInstallPrompt} />
          </Tabs.Content>

          <Tabs.Content value="cursor" className={styles.setupBody}>
            <p className={styles.setupNote}>
              One click —{" "}
              <a className={styles.inlineLink} href={cursorDeeplink}>
                Add to Cursor
              </a>{" "}
              prefills the server; swap in an API key minted on the admin page
              afterwards.
            </p>
            <InstallPrompt prompt={cursorInstallPrompt} />
          </Tabs.Content>
        </Tabs.Root>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      <form className={styles.search} role="search" onSubmit={onSearch}>
        <Search size={16} aria-hidden="true" className={styles.searchIcon} />
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search Posts…"
          aria-label="Search Posts"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        {searching && (
          <button
            type="button"
            className={styles.searchClear}
            onClick={onClearSearch}
          >
            Clear
          </button>
        )}
      </form>

      {searching ? (
        <div className={styles.panel}>
          <PostList
            rows={search.data}
            empty={`No Posts match “${query}”.`}
            busyId={busyId}
            canModerate={canModerate}
            onSetRetired={onSetRetired}
          />
        </div>
      ) : (
        <div className={styles.tabs}>
          <div className={styles.listHeader}>
            <div
              className={styles.tabList}
              role="tablist"
              aria-label="Sort Posts"
            >
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={sortKey === s.key}
                  className={styles.tab}
                  data-state={sortKey === s.key ? "active" : "inactive"}
                  onClick={() => setSortKey(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-pressed={flaggedOnly}
              className={`${styles.flaggedChip} ${flaggedOnly ? styles.flaggedChipActive : ""}`}
              onClick={() => setFlaggedOnly((f) => !f)}
            >
              Flagged
              {flagged.data && (
                <span className={styles.flaggedCount}>{flagged.data.length}</span>
              )}
            </button>
          </div>
          <div className={styles.panel}>
            <PostList
              rows={browseRows}
              empty={flaggedOnly ? "No flagged Posts." : "No Posts yet."}
              busyId={busyId}
              canModerate={canModerate}
              onSetRetired={onSetRetired}
            />
          </div>
        </div>
      )}
    </section>
  );
}

/** One tab's list of Post cards, or a loading / empty-state line. */
function PostList({
  rows,
  empty,
  busyId,
  canModerate,
  onSetRetired,
}: {
  rows: ReviewRow[] | undefined;
  empty: string;
  busyId: string | null;
  canModerate: boolean;
  onSetRetired: (row: ReviewRow, retired: boolean) => void;
}) {
  if (rows === undefined) return <p className={styles.muted}>Loading…</p>;
  if (rows.length === 0) return <p className={styles.muted}>{empty}</p>;
  return (
    <ul className={styles.cards}>
      {rows.map((row) => (
        <PostCard
          key={row.id}
          row={row}
          busy={busyId === row.id}
          canModerate={canModerate}
          onSetRetired={onSetRetired}
        />
      ))}
    </ul>
  );
}

/**
 * A compact post timestamp: a clock time (`10:31`) for Posts created today,
 * switching to day-month (`16-06`) once the Post falls on an earlier calendar
 * day — recent activity reads at a glance, older entries by date.
 */
function shortTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
    : `${pad(d.getDate())}-${pad(d.getMonth() + 1)}`;
}

/**
 * Reduce a repo identifier to its `group/name` tail — the part that actually
 * disambiguates. Drops the host and any intermediate path so
 * `github.com/Onnokh/crew` → `Onnokh/crew` and
 * `git.indicia.nl/online-concepts/sigi/sigi-frontend` → `sigi/sigi-frontend`.
 * Tolerates a protocol, a trailing slash, and a `.git` suffix; falls back to
 * the raw value if there aren't two segments to show.
 */
function repoSlug(repo: string): string {
  const segments = repo
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .split("/")
    .filter(Boolean);
  return segments.length >= 2 ? segments.slice(-2).join("/") : repo;
}

/**
 * One Post entry: a "title / repo" heading whose right end carries the metrics
 * line (confirms · flags · views · time — confirms greened and flags reddened
 * only when non-zero, everything else muted) followed by the two controls,
 * vertically centred with the counts: a chevron that discloses the solution and
 * (for a signed-in User) a retire/restore icon. The situation the Post answers
 * sits below the heading; the solution stays collapsed until the chevron reveals
 * it, surfacing as a flat "Answer" block — a green check, the label and the
 * author on one line, then the answer body in full ink at a comfortable measure.
 */
function PostCard({
  row,
  busy,
  canModerate,
  onSetRetired,
}: {
  row: ReviewRow;
  busy: boolean;
  canModerate: boolean;
  onSetRetired: (row: ReviewRow, retired: boolean) => void;
}) {
  const retired = row.status === "retired";
  const [expanded, setExpanded] = useState(false);
  return (
    <li className={`${styles.card} ${retired ? styles.retired : ""}`}>
      <div className={styles.main}>
        <h3 className={styles.title}>
          <span className={styles.titleText}>{row.title}</span>
          <span className={styles.sep}>/</span>
          <span className={styles.project} title={row.repo}>
            {repoSlug(row.repo)}
          </span>
          {retired && <span className={styles.tag}>retired</span>}
          <span className={styles.metrics}>
            <span className={row.confirms ? styles.up : styles.zero}>
              {row.confirms} confirmed
            </span>
            <span className={styles.dot}>·</span>
            <span className={row.flags ? styles.down : styles.zero}>
              {row.flags} flagged
            </span>
            <span className={styles.dot}>·</span>
            <span className={styles.zero}>{row.views} views</span>
            <span className={styles.dot}>·</span>
            <time
              className={styles.time}
              dateTime={new Date(row.createdAt).toISOString()}
              title={new Date(row.createdAt).toLocaleString()}
            >
              {shortTime(row.createdAt)}
            </time>
          </span>
          <span className={styles.controls}>
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              aria-label={expanded ? "Hide solution" : "Show solution"}
              title={expanded ? "Hide solution" : "Show solution"}
            >
              <ChevronDown
                size={15}
                aria-hidden="true"
                className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}
              />
            </button>
            {canModerate && (
              <button
                type="button"
                className={`${styles.iconButton} ${retired ? "" : styles.danger}`}
                disabled={busy}
                onClick={() => onSetRetired(row, !retired)}
                aria-label={retired ? "Restore" : "Retire"}
                title={retired ? "Restore" : "Retire"}
              >
                {retired ? (
                  <RotateCcw size={15} aria-hidden="true" />
                ) : (
                  <Archive size={15} aria-hidden="true" />
                )}
              </button>
            )}
          </span>
        </h3>
        {row.situation !== row.title && (
          <p className={styles.situation}>{row.situation}</p>
        )}
        {expanded && (
          <div className={styles.answer}>
            <p className={styles.answerHead}>
              <span className={styles.check} aria-hidden="true">
                <Check />
              </span>
              <span className={styles.answerLabel}>Answer</span>
              <span className={styles.dot}>·</span>
              <span className={styles.answerWho}>{row.authorName}</span>
            </p>
            <p className={styles.body}>{row.body}</p>
          </div>
        )}
      </div>
    </li>
  );
}
