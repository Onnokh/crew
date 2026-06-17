import * as Tabs from "@radix-ui/react-tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useReducer } from "react";
import { apiFetch } from "../../api/client";
import crewProfile from "../../assets/crew-profile.png";
import { useSession } from "../../auth/client";
import {
  ClaudeLogo,
  CursorLogo,
  OpenCodeLogo,
} from "../ui/brand-logos/brand-logos";
import { InstallPrompt } from "./install-prompt";
import { PostList } from "./post-list";
import { buildSetupContent } from "./setup-snippets";
import {
  reviewKeys,
  SORTERS,
  SORTS,
  type ReviewRow,
  type SortKey,
} from "./review-data";
import styles from "./review.module.scss";

/**
 * The home page's review surface (slice 0013) — the async human backstop for the
 * misinformation loop, and the public face of the shared memory. Lists recent and
 * flagged Posts with their confirm/flag/view counts and offers a search box.
 * Browsing and searching are PUBLIC (no sign-in — this is the root `/` route);
 * the moderation controls (retire drops a Post from agent `query` results,
 * restore brings it back) only render for a signed-in User, and the server gates
 * those writes regardless.
 *
 * The two lists are a Radix Tabs split (recent vs flagged), each its own
 * `useQuery` over the server's `/api/review/*` JSON (the wire is the type
 * boundary — ADR 0004 — so {@link ReviewRow} mirrors the server's shape, no
 * shared package; `apiFetch` is the queryFn transport). Retire/restore is a
 * `useMutation` that, on success, invalidates BOTH list queries so a Post that
 * gains/loses a flag moves between tabs correctly.
 */

/**
 * All of the page's view state in one place — the search box (live `term` vs the
 * submitted `query` that drives the request), the browse ordering + flagged-only
 * filter, and which agent-setup tab is open. Grouped into a reducer so one
 * intent (submit, clear) is a single update instead of several `setState` calls.
 */
type ReviewView = {
  term: string;
  query: string;
  sortKey: SortKey;
  flaggedOnly: boolean;
  setupTab: string;
};

type ReviewAction =
  | { type: "setTerm"; value: string }
  | { type: "submitSearch" }
  | { type: "clearSearch" }
  | { type: "setSort"; value: SortKey }
  | { type: "toggleFlagged" }
  | { type: "setSetupTab"; value: string };

const initialView: ReviewView = {
  term: "",
  query: "",
  sortKey: "newest",
  flaggedOnly: false,
  setupTab: "",
};

function reviewReducer(state: ReviewView, action: ReviewAction): ReviewView {
  switch (action.type) {
    case "setTerm":
      return { ...state, term: action.value };
    // Submit the live input as the active search, trimmed so a whitespace-only
    // box reads as "clear" (empty query → tabs return).
    case "submitSearch":
      return { ...state, query: state.term.trim() };
    case "clearSearch":
      return { ...state, term: "", query: "" };
    case "setSort":
      return { ...state, sortKey: action.value };
    case "toggleFlagged":
      return { ...state, flaggedOnly: !state.flaggedOnly };
    case "setSetupTab":
      return { ...state, setupTab: action.value };
  }
}

export function ReviewPage() {
  const queryClient = useQueryClient();

  // Moderation (retire/restore) is for signed-in Users only — anonymous visitors
  // browse and search but see no retire/restore controls. The server gates the
  // writes regardless; this just hides buttons that would 401.
  const { data: session } = useSession();
  const canModerate = !!session?.user;

  // `term` is the live input; `query` is the submitted text that actually drives
  // the request — set on submit so we fire one search per Enter (the same
  // one-shot shape the agent's `query` tool has), not on every keystroke. An
  // empty `query` means "not searching": the tabs show instead.
  const [view, dispatch] = useReducer(reviewReducer, initialView);
  const { term, query, sortKey, flaggedOnly, setupTab } = view;

  const { data: searchData, error: searchError } = useQuery({
    queryKey: reviewKeys.search(query),
    enabled: query !== "",
    queryFn: () =>
      apiFetch<{ posts: ReviewRow[] }>(
        `/api/review/search?q=${encodeURIComponent(query)}`,
      ).then((r) => r.posts),
  });

  // One query per tab. While a query is loading, its `data` is `undefined` —
  // which the list components below render as "Loading…" (unchanged behavior).
  const { data: recentData, error: recentError } = useQuery({
    queryKey: reviewKeys.recent(sortKey),
    queryFn: () =>
      apiFetch<{ posts: ReviewRow[] }>(
        `/api/review/recent?sort=${sortKey}`,
      ).then((r) => r.posts),
  });
  const { data: flaggedData, error: flaggedError } = useQuery({
    queryKey: reviewKeys.flagged,
    queryFn: () =>
      apiFetch<{ posts: ReviewRow[] }>("/api/review/flagged").then(
        (r) => r.posts,
      ),
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
    recentError ?? flaggedError ?? searchError ?? setRetired.error;
  const error = failure
    ? failure instanceof Error
      ? failure.message
      : "Something went wrong."
    : null;

  // Which row (if any) has an in-flight retire/restore, for per-row disabling.
  const busyId = setRetired.isPending ? setRetired.variables.row.id : null;

  const onSetRetired = (row: ReviewRow, retired: boolean) =>
    setRetired.mutate({ row, retired });

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: "submitSearch" });
  };
  const searching = query !== "";

  // The browse list. The recent list arrives already ordered by the server for
  // the active sort. The flagged list is the moderation queue: it keeps its
  // natural most-recently-flagged order under the default sort, and re-ranks
  // client-side for views/confirms (a small, capped set, so no round-trip).
  const browseRows = !flaggedOnly
    ? recentData
    : flaggedData && sortKey !== "newest"
      ? flaggedData.toSorted(SORTERS[sortKey])
      : flaggedData;

  // Agent-setup copy (config snippets + paste-in install prompts). All derived
  // from the MCP endpoint — this console's own origin + /mcp (the Hono app
  // serves both) — so the shown config is always correct wherever Crew is
  // deployed. Built in one pure call to keep this component about layout.
  const {
    mcpConfigSnippet,
    mcpAddCommand,
    cursorDeeplink,
    openCodeSnippet,
    claudeInstallPrompt,
    cursorInstallPrompt,
    openCodeInstallPrompt,
  } = buildSetupContent(`${window.location.origin}/mcp`);

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
          onValueChange={(value) => dispatch({ type: "setSetupTab", value })}
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
          onChange={(e) => dispatch({ type: "setTerm", value: e.target.value })}
        />
        {searching && (
          <button
            type="button"
            className={styles.searchClear}
            onClick={() => dispatch({ type: "clearSearch" })}
          >
            Clear
          </button>
        )}
      </form>

      {searching ? (
        <div className={styles.panel}>
          <PostList
            rows={searchData}
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
                  onClick={() => dispatch({ type: "setSort", value: s.key })}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-pressed={flaggedOnly}
              className={`${styles.flaggedChip} ${flaggedOnly ? styles.flaggedChipActive : ""}`}
              onClick={() => dispatch({ type: "toggleFlagged" })}
            >
              Flagged
              {flaggedData && (
                <span className={styles.flaggedCount}>{flaggedData.length}</span>
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
