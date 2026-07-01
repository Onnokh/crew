import { FolderGit2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { useLegendsData } from "../../../hooks/use-legends-data";
import { HallOfLegends } from "../../hall-of-legends/hall-of-legends";
import { EmptyState } from "../../ui/empty-state/empty-state";
import { PageHeading } from "../../ui/page-heading/page-heading";
import shared from "../../../styles/dashboard.module.scss";
import styles from "./legends-page.module.scss";

// Reuse the admin dashboard's posts-by-project donut. Code-split so the heavy
// recharts bundle only loads once a member opens this page.
const ProjectsPieChart = lazy(() =>
  import("../team-detail-dashboard/team-charts").then((m) => ({
    default: m.ProjectsPieChart,
  })),
);

/** Slice palette, cycled by index — mirrors the team-detail dashboard. */
const CHART_COLORS = [
  "#5b9bd5",
  "#6fc7ae",
  "#f0ad6d",
  "#b08be8",
  "#e8849f",
  "#7ac2b8",
  "#d7a55e",
  "#8898d6",
] as const;

/**
 * The member-facing Hall of Legends page (`/legends`), reachable by any signed-in
 * User via the app-chrome menu (the `_authed` guard redirects anonymous visitors
 * to `/login`). It celebrates the Team's busiest members on the podium, then
 * breaks down where the Team's knowledge lives with a posts-per-project chart.
 */
export function LegendsPage() {
  const { data, isLoading } = useLegendsData();

  // Reshape the repo counts into pie slices: the last path segment is the label,
  // the full repo path stays in the tooltip and legend title.
  const projects = (data?.projects ?? []).map((p) => ({
    repo: p.repo,
    label: repoLabel(p.repo),
    posts: p.posts,
  }));

  return (
    <section className={shared.usagePage}>
      <PageHeading
        title="Hall of Legends"
        subtitle="The legends keeping your crew moving. Take a bow."
      />

      <section className={shared.usageSection}>
        <div className={shared.sectionHeading}>
          <h2>Top members</h2>
          <span className={shared.sectionCaption}>Last 30 days</span>
        </div>
        <HallOfLegends users={data?.users ?? []} loading={isLoading} />
      </section>

      <section className={shared.usageSection}>
        <h2>Posts per project</h2>
        {isLoading ? (
          <p className={shared.emptyRow}>Loading...</p>
        ) : projects.length === 0 ? (
          <EmptyState icon={FolderGit2} message="No posts yet." />
        ) : (
          <div className={styles.pieRow}>
            <div className={styles.chartBody}>
              <Suspense
                fallback={<p className={shared.emptyRow}>Loading...</p>}
              >
                <ProjectsPieChart data={projects} colors={CHART_COLORS} />
              </Suspense>
            </div>
            <ol className={styles.pieLegend}>
              {projects.map((p, i) => (
                <li key={p.repo}>
                  <i
                    style={{
                      background: CHART_COLORS[i % CHART_COLORS.length],
                    }}
                  />
                  <span className={styles.pieLegendName} title={p.repo}>
                    {p.label}
                  </span>
                  <span className={styles.pieLegendValue}>{p.posts}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </section>
  );
}

/** A repo path renders as its last segment; the full path stays in the tooltip. */
function repoLabel(repo: string): string {
  const parts = repo.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? repo;
}
