import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";
import {
  telemetryKeys,
  type RetrievalResultRow,
  type RetrievalRow,
} from "./telemetry-data";
import styles from "./telemetry.module.scss";

/**
 * The recent-Retrievals tuning view (PLO-51, grown from the PLO-48 panel): the
 * latest `query` calls, each showing the situation searched, a converted?
 * indicator, and the returned Posts WITH rank. Each result row expands to its
 * full captured score breakdown (rrf · trust · recency · repo_boost = final), so
 * a tuner can see why a Post ranked where it did. Reads the raw rows captured in
 * PLO-48 — no new capture. The converted? value is derived server-side from the
 * PLO-48 `conversionStats` helper.
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
        <li key={row.id} className={styles.retrieval}>
          <div className={styles.row}>
            <span className={styles.situation} title={row.situation}>
              {row.situation}
            </span>
            <span className={styles.meta}>
              <ConvertedBadge converted={row.converted} />
              <span className={styles.dot}>·</span>
              <span className={row.resultCount === 0 ? styles.zero : undefined}>
                {row.resultCount} {row.resultCount === 1 ? "result" : "results"}
              </span>
              <span className={styles.dot}>·</span>
              <span className={styles.time}>{ago(row.createdAt)}</span>
            </span>
          </div>

          {row.results.length > 0 && (
            <ol className={styles.results}>
              {row.results.map((result) => (
                <ResultRow key={result.postId} result={result} />
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A converted?/not-converted pill, so a glance separates the two. */
function ConvertedBadge({ converted }: { converted: boolean }) {
  return (
    <span
      className={converted ? styles.converted : styles.notConverted}
      title={
        converted
          ? "The querier later confirmed a returned Post (within the attribution window)."
          : "No matching Confirm within the attribution window."
      }
    >
      {converted ? "converted" : "not converted"}
    </span>
  );
}

/**
 * One returned Post: its rank and label always shown; a disclosure reveals the
 * full score breakdown. Native <details> keeps the drill-down dependency-free.
 */
function ResultRow({ result }: { result: RetrievalResultRow }) {
  return (
    <li className={styles.result}>
      <details className={styles.breakdown}>
        <summary className={styles.resultSummary}>
          <span className={styles.rank}>#{result.rank}</span>
          <span
            className={styles.postLabel}
            title={result.postTitle ?? result.postId}
          >
            {result.postTitle ?? (
              <span className={styles.missingPost}>{result.postId}</span>
            )}
          </span>
          <span className={styles.finalScore}>{fmt(result.final)}</span>
        </summary>
        <dl className={styles.scores}>
          <Score label="rrf_score" value={result.rrfScore} />
          <Score label="trust" value={result.trust} />
          <Score label="recency" value={result.recency} />
          <Score label="repo_boost" value={result.repoBoost} />
          <Score label="final" value={result.final} />
        </dl>
      </details>
    </li>
  );
}

/** One labeled score in the breakdown grid. */
function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.score}>
      <dt className={styles.scoreLabel}>{label}</dt>
      <dd className={styles.scoreValue}>{fmt(value)}</dd>
    </div>
  );
}

/** Compact, readable number — 4 significant-ish digits, trimmed. */
function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
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
