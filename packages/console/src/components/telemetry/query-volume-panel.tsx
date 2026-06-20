import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";
import {
  telemetryKeys,
  type CoveragePanelData,
  type CoveragePoint,
} from "./telemetry-data";
import styles from "./telemetry.module.scss";

/**
 * The query-volume panel: how many Retrievals ran over the range, with a per-day
 * trend. The headline is the range total; the trend is a lightweight bar per day
 * (count of Retrievals that day). Every figure comes from the server's
 * `coverageStats.total` reads — this panel is presentation over the `/coverage`
 * payload it shares with the zero-result-rate panel (TanStack Query dedupes on
 * the key), reading `total` where that panel reads the zero-result fraction.
 */
export function QueryVolumePanel() {
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
        <span className={styles.rate}>{data.total}</span>
        <span className={styles.fraction}>
          {data.total === 1 ? "retrieval" : "retrievals"} over the last{" "}
          {data.trend.length} days
        </span>
      </div>
      <VolumeBars points={data.trend} />
      <p className={styles.trendCaption}>Retrievals per day</p>
    </div>
  );
}

/**
 * A minimal inline-SVG bar chart of per-day query volume. Each day is a bar
 * scaled to the busiest day in the range, so the shape of the trend reads at a
 * glance; an all-zero range renders flat. Dependency-free and crisp at any width,
 * matching the dashboard's quiet visual weight.
 */
function VolumeBars({ points }: { points: CoveragePoint[] }) {
  if (points.length === 0) return null;

  const max = points.reduce((m, p) => Math.max(m, p.total), 0);
  const n = points.length;
  // A small gap between bars; widths in the 0..100 viewBox, scaled to fit.
  const gap = 0.4;
  const barWidth = (100 - gap * (n - 1)) / n;
  const heightOf = (total: number) => (max === 0 ? 0 : (total / max) * 100);

  return (
    <svg
      className={styles.volumeBars}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label="Per-day query volume"
    >
      {points.map((p, i) => {
        const h = heightOf(p.total);
        const x = i * (barWidth + gap);
        return (
          <rect
            key={p.from}
            className={styles.volumeBar}
            x={x.toFixed(2)}
            y={(100 - h).toFixed(2)}
            width={barWidth.toFixed(2)}
            height={h.toFixed(2)}
          />
        );
      })}
    </svg>
  );
}
