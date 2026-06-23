import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./team-detail-dashboard.module.scss";

/**
 * The recharts-backed charts for the team-detail dashboard, in their own module so
 * the heavy recharts bundle is code-split: the dashboard {@link React.lazy}-loads
 * this file, keeping recharts out of the main route chunk until a chart renders.
 */

const CHART_MARGIN = { top: 12, right: 20, bottom: 24, left: 8 };

/** One Projects pie slice: repo path, display label, and post count. */
export type ProjectSlice = { repo: string; label: string; posts: number };

/** One member-usage bar: member name with their post and search counts. */
export type MemberUsagePoint = {
  name: string | null;
  posts: number;
  searches: number;
};

/** Donut of posts-by-project; `colors` is cycled by slice index (legend reuses it). */
export function ProjectsPieChart({
  data,
  colors,
}: {
  data: ProjectSlice[];
  colors: readonly string[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="posts"
          nameKey="label"
          cx="50%"
          // Pull the donut up to sit over the bar chart's plot area,
          // which reserves ~88px at the bottom for its angled labels.
          cy="42%"
          innerRadius={62}
          outerRadius={112}
          paddingAngle={2}
          stroke="var(--color-bg)"
          strokeWidth={2}
        >
          {data.map((p, i) => (
            <Cell key={p.repo} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip content={<ProjectTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Stacked posts+searches bar per member, busiest first. */
export function MemberUsageBarChart({ data }: { data: MemberUsagePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} accessibilityLayer margin={CHART_MARGIN}>
        <CartesianGrid stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          tickMargin={10}
          height={64}
          interval={0}
          angle={-35}
          textAnchor="end"
          tickFormatter={shortName}
        />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
        <Tooltip
          content={<MemberTooltip />}
          cursor={{ fill: "var(--color-border)", opacity: 0.4 }}
        />
        <Bar dataKey="posts" name="Posts" stackId="usage" fill="#5b9bd5" maxBarSize={48} />
        <Bar
          dataKey="searches"
          name="Searches"
          stackId="usage"
          fill="#6fc7ae"
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** First name / local-part of a member label, for the angled x-axis ticks. */
function shortName(name: string): string {
  const base = name.includes("@") ? (name.split("@")[0] ?? name) : name;
  return base.split(/\s+/)[0] ?? base;
}

/** Tooltip for a Projects pie slice: full repo path and its post count. */
function ProjectTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { repo?: string }; value?: number }>;
}) {
  const item = payload?.[0];
  if (!active || !item) return null;
  return (
    <div className={styles.chartTooltip}>
      <strong>{item.payload?.repo}</strong>
      <span>
        {item.value} {item.value === 1 ? "post" : "posts"}
      </span>
    </div>
  );
}

/** Tooltip for a member's usage bar: posts, searches, and their total. */
function MemberTooltip({
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
    <div className={styles.chartTooltip}>
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.name}>
          <i style={{ background: item.color }} />
          {item.name}: {item.value}
        </span>
      ))}
      <span>Total: {total}</span>
    </div>
  );
}
