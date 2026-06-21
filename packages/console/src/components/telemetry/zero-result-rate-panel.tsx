import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";
import {
  telemetryKeys,
  type CoveragePanelData,
  type CoveragePoint,
} from "./telemetry-data";
import styles from "./telemetry.module.scss";

/**
 * The zero-result-rate panel: of all Retrievals over the range, the fraction
 * that returned nothing (`result_count = 0`) — the coverage gap, tracked apart
 * from conversion. A headline rate plus a per-day sparkline. Every figure comes
 * from the server's `coverageStats` reads (one for the headline, one per day for
 * the trend); this panel is presentation over that payload, not its own query.
 * Shares the `/coverage` fetch with the query-volume panel (TanStack Query
 * dedupes on the key).
 */
export function ZeroResultRatePanel() {
  const { data, error } = useQuery({
    queryKey: telemetryKeys.coverage,
    queryFn: () => apiFetch<CoveragePanelData>("/api/telemetry/coverage"),
  });

  if (error) {
    return (
      <p className={styles.error} role="alert">
        {error instanceof Error ? error.message : "Something went wrong."}
      </p>
    );
  }

  if (!data) {
    return <p className={styles.muted}>Loading…</p>;
  }

  if (data.total === 0) {
    return <p className={styles.muted}>No retrievals yet.</p>;
  }

  return (
    <div className={styles.conversion}>
      <div className={styles.headline}>
        <span className={styles.rate}>{formatRate(data.zeroResults, data.total)}</span>
        <span className={styles.fraction}>
          {data.zeroResults} of {data.total} retrievals returned nothing
        </span>
      </div>
      <Sparkline points={data.trend} />
      <p className={styles.trendCaption}>
        Per-day zero-result rate over the last {data.trend.length} days
      </p>
    </div>
  );
}

/** A day's total to its zero-result rate in `[0, 1]`, or null when no queries ran. */
function rateOf(point: CoveragePoint): number | null {
  return point.total === 0 ? null : point.zeroResults / point.total;
}

/** A rate as a whole-number percent; em dash when the denominator is zero. */
function formatRate(zeroResults: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((zeroResults / total) * 100)}%`;
}

// Rate is in [0, 1]; invert for SVG's top-left origin so a higher rate sits higher.
function sparkY(rate: number): number {
  return (1 - rate) * 100;
}

/**
 * A minimal inline-SVG sparkline of the per-day zero-result rate. Days with no
 * retrievals (rate null) break the line into segments so a gap reads as "no
 * data", not "0%". Drawn in a unit viewBox and scaled to fit — dependency-free
 * and crisp at any width, matching the conversion panel's sparkline.
 */
function Sparkline({ points }: { points: CoveragePoint[] }) {
  if (points.length < 2) return null;

  const lastIndex = points.length - 1;
  const x = (i: number) => (i / lastIndex) * 100;

  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((p, i) => {
    const rate = rateOf(p);
    if (rate === null) {
      if (current.length > 0) {
        segments.push(current.join(" "));
        current = [];
      }
      return;
    }
    current.push(`${x(i).toFixed(2)},${sparkY(rate).toFixed(2)}`);
  });
  if (current.length > 0) segments.push(current.join(" "));

  const area =
    segments.length === 1
      ? `M ${segments[0]!.split(" ")[0]} L ${segments[0]} L ${x(lastIndex).toFixed(2)},100 L 0,100 Z`
      : null;

  return (
    <svg
      className={styles.sparkline}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label="Per-day zero-result rate trend"
    >
      {area && <path className={styles.sparkArea} d={area} />}
      {segments.map((seg, i) => (
        <polyline key={i} className={styles.sparkLine} points={seg} />
      ))}
    </svg>
  );
}
