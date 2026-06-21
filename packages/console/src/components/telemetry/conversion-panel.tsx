import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";
import {
  telemetryKeys,
  type ConversionPanelData,
  type ConversionPoint,
} from "./telemetry-data";
import styles from "./telemetry.module.scss";

/**
 * The Query→Confirm conversion panel: of the Retrievals that returned ≥1 result
 * over the range, the fraction the PLO-48 attribution helper classifies as
 * converted, plus a per-day trend. All figures come from the server's
 * `conversionStats` reads (one for the headline, one per day for the trend) —
 * this panel is presentation over the helper's output, not its own join.
 */
export function ConversionPanel() {
  const { data, error } = useQuery({
    queryKey: telemetryKeys.conversion,
    queryFn: () =>
      apiFetch<ConversionPanelData>("/api/telemetry/conversion"),
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

  if (data.withResults === 0) {
    return <p className={styles.muted}>No retrievals with results yet.</p>;
  }

  return (
    <div className={styles.conversion}>
      <div className={styles.headline}>
        <span className={styles.rate}>{formatRate(data.converted, data.withResults)}</span>
        <span className={styles.fraction}>
          {data.converted} of {data.withResults} retrievals with results
        </span>
      </div>
      <Sparkline points={data.trend} />
      <p className={styles.trendCaption}>
        Per-day conversion over the last {data.trend.length} days ·{" "}
        {Math.round(data.windowMs / DAY_MS)}-day attribution window
      </p>
    </div>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A retrieval-with-results count to its conversion rate in `[0, 1]`, or null when empty. */
function rateOf(point: ConversionPoint): number | null {
  return point.withResults === 0 ? null : point.converted / point.withResults;
}

/** A rate as a whole-number percent; em dash when the denominator is zero. */
function formatRate(converted: number, withResults: number): string {
  if (withResults === 0) return "—";
  return `${Math.round((converted / withResults) * 100)}%`;
}

// Rate is in [0, 1]; invert for SVG's top-left origin so higher rate sits higher.
function sparkY(rate: number): number {
  return (1 - rate) * 100;
}

/**
 * A minimal inline-SVG sparkline of the per-day conversion rate. Days with no
 * retrievals-with-results (rate null) break the line into segments so a gap
 * reads as "no data", not "0%". Drawn in a unit viewBox and scaled to fit, so
 * it stays dependency-free and crisp at any width.
 */
function Sparkline({ points }: { points: ConversionPoint[] }) {
  if (points.length < 2) return null;

  const lastIndex = points.length - 1;
  const x = (i: number) => (i / lastIndex) * 100;

  // Build line segments, breaking on null (no-data) days.
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

  // A filled area under the longest continuous run, for a touch of weight.
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
      aria-label="Per-day conversion rate trend"
    >
      {area && <path className={styles.sparkArea} d={area} />}
      {segments.map((seg, i) => (
        <polyline key={i} className={styles.sparkLine} points={seg} />
      ))}
    </svg>
  );
}
