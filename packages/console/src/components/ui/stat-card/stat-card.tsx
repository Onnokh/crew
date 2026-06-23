import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import styles from "./stat-card.module.scss";

/** Period-over-period change for a stat card. `invert` flips the colour (more is worse). */
export type StatDelta = { value: number; invert?: boolean; suffix?: string };

/** The data behind one stat-overview card, shared by the dashboard surfaces. */
export type StatDatum = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Tinted icon-badge tone, layered over the badge (a caller-provided `tone*` class). */
  tone: string | undefined;
  /** Pre-formatted display value, e.g. "86" or "67%". */
  value: string;
  /** Optional smaller, muted text trailing the value, e.g. " / 142". */
  valueSuffix?: string;
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
function StatCard({ stat }: { stat: StatDatum }) {
  const { icon: Icon, label, value, valueSuffix, delta, tone } = stat;
  return (
    <div className={styles.statCard}>
      <span className={styles.statCardHead}>
        <span className={`${styles.iconBadge} ${tone ?? ""}`}>
          <Icon size={15} aria-hidden="true" />
        </span>
        <span>{label}</span>
      </span>
      <span className={styles.statCardBody}>
        <span className={styles.statCardValue}>
          {value}
          {valueSuffix && (
            <span className={styles.statCardValueSuffix}>{valueSuffix}</span>
          )}
        </span>
        {delta && (
          <MetricDelta value={delta.value} invert={delta.invert} suffix={delta.suffix} />
        )}
      </span>
    </div>
  );
}


/** A signed ±N change vs the previous period as a coloured pill with an arrow. */
function MetricDelta({
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
