import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SearchX,
} from "lucide-react";
import { useState } from "react";
import { ApiError, apiFetch } from "../../../api/client";
import {
  telemetryKeys,
  type RetrievalRow,
  type RetrievalResultRow,
  type RetrievalsPanelData,
} from "../../telemetry/telemetry-data";
import { EmptyState } from "../../ui/empty-state/empty-state";
import { PageHeading } from "../../ui/page-heading/page-heading";
import { fullDateTime, relativeTime } from "../../../lib/format";
import shared from "../../../styles/dashboard.module.scss";
import styles from "./retrievals-dashboard.module.scss";

const PAGE_SIZE = 15;

/**
 * The Retrievals sub-page (ADR 0009): a paginated list of recent Retrievals —
 * what the crew searched for — each expandable to the ranked Posts it returned
 * with their score breakdown. A zero-result filter surfaces the coverage gaps
 * (queries that found nothing — Posts worth writing).
 */
export default function RetrievalsDashboard() {
  const [page, setPage] = useState(0);
  const [gapsOnly, setGapsOnly] = useState(false);

  const { data, error, isLoading, isPlaceholderData } = useQuery({
    queryKey: [...telemetryKeys.recent, page, gapsOnly],
    queryFn: () =>
      apiFetch<RetrievalsPanelData>(
        `/api/telemetry/recent?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}` +
          (gapsOnly ? "&filter=zero-result" : ""),
      ),
    placeholderData: keepPreviousData,
  });

  const setFilter = (next: boolean) => {
    setGapsOnly(next);
    setPage(0);
  };

  if (error) {
    return (
      <section className={shared.usagePage}>
        <PageHeading title="Retrievals" subtitle={SUBTITLE} />
        <p className={shared.error} role="alert">
          {describe(error)}
        </p>
      </section>
    );
  }

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const retrievals = data?.retrievals ?? [];
  const firstRow = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastRow = page * PAGE_SIZE + retrievals.length;

  return (
    <section className={shared.usagePage}>
      <PageHeading
        title="Retrievals"
        subtitle={SUBTITLE}
        action={
          <div className={styles.filter} role="group" aria-label="Filter retrievals">
            <button
              type="button"
              className={!gapsOnly ? styles.filterActive : styles.filterButton}
              onClick={() => setFilter(false)}
              aria-pressed={!gapsOnly}
            >
              All
            </button>
            <button
              type="button"
              className={gapsOnly ? styles.filterActive : styles.filterButton}
              onClick={() => setFilter(true)}
              aria-pressed={gapsOnly}
            >
              Gaps only
            </button>
          </div>
        }
      />

      <section className={`${shared.usageSection} ${styles.list}`}>
        {isLoading ? (
          <p className={shared.emptyRow}>Loading...</p>
        ) : retrievals.length === 0 ? (
          <EmptyState
            icon={SearchX}
            message={
              gapsOnly
                ? "No zero-result queries — the corpus answered every search."
                : "No retrievals yet."
            }
          />
        ) : (
          <ul className={styles.rows}>
            {retrievals.map((r) => (
              <RetrievalItem key={r.id} retrieval={r} />
            ))}
          </ul>
        )}

        {total > 0 && (
          <div className={styles.pager} aria-busy={isPlaceholderData}>
            <span className={styles.pagerRange}>
              {firstRow}–{lastRow} of {total}
            </span>
            <div className={styles.pagerControls}>
              <button
                type="button"
                className={styles.pagerButton}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <span className={styles.pagerPage}>
                Page {page + 1} of {pageCount}
              </span>
              <button
                type="button"
                className={styles.pagerButton}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                aria-label="Next page"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

const SUBTITLE = "What your crew searched for, and how each result ranked.";

/**
 * One Retrieval as a table row — icon · query · repo · user · result count ·
 * converted · time. Non-gap rows expand to the score-breakdown matrix; a
 * zero-result query shows a `0` count, a red icon, and does not expand.
 */
function RetrievalItem({ retrieval }: { retrieval: RetrievalRow }) {
  const [open, setOpen] = useState(false);
  const gap = retrieval.resultCount === 0;

  // The leading icon doubles as the outcome: a converted search (a returned
  // Post was later confirmed) shows the confirm check, a zero-result search the
  // red no-results glyph, everything else a plain search.
  const { Icon, tone, iconLabel } = gap
    ? { Icon: SearchX, tone: shared.toneRed, iconLabel: "No results" }
    : retrieval.converted
      ? {
          Icon: CheckCircle2,
          tone: shared.toneGreen,
          iconLabel: "Converted — a returned Post was later confirmed",
        }
      : { Icon: Search, tone: shared.toneBlue, iconLabel: undefined };

  const row = (
    <>
      <span className={`${styles.rowIcon} ${tone}`}>
        <Icon size={15} aria-label={iconLabel} aria-hidden={iconLabel ? undefined : true} />
      </span>
      <span className={`${styles.cell} ${styles.count}`}>
        {retrieval.resultCount}
      </span>
      <span className={styles.query}>
        <span className={styles.queryText}>{retrieval.situation}</span>
        {retrieval.repo && (
          <>
            <span className={styles.sep}>/</span>
            <span className={styles.project} title={retrieval.repo}>
              {repoSlug(retrieval.repo)}
            </span>
          </>
        )}
      </span>
      <span className={`${styles.cell} ${styles.muted}`}>
        {retrieval.user ?? "—"}
      </span>
      <time
        className={`${styles.cell} ${styles.muted}`}
        dateTime={new Date(retrieval.createdAt).toISOString()}
        title={fullDateTime(retrieval.createdAt)}
      >
        {relativeTime(retrieval.createdAt)}
      </time>
      {gap ? (
        <span className={styles.chevSpace} />
      ) : (
        <ChevronDown
          size={16}
          className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
          aria-hidden="true"
        />
      )}
    </>
  );

  return (
    <li className={styles.row}>
      {gap ? (
        <div className={styles.rowHeader}>{row}</div>
      ) : (
        <button
          type="button"
          className={styles.rowHeader}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          {row}
        </button>
      )}
      {open && !gap && <ResultMatrix results={retrieval.results} />}
    </li>
  );
}

/**
 * The expanded ranking detail: a heatmap matrix of returned Posts × score
 * factors. Each factor cell is tinted green where it boosted the ranking and red
 * where it dragged it down, so a row's outcome reads at a glance; the final
 * column carries a proportional bar.
 */
function ResultMatrix({ results }: { results: RetrievalResultRow[] }) {
  const maxRrf = Math.max(...results.map((r) => r.rrfScore), 0);
  const maxFinal = Math.max(...results.map((r) => r.final), 0);

  return (
    <div className={styles.breakdown}>
      <table className={styles.matrix}>
        <thead>
          <tr>
            <th className={styles.mPost}>Post</th>
            <th title="Text + semantic search relevance, before adjustments (reciprocal-rank fusion).">
              Match
            </th>
            <th title="Multiplier from this Post's confirms and flags; ×1 is neutral.">
              Trust
            </th>
            <th title="Recency decay, 30-day half-life: 100% is new, 50% is ~30 days old.">
              Fresh
            </th>
            <th title="×1.5 when the Post is from the same repo the agent queried from.">
              Repo
            </th>
            <th className={styles.mFinal}>Final</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={`${r.postId}-${r.rank}`}>
              <td className={styles.mPost}>
                <span className={styles.mRank}>#{r.rank}</span>
                {r.postTitle ?? (
                  <em className={styles.retired} title={`Post ${r.postId}`}>
                    retired post
                  </em>
                )}
                {r.confirmed && (
                  <CheckCircle2
                    size={13}
                    className={styles.confirmedMark}
                    aria-label="Confirmed by the querying user"
                  />
                )}
              </td>
              <td style={heat(rel(r.rrfScore, maxRrf) / 100, 0.5)}>
                {fmt(r.rrfScore)}
              </td>
              <td style={heatMult(r.trust)}>×{r.trust.toFixed(2)}</td>
              <td style={heat(r.recency, 0.7)}>{Math.round(r.recency * 100)}%</td>
              <td style={heatMult(r.repoBoost)}>
                {r.repoBoost > 1 ? `×${r.repoBoost}` : "—"}
              </td>
              <td className={styles.mFinal}>
                <span className={styles.mFinalBar} aria-hidden="true">
                  <i style={{ width: `${rel(r.final, maxFinal)}%` }} />
                </span>
                {fmt(r.final)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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

/** Compact score: 3 significant figures, dropping a trailing exponent for tiny values. */
function fmt(n: number): string {
  if (n === 0) return "0";
  return n < 0.001 ? n.toExponential(1) : n.toPrecision(3);
}

/** `value` as a percentage of `max`, clamped 0–100. */
function rel(value: number, max: number): number {
  return max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
}

/** Heat tint for a 0–1 value: green above `neutral`, red below. */
function heat(value: number, neutral: number): React.CSSProperties {
  const d = value - neutral;
  const a = Math.min(0.28, Math.abs(d) * 0.5);
  return { background: d >= 0 ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})` };
}

/** Heat tint for a multiplier centred on 1.0. */
function heatMult(factor: number): React.CSSProperties {
  const d = factor - 1;
  const a = Math.min(0.28, Math.abs(d) * 0.45);
  return { background: d >= 0 ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})` };
}

function describe(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Admin role required.";
    return `Request failed (${err.status}).`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
