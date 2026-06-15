import * as Tabs from "@radix-ui/react-tabs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { apiFetch } from "../../api/client";
import styles from "./review.module.scss";

/**
 * The review page (slice 0013) — the async human backstop for the misinformation
 * loop. Lists recent and flagged Posts with their confirm/flag/view counts and
 * offers retire/restore controls; retiring a Post drops it from agent `query`
 * results, restoring brings it back. Open to ANY signed-in User: the `_authed`
 * parent already guards the route, so there's no extra gate here (post-hoc
 * review, not a pre-publish gate).
 *
 * The two lists are a Radix Tabs split (recent vs flagged), each its own
 * `useQuery` over the server's `/api/review/*` JSON (the wire is the type
 * boundary — ADR 0004 — so {@link ReviewRow} mirrors the server's shape, no
 * shared package; `apiFetch` is the queryFn transport). Retire/restore is a
 * `useMutation` that, on success, invalidates BOTH list queries so a Post that
 * gains/loses a flag moves between tabs correctly — replacing the old explicit
 * "POST then await refetch of both lists" dance.
 */
export const Route = createFileRoute("/_authed/review")({
  component: ReviewPage,
});

/** Centralized query keys, so the mutation can invalidate exactly these lists. */
const reviewKeys = {
  recent: ["review", "recent"] as const,
  flagged: ["review", "flagged"] as const,
};

/** Mirrors the server's `ReviewRow` (packages/server/src/api/review.ts). */
type ReviewRow = {
  id: string;
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

function ReviewPage() {
  const queryClient = useQueryClient();

  // One query per tab. While a query is loading, its `data` is `undefined` —
  // which the list components below render as "Loading…" (unchanged behavior).
  const recent = useQuery({
    queryKey: reviewKeys.recent,
    queryFn: () =>
      apiFetch<{ posts: ReviewRow[] }>("/api/review/recent").then((r) => r.posts),
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
        queryClient.invalidateQueries({ queryKey: reviewKeys.recent }),
        queryClient.invalidateQueries({ queryKey: reviewKeys.flagged }),
      ]);
    },
  });

  // Surface whichever load/action failed, mirroring the old single error line.
  const failure = recent.error ?? flagged.error ?? setRetired.error;
  const error = failure
    ? failure instanceof Error
      ? failure.message
      : "Something went wrong."
    : null;

  // Which row (if any) has an in-flight retire/restore, for per-row disabling.
  const busyId = setRetired.isPending ? setRetired.variables.row.id : null;

  const onSetRetired = (row: ReviewRow, retired: boolean) =>
    setRetired.mutate({ row, retired });

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <h1>Review</h1>
        <p className={styles.lede}>
          The async human backstop for the misinformation loop. Retire a Post to
          hide it from agent <code>query</code> results; restore it to bring it
          back.
        </p>
      </header>

      {error && <p className={styles.error}>{error}</p>}

      <Tabs.Root defaultValue="recent" className={styles.tabs}>
        <Tabs.List className={styles.tabList} aria-label="Review lists">
          <Tabs.Trigger className={styles.tab} value="recent">
            Recent
            {recent.data && (
              <span className={styles.count}>{recent.data.length}</span>
            )}
          </Tabs.Trigger>
          <Tabs.Trigger className={styles.tab} value="flagged">
            Flagged
            {flagged.data && (
              <span className={styles.count}>{flagged.data.length}</span>
            )}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="recent" className={styles.panel}>
          <PostList
            rows={recent.data}
            empty="No Posts yet."
            busyId={busyId}
            onSetRetired={onSetRetired}
          />
        </Tabs.Content>
        <Tabs.Content value="flagged" className={styles.panel}>
          <PostList
            rows={flagged.data}
            empty="No flagged Posts."
            busyId={busyId}
            onSetRetired={onSetRetired}
          />
        </Tabs.Content>
      </Tabs.Root>
    </section>
  );
}

/** One tab's list of Post cards, or a loading / empty-state line. */
function PostList({
  rows,
  empty,
  busyId,
  onSetRetired,
}: {
  rows: ReviewRow[] | undefined;
  empty: string;
  busyId: string | null;
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
          onSetRetired={onSetRetired}
        />
      ))}
    </ul>
  );
}

/** One Post card: situation, body, provenance + counts, and the retire/restore control. */
function PostCard({
  row,
  busy,
  onSetRetired,
}: {
  row: ReviewRow;
  busy: boolean;
  onSetRetired: (row: ReviewRow, retired: boolean) => void;
}) {
  const retired = row.status === "retired";
  return (
    <li className={`${styles.card} ${retired ? styles.retired : ""}`}>
      <div className={styles.cardHead}>
        <h3 className={styles.situation}>{row.situation}</h3>
        {retired && <span className={styles.tag}>retired</span>}
      </div>
      <p className={styles.body}>{row.body}</p>
      <p className={styles.prov}>
        by {row.authorName} in <code>{row.repo}</code> · {row.confirms} confirms /{" "}
        {row.flags} flags / {row.views} views
      </p>
      <div className={styles.actions}>
        {retired ? (
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() => onSetRetired(row, false)}
          >
            Restore
          </button>
        ) : (
          <button
            type="button"
            className={`${styles.button} ${styles.danger}`}
            disabled={busy}
            onClick={() => onSetRetired(row, true)}
          >
            Retire
          </button>
        )}
      </div>
    </li>
  );
}
