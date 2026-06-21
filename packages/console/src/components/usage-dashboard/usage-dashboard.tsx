import * as Select from "@radix-ui/react-select";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Flag,
  Search,
  SearchX,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ApiError, apiFetch } from "../../api/client";
import {
  telemetryKeys,
  type ActivityItem,
  type ConversionPanelData,
  type CoveragePanelData,
  type PostsCreatedPanelData,
} from "../telemetry/telemetry-data";
import styles from "../../routes/_authed/admin.module.scss";

const CHART_MARGIN = { top: 12, right: 20, bottom: 24, left: 8 };
const SHORT_DATE = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const SHORT_TIME = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export default function UsageDashboard() {
  const [period, setPeriod] = useState<Period>("7d");
  // `to` is pinned at selection time; changing the period refetches every panel.
  const range = useMemo(() => periodRange(period), [period]);
  const qs = `?from=${range.from}&to=${range.to}`;

  const {
    data: coverageData,
    error: coverageError,
  } = useQuery({
    queryKey: [...telemetryKeys.coverage, period],
    queryFn: () => apiFetch<CoveragePanelData>(`/api/telemetry/coverage${qs}`),
  });
  const {
    data: conversionData,
    error: conversionError,
  } = useQuery({
    queryKey: [...telemetryKeys.conversion, period],
    queryFn: () => apiFetch<ConversionPanelData>(`/api/telemetry/conversion${qs}`),
  });
  const {
    data: postsData,
    error: postsError,
  } = useQuery({
    queryKey: [...telemetryKeys.posts, period],
    queryFn: () => apiFetch<PostsCreatedPanelData>(`/api/telemetry/posts${qs}`),
  });
  const {
    data: activityData,
    error: activityError,
    isLoading: activityLoading,
  } = useQuery({
    queryKey: telemetryKeys.activity,
    queryFn: () =>
      apiFetch<{ activity: ActivityItem[] }>("/api/telemetry/activity").then(
        (r) => r.activity,
      ),
  });

  const error = coverageError ?? conversionError ?? postsError ?? activityError;
  if (error) {
    return (
      <p className={styles.error} role="alert">
        {describe(error)}
      </p>
    );
  }

  const hourly = period === "today" || period === "24h";
  // "All time" has no preceding window to compare against, so it shows no delta.
  const showDelta = period !== "all";
  const isLoading = !coverageData || !conversionData;
  const chartData =
    coverageData && conversionData
      ? usageChartData(coverageData, conversionData, hourly)
      : [];
  const postsLoading = !postsData;
  const postsChart = postsData ? postsChartData(postsData, hourly) : [];
  const events = (activityData ?? []).slice(0, 10);

  return (
    <section className={styles.usagePage}>
      <div className={styles.usageToolbar}>
        <PeriodSelect value={period} onChange={setPeriod} />
      </div>
      <UsageSection>
        <div className={styles.statCardGrid}>
          {statRowData(coverageData, conversionData, postsData, showDelta).map((stat) => (
            <StatCard key={stat.key} stat={stat} />
          ))}
        </div>
      </UsageSection>

      <div className={styles.usageChartGrid}>
      <UsageSection title="Searches">
        <section className={styles.usageChart}>
          <div className={styles.usageLegend}>
            <span>
              <i className={styles.legendOrange} />
              No-result searches
            </span>
            <span>
              <i className={styles.legendGreen} />
              Confirmed searches
            </span>
            <span>
              <i className={styles.legendBlue} />
              Unconfirmed searches
            </span>
          </div>
          {isLoading ? (
            <p className={styles.emptyRow}>Loading...</p>
          ) : (
            <ResponsiveContainer width="100%" height={330}>
              <AreaChart data={chartData} accessibilityLayer margin={CHART_MARGIN}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={14}
                  height={42}
                  padding={{ left: 20, right: 20 }}
                />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <Tooltip content={<UsageTooltip />} />
                <Area
                  type="monotone"
                  stackId="searches"
                  dataKey="noResults"
                  name="No-result searches"
                  stroke="#f0ad6d"
                  fill="#f0ad6d"
                  fillOpacity={0.5}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  stackId="searches"
                  dataKey="confirmed"
                  name="Confirmed searches"
                  stroke="#6fc7ae"
                  fill="#6fc7ae"
                  fillOpacity={0.5}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  stackId="searches"
                  dataKey="unconfirmed"
                  name="Unconfirmed searches"
                  stroke="#5b9bd5"
                  fill="#5b9bd5"
                  fillOpacity={0.5}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </section>
      </UsageSection>

      <UsageSection title="Posts created">
        <section className={styles.usageChart}>
          <div className={styles.usageLegend}>
            <span>
              <i className={styles.legendBlue} />
              New posts
            </span>
          </div>
          {postsLoading ? (
            <p className={styles.emptyRow}>Loading...</p>
          ) : (
            <ResponsiveContainer width="100%" height={330}>
              <BarChart data={postsChart} accessibilityLayer margin={CHART_MARGIN}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={14}
                  height={42}
                  padding={{ left: 20, right: 20 }}
                />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <Tooltip content={<UsageTooltip />} cursor={{ fill: "var(--color-border)", opacity: 0.4 }} />
                <Bar
                  dataKey="created"
                  name="New posts"
                  fill="#5b9bd5"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={36}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </UsageSection>
      </div>

      <UsageSection title="Events">
        {activityLoading ? (
          <p className={styles.emptyRow}>Loading...</p>
        ) : events.length === 0 ? (
          <p className={styles.emptyRow}>No events yet.</p>
        ) : (
          <ul className={styles.usageEvents}>
            {events.map((event) => (
              <UsageEvent key={event.id} event={event} />
            ))}
          </ul>
        )}
      </UsageSection>
    </section>
  );
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "Last 24 hours" },
  { value: "this-week", label: "This week" },
  { value: "7d", label: "Last 7 days" },
  { value: "this-month", label: "This month" },
  { value: "30d", label: "Last 30 days" },
  { value: "this-year", label: "This year" },
  { value: "all", label: "All time" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

/** Resolve a period to a `[from, to)` range in unix ms. "all" sends from=0 (the server clamps it). */
function periodRange(period: Period): { from: number; to: number } {
  const now = new Date();
  const to = now.getTime();
  switch (period) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return { from: d.getTime(), to };
    }
    case "24h":
      return { from: to - 24 * HOUR, to };
    case "this-week": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
      return { from: d.getTime(), to };
    }
    case "7d":
      return { from: to - 7 * DAY, to };
    case "this-month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to };
    case "30d":
      return { from: to - 30 * DAY, to };
    case "this-year":
      return { from: new Date(now.getFullYear(), 0, 1).getTime(), to };
    case "all":
      return { from: 0, to };
  }
}

function PeriodSelect({
  value,
  onChange,
}: {
  value: Period;
  onChange: (value: Period) => void;
}) {
  return (
    <Select.Root value={value} onValueChange={(v) => onChange(v as Period)}>
      <Select.Trigger className={styles.periodTrigger} aria-label="Time period">
        <Select.Value />
        <Select.Icon>
          <ChevronDown size={16} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className={styles.periodContent}
          position="popper"
          sideOffset={6}
          align="end"
        >
          <Select.Viewport>
            {PERIODS.map((p) => (
              <Select.Item key={p.value} value={p.value} className={styles.periodItem}>
                <Select.ItemText>{p.label}</Select.ItemText>
                <Select.ItemIndicator className={styles.periodCheck}>
                  <Check size={15} aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function UsageSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.usageSection}>
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}

type StatDatum = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Tinted icon-badge tone, matching the events feed (a `styles.tone*` class). */
  tone: string | undefined;
  /** Pre-formatted display value, e.g. "86" or "67%". */
  value: string;
  /** Period-over-period change. `invert` flips the colour (more is worse). */
  delta?: { value: number; invert?: boolean; suffix?: string };
};

/** Assemble the four stat-overview cards from the loaded panel data. */
function statRowData(
  coverage: CoveragePanelData | undefined,
  conversion: ConversionPanelData | undefined,
  posts: PostsCreatedPanelData | undefined,
  showDelta: boolean,
): StatDatum[] {
  return [
    {
      key: "searches",
      label: "Searches",
      icon: Search,
      tone: styles.toneBlue,
      value: coverage ? String(coverage.total) : "...",
      delta:
        showDelta && coverage
          ? { value: coverage.total - coverage.previousTotal }
          : undefined,
    },
    {
      key: "confirmed",
      label: "Confirmed",
      icon: CheckCircle2,
      tone: styles.toneGreen,
      value: conversion
        ? `${ratePct(conversion.converted, conversion.withResults)}%`
        : "...",
      delta:
        showDelta && conversion
          ? {
              value:
                ratePct(conversion.converted, conversion.withResults) -
                ratePct(conversion.previousConverted, conversion.previousWithResults),
              suffix: "%",
            }
          : undefined,
    },
    {
      key: "zero",
      label: "Zero-results",
      icon: Ban,
      tone: styles.toneRed,
      value: coverage ? `${ratePct(coverage.zeroResults, coverage.total)}%` : "...",
      delta:
        showDelta && coverage
          ? {
              value:
                ratePct(coverage.zeroResults, coverage.total) -
                ratePct(coverage.previousZeroResults, coverage.previousTotal),
              invert: true,
              suffix: "%",
            }
          : undefined,
    },
    {
      key: "posts",
      label: "Posts",
      icon: FileText,
      tone: styles.tonePink,
      value: posts ? String(posts.total) : "...",
      delta:
        showDelta && posts
          ? { value: posts.total - posts.previousCreated }
          : undefined,
    },
  ];
}

/** One stat card: icon + label, big value, and a period-over-period delta pill. */
function StatCard({ stat }: { stat: StatDatum }) {
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
        {delta && <MetricDelta value={delta.value} invert={delta.invert} suffix={delta.suffix} />}
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

/** A part/whole as an integer percentage (0 when the whole is 0). */
function ratePct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

function UsageEvent({ event }: { event: ActivityItem }) {
  const { action, icon: Icon, tone } = eventStyle(event);
  const count =
    event.kind === "search" && event.resultCount !== null && event.resultCount > 0;

  return (
    <li className={styles.usageEvent}>
      <span className={`${styles.eventIcon} ${tone}`}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className={styles.eventText}>
        {event.user ? (
          <>
            <span className={styles.eventVerb}>{event.user}</span> {action} {event.subject}
          </>
        ) : (
          <>
            <span className={styles.eventVerb}>{capitalize(action)}</span> {event.subject}
          </>
        )}
        {count && (
          <span className={styles.eventCount}>
            {" "}
            ({event.resultCount} {event.resultCount === 1 ? "result" : "results"})
          </span>
        )}
      </span>
      <time className={styles.eventMeta}>{relativeTime(event.createdAt)}</time>
    </li>
  );
}

/** The verb phrase, icon, and tinted-icon tone for one activity item. */
function eventStyle(event: ActivityItem): {
  action: string;
  icon: LucideIcon;
  tone: string | undefined;
} {
  switch (event.kind) {
    case "post":
      return { action: "posted", icon: FileText, tone: styles.tonePink };
    case "confirm":
      return { action: "confirmed", icon: CheckCircle2, tone: styles.toneGreen };
    case "flag":
      return {
        action: event.reason ? `flagged (${event.reason})` : "flagged",
        icon: Flag,
        tone: styles.toneOrange,
      };
    default:
      return event.resultCount === 0
        ? { action: "got no results for", icon: SearchX, tone: styles.toneRed }
        : { action: "searched for", icon: Search, tone: styles.toneBlue };
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function UsageTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, item) => sum + (item.value ?? 0), 0);
  return (
    <div className={styles.usageTooltip}>
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.name}>
          <i style={{ background: item.color }} />
          {item.name}: {item.value}
        </span>
      ))}
      {payload.length > 1 && <span>Total searches: {total}</span>}
    </div>
  );
}

function usageChartData(
  coverage: CoveragePanelData,
  conversion: ConversionPanelData,
  hourly: boolean,
) {
  return coverage.trend.map((point, index) => {
    const noResults = point.zeroResults;
    const confirmed = conversion.trend[index]?.converted ?? 0;
    // The three segments stack to the day's total searches:
    // noResults + confirmed + unconfirmed.
    const unconfirmed = Math.max(0, point.total - noResults - confirmed);
    return {
      label: bucketLabel(point.from, hourly),
      noResults,
      confirmed,
      unconfirmed,
    };
  });
}

function postsChartData(posts: PostsCreatedPanelData, hourly: boolean) {
  return posts.trend.map((point) => ({
    label: bucketLabel(point.from, hourly),
    created: point.created,
  }));
}


function shortDate(timestamp: number): string {
  return SHORT_DATE.format(new Date(timestamp));
}

/** Axis label for a trend bucket: clock time for hourly (Today/24h) views, else a short date. */
function bucketLabel(timestamp: number, hourly: boolean): string {
  return hourly ? SHORT_TIME.format(new Date(timestamp)) : shortDate(timestamp);
}

/** Compact "just now / 5m / 3h / 2d" relative to now; falls back to a short date past a week. */
function relativeTime(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return shortDate(timestamp);
}

function describe(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Admin role required.";
    return `Request failed (${err.status}).`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
