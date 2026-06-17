import { Archive, Check, ChevronDown, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { ReviewRow } from "./review-data";
import styles from "./review.module.scss";

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
export function PostCard({
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
