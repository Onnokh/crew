import { Check, Eye, Flag, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { ReviewRow } from "./review-data";
import styles from "./review.module.scss";

/** Clock time (`10:31`) for today's Posts, day-month (`16-06`) for earlier ones. */
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

/** Reduce a repo identifier to its `group/name` tail; falls back to the raw value. */
function repoSlug(repo: string): string {
  const segments = repo
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .split("/")
    .filter(Boolean);
  return segments.length >= 2 ? segments.slice(-2).join("/") : repo;
}

/** One Post entry: heading with metrics, a disclosure chevron, and (for its author or an admin) a delete control with inline confirm. */
export function PostCard({
  row,
  busy,
  canDelete,
  onDelete,
}: {
  row: ReviewRow;
  busy: boolean;
  canDelete: boolean;
  onDelete: (row: ReviewRow) => void;
}) {
  const retired = row.status === "retired";
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <li className={`${styles.card} ${retired ? styles.retired : ""}`}>
      <div className={styles.main}>
        {/* The whole header toggles the solution; the delete control (left gutter) stops propagation so it doesn't. */}
        <div
          className={styles.header}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpanded((x) => !x);
            }
          }}
        >
          {canDelete && (
            <span
              className={styles.controls}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {confirming ? (
                <>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.danger}`}
                    disabled={busy}
                    onClick={() => onDelete(row)}
                    aria-label="Confirm delete"
                    title="Confirm delete"
                  >
                    <Check size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={busy}
                    onClick={() => setConfirming(false)}
                    aria-label="Cancel delete"
                    title="Cancel delete"
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.danger}`}
                  disabled={busy}
                  onClick={() => setConfirming(true)}
                  aria-label="Delete"
                  title="Delete"
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              )}
            </span>
          )}
          <h3 className={styles.title}>
            <span className={styles.titleText}>{row.title}</span>
            <span className={styles.sep}>/</span>
            <span className={styles.project} title={row.repo}>
              {repoSlug(row.repo)}
            </span>
            {retired && <span className={styles.tag}>retired</span>}
            <span className={styles.metrics}>
              <span
                className={`${styles.metric} ${row.confirms ? styles.up : styles.zero}`}
                title={`${row.confirms} confirmed`}
              >
                <Check size={13} aria-hidden="true" />
                {row.confirms}
              </span>
              <span
                className={`${styles.metric} ${row.flags ? styles.down : styles.zero}`}
                title={`${row.flags} flagged`}
              >
                <Flag size={13} aria-hidden="true" />
                {row.flags}
              </span>
              <span
                className={`${styles.metric} ${styles.zero}`}
                title={`${row.views} views`}
              >
                <Eye size={13} aria-hidden="true" />
                {row.views}
              </span>
              <span className={styles.dot}>·</span>
              <time
                className={styles.time}
                dateTime={new Date(row.createdAt).toISOString()}
                title={new Date(row.createdAt).toLocaleString()}
              >
                {shortTime(row.createdAt)}
              </time>
            </span>
          </h3>
          {row.situation !== row.title && (
            <p className={styles.situation}>{row.situation}</p>
          )}
        </div>
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
