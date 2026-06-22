import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import styles from "../../routes/_authed/admin.module.scss";

/** Period-over-period change for a stat card. `invert` flips the colour (more is worse). */
export type StatDelta = { value: number; invert?: boolean; suffix?: string };

/** The data behind one stat-overview card, shared by the dashboard surfaces. */
export type StatDatum = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Tinted icon-badge tone, matching the events feed (a `styles.tone*` class). */
  tone: string | undefined;
  /** Pre-formatted display value, e.g. "86" or "67%". */
  value: string;
  delta?: StatDelta;
};

/** A row of {@link StatCard}s. */
export function StatCardGrid({ stats }: { stats: StatDatum[] }) {
  return (
    <div className={styles.statCardGrid}>
      {stats.map((stat) => (
        <StatCard key={stat.key} stat={stat} />
      ))}
    </div>
  );
}

/** One stat card: tinted icon + label, big value, and an optional delta pill. */
export function StatCard({ stat }: { stat: StatDatum }) {
  const { icon: Icon, label, value, delta, tone } = stat;
  return (
    <div className={styles.statCard}>
      <span className={styles.statCardHead}>
        <span className={`${styles.eventIcon} ${tone ?? ""}`}>
          <Icon size={15} aria-hidden="true" />
        </span>
        <span>{label}</span>
      </span>
      <span className={styles.statCardBody}>
        <span className={styles.statCardValue}>{value}</span>
        {delta && (
          <MetricDelta value={delta.value} invert={delta.invert} suffix={delta.suffix} />
        )}
      </span>
    </div>
  );
}

/** A signed ±N change vs the previous period as a coloured pill with an arrow. */
export function MetricDelta({
  value,
  invert,
  suffix = "",
}: {
  value: number;
  invert?: boolean;
  suffix?: string;
}) {
  if (value === 0) {
    return <span className={`${styles.statDelta} ${styles.deltaFlat}`}>±0{suffix}</span>;
  }
  const good = value > 0 !== Boolean(invert);
  const Arrow = value > 0 ? ArrowUp : ArrowDown;
  const sign = value > 0 ? "+" : "-";
  return (
    <span className={`${styles.statDelta} ${good ? styles.deltaUp : styles.deltaDown}`}>
      {sign}
      {Math.abs(value)}
      {suffix}
      <Arrow size={13} aria-hidden="true" />
    </span>
  );
}

/** A part/whole as an integer percentage (0 when the whole is 0). */
export function ratePct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}
