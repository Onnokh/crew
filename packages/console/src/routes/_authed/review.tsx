import * as Tabs from "@radix-ui/react-tabs";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
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
 * The two lists are a Radix Tabs split (recent vs flagged). Data comes from the
 * server's `/api/review/*` JSON over `apiFetch` (the wire is the type boundary —
 * ADR 0004 — so {@link ReviewRow} mirrors the server's shape, no shared package).
 * Retire/restore POST then re-fetch BOTH lists so a Post that gains/loses a flag
 * moves between tabs correctly.
 */
export const Route = createFileRoute("/_authed/review")({
  component: ReviewPage,
});

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

type Lists = { recent: ReviewRow[]; flagged: ReviewRow[] };

function ReviewPage() {
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [recent, flagged] = await Promise.all([
        apiFetch<{ posts: ReviewRow[] }>("/api/review/recent"),
        apiFetch<{ posts: ReviewRow[] }>("/api/review/flagged"),
      ]);
      setLists({ recent: recent.posts, flagged: flagged.posts });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Posts.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Retire/restore, then refresh both lists so counts and tab membership stay
  // in sync with the server (the source of truth for status and flags).
  const setRetired = useCallback(
    async (row: ReviewRow, retired: boolean) => {
      setBusyId(row.id);
      try {
        await apiFetch(`/api/review/${row.id}/${retired ? "retire" : "restore"}`, {
          method: "POST",
        });
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

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
            {lists && <span className={styles.count}>{lists.recent.length}</span>}
          </Tabs.Trigger>
          <Tabs.Trigger className={styles.tab} value="flagged">
            Flagged
            {lists && <span className={styles.count}>{lists.flagged.length}</span>}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="recent" className={styles.panel}>
          <PostList
            rows={lists?.recent}
            empty="No Posts yet."
            busyId={busyId}
            onSetRetired={setRetired}
          />
        </Tabs.Content>
        <Tabs.Content value="flagged" className={styles.panel}>
          <PostList
            rows={lists?.flagged}
            empty="No flagged Posts."
            busyId={busyId}
            onSetRetired={setRetired}
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
