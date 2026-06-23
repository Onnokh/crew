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
import styles from "./usage-dashboard.module.scss";

/**
 * The recharts-backed charts for the usage dashboard, in their own module so the
 * heavy recharts bundle is code-split: the dashboard {@link React.lazy}-loads this
 * file, keeping recharts out of the main route chunk until a chart actually renders.
 */

const CHART_MARGIN = { top: 12, right: 20, bottom: 24, left: 8 };

/** One point on the stacked Searches area chart. */
export type SearchesPoint = {
  label: string;
  noResults: number;
  confirmed: number;
  unconfirmed: number;
};

/** One point on the Posts-created bar chart. */
export type PostsPoint = { label: string; created: number };

/** Stacked Searches area chart (zero-results / confirmed / unconfirmed). */
export function SearchesAreaChart({ data }: { data: SearchesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={330}>
      <AreaChart data={data} accessibilityLayer margin={CHART_MARGIN}>
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
          name="Zero-results"
          stroke="#f0ad6d"
          fill="#f0ad6d"
          fillOpacity={0.5}
          strokeWidth={2}
        />
        <Area
          type="monotone"
          stackId="searches"
          dataKey="confirmed"
          name="Confirmed"
          stroke="#6fc7ae"
          fill="#6fc7ae"
          fillOpacity={0.5}
          strokeWidth={2}
        />
        <Area
          type="monotone"
          stackId="searches"
          dataKey="unconfirmed"
          name="Unconfirmed"
          stroke="#5b9bd5"
          fill="#5b9bd5"
          fillOpacity={0.5}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** New-posts-per-bucket bar chart. */
export function PostsBarChart({ data }: { data: PostsPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={330}>
      <BarChart data={data} accessibilityLayer margin={CHART_MARGIN}>
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
        <Tooltip
          content={<UsageTooltip />}
          cursor={{ fill: "var(--color-border)", opacity: 0.4 }}
        />
        <Bar
          dataKey="created"
          name="New posts"
          fill="#5b9bd5"
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
        />
      </BarChart>
    </ResponsiveContainer>
  );
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
