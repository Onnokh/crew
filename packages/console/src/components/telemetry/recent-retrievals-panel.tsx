import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";
import { telemetryKeys, type RetrievalRow } from "./telemetry-data";
import styles from "./telemetry.module.scss";

/**
 * The recent-Retrievals panel: the latest `query` calls, each showing the
 * situation searched, how many Posts came back, and when. The dashboard's first
 * panel and the foundation PLO-51 grows into a tuning view — it will enrich each
 * row here with the returned Posts (rank), a converted? indicator, and an
 * expandable score breakdown. Keep the row a self-contained unit so that grows
 * in place rather than forcing a rewrite.
 */
export function RecentRetrievalsPanel() {
  const { data, error } = useQuery({
    queryKey: telemetryKeys.recent,
    queryFn: () =>
      apiFetch<{ retrievals: RetrievalRow[] }>("/api/telemetry/recent").then(
        (r) => r.retrievals,
      ),
  });

  if (error) {
    return (
      <p className={styles.error} role="alert">
        {error instanceof Error ? error.message : "Something went wrong."}
      </p>
    );
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return <p className={styles.muted}>No retrievals yet.</p>;
  }

  return (
    <ul className={styles.rows}>
      {rows.map((row) => (
        <li key={row.id} className={styles.row}>
          <span className={styles.situation} title={row.situation}>
            {row.situation}
          </span>
          <span className={styles.meta}>
            <span className={row.resultCount === 0 ? styles.zero : undefined}>
              {row.resultCount} {row.resultCount === 1 ? "result" : "results"}
            </span>
            <span className={styles.dot}>·</span>
            <span className={styles.time}>{ago(row.createdAt)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Coarse "time ago" phrase for a unix-ms timestamp (mirrors the server's `age`). */
function ago(then: number): string {
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
