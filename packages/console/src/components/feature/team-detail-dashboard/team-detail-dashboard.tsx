import { useQuery } from "@tanstack/react-query";
import { BarChart3, FolderGit2, Gauge, HardDrive, ScrollText, Users } from "lucide-react";
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
import { apiFetch } from "../../../api/client";
import { relativeTime } from "../../../lib/format";
import { CopyBox } from "../../ui/copy-box/copy-box";
import {
  type ActivityItem,
  type ProjectPostCount,
  type UserUsageItem,
} from "../../telemetry/telemetry-data";
import { ActivityFeed } from "../../activity-feed/activity-feed";
import { AddMemberDialog } from "../../dialogs/add-member-dialog/add-member-dialog";
import { EditMemberDialog, type ApiKey } from "../../dialogs/edit-member-dialog/edit-member-dialog";
import { EmptyState } from "../../ui/empty-state/empty-state";
import { PageHeading } from "../../ui/page-heading/page-heading";
import { UserAvatar } from "../../ui/user-avatar/user-avatar";
import { TeamSettingsDialog } from "../../dialogs/team-settings-dialog/team-settings-dialog";
import shared from "../../../styles/dashboard.module.scss";
import styles from "./team-detail-dashboard.module.scss";

/** Human-readable byte size (e.g. `1.4 MB`), with a 0 fallback while loading. */
function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

type Member = {
  id: string;
  email: string;
  name: string | null;
  keys: ApiKey[];
};

/** A member joined to their corpus usage, used for the Members list rows. */
type MemberRow = UserUsageItem & { email: string; keys: ApiKey[] };

/** Server payload for the single-Team overview. */
type TeamOverview = {
  users: UserUsageItem[];
  activity: ActivityItem[];
  projects: ProjectPostCount[];
  /** On-disk size of this team's corpus DB, in bytes. */
  dbSizeBytes: number;
};

const CHART_MARGIN = { top: 12, right: 20, bottom: 24, left: 8 };

/** Pie slice / member-bar palette, cycled by index (mirrors the usage dashboard). */
const CHART_COLORS = [
  "#5b9bd5",
  "#6fc7ae",
  "#f0ad6d",
  "#b08be8",
  "#e8849f",
  "#7ac2b8",
  "#d7a55e",
  "#8898d6",
];

/** A repo path renders as its last segment; the full path stays in the tooltip. */
function repoLabel(repo: string): string {
  const parts = repo.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? repo;
}

/** Member-bar axis tick: first word (or the email's local part) keeps labels short. */
function shortName(name: string): string {
  const base = name.includes("@") ? (name.split("@")[0] ?? name) : name;
  return base.split(/\s+/)[0] ?? base;
}

/**
 * The team detail page (`/dashboard/teams/$teamId`): a bold heading with team
 * settings, a Members list (each row opens an Edit dialog for the member's
 * details and API keys), and a scoped activity panel. Members come from the
 * control-plane list; usage and the feed from `/api/admin/teams/:id/overview`.
 */
export function TeamDetailDashboard({
  teamId,
  teamName,
  members,
  onRename,
  renaming,
  error,
  onDelete,
  deleting,
  canDelete,
  deleteDisabledReason,
  onAddMember,
  addingMember,
  memberError,
  onRenameMember,
  renamingMember,
  onMintKey,
  mintingKey,
  mintedKey,
  onRevokeKey,
  revokingKey,
  newPassword,
}: {
  teamId: string;
  teamName: string;
  members: Member[];
  onRename: (name: string) => void;
  renaming: boolean;
  error: string | null;
  /** Delete this team (only enabled when {@link canDelete}). */
  onDelete: () => void;
  deleting: boolean;
  canDelete: boolean;
  deleteDisabledReason: string | null;
  onAddMember: (name: string, email: string) => void;
  addingMember: boolean;
  memberError: string | null;
  /** Rename a member (updates their better-auth `name`). */
  onRenameMember: (userId: string, name: string) => void;
  renamingMember: boolean;
  /** Mint a fresh API key for the given member. */
  onMintKey: (userId: string) => void;
  mintingKey: boolean;
  /** Show-once minted key, surfaced inside its member's Edit dialog. */
  mintedKey: { userId: string; key: string } | null;
  /** Revoke a single API key. */
  onRevokeKey: (key: ApiKey) => void;
  revokingKey: boolean;
  /** Show-once password from a just-added member, rendered on their row. */
  newPassword: { userId: string; email: string; password: string } | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "teams", teamId, "overview"],
    queryFn: () => apiFetch<TeamOverview>(`/api/admin/teams/${teamId}/overview`),
  });

  // Filesystem panel: corpus DB size alongside what drives it. Posts is summed
  // across projects; avg/post is the DB size spread over those posts.
  const totalPosts = (data?.projects ?? []).reduce((sum, p) => sum + p.posts, 0);
  const storageStats = [
    { icon: HardDrive, label: "Database size", value: formatBytes(data?.dbSizeBytes ?? 0) },
    { icon: ScrollText, label: "Posts", value: totalPosts.toLocaleString() },
    { icon: FolderGit2, label: "Projects", value: String((data?.projects ?? []).length) },
    {
      icon: Gauge,
      label: "Avg / post",
      value: formatBytes(totalPosts > 0 ? (data?.dbSizeBytes ?? 0) / totalPosts : 0),
    },
  ];

  // Every member, joined to their usage; members with no activity read 0/0.
  const usageById = new Map((data?.users ?? []).map((u) => [u.userId, u]));
  const rows: MemberRow[] = members
    .map((m) => {
      const u = usageById.get(m.id);
      return {
        userId: m.id,
        name: m.name ?? m.email,
        team: u?.team ?? null,
        lastSeen: u?.lastSeen ?? null,
        email: m.email,
        posts: u?.posts ?? 0,
        searches: u?.searches ?? 0,
        total: u?.total ?? 0,
        keys: m.keys,
      };
    })
    .sort((a, b) => b.total - a.total);

  // Pie: Posts grouped by project (repo), busiest first.
  const projects = (data?.projects ?? []).map((p) => ({
    repo: p.repo,
    label: repoLabel(p.repo),
    posts: p.posts,
  }));

  // Bar: each member's posts + searches, busiest first; members with no
  // activity are dropped so the comparison reads cleanly.
  const memberUsage = rows
    .filter((r) => r.total > 0)
    .map((r) => ({ name: r.name, posts: r.posts, searches: r.searches }));

  return (
    <section className={shared.usagePage}>
      <PageHeading
        title={teamName}
        subtitle="Members and recent activity for this team."
        action={
          <TeamSettingsDialog
            teamName={teamName}
            onRename={onRename}
            renaming={renaming}
            error={error}
            onDelete={onDelete}
            deleting={deleting}
            canDelete={canDelete}
            deleteDisabledReason={deleteDisabledReason}
          />
        }
      />

      <div className={styles.chartsGrid}>
        <section className={shared.usageSection}>
          <h2>Projects</h2>
          <p className={styles.chartHint}>Posts by project across this team.</p>
          {isLoading ? (
            <p className={shared.emptyRow}>Loading...</p>
          ) : projects.length === 0 ? (
            <EmptyState icon={FolderGit2} message="No posts yet." />
          ) : (
            <div className={styles.pieRow}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={projects}
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
                    {projects.map((p, i) => (
                      <Cell key={p.repo} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ProjectTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <ul className={styles.pieLegend}>
                {projects.map((p, i) => (
                  <li key={p.repo}>
                    <i style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className={styles.pieLegendName} title={p.repo}>
                      {p.label}
                    </span>
                    <span className={styles.pieLegendValue}>{p.posts}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className={shared.usageSection}>
          <h2>Member usage</h2>
          <p className={styles.chartHint}>Posts and searches per member.</p>
          {isLoading ? (
            <p className={shared.emptyRow}>Loading...</p>
          ) : memberUsage.length === 0 ? (
            <EmptyState icon={BarChart3} message="No activity yet." />
          ) : (
            <div className={styles.chartBody}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={memberUsage} accessibilityLayer margin={CHART_MARGIN}>
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
            </div>
          )}
        </section>
      </div>

      <div className={styles.teamsColumns}>
        <section className={shared.usageSection}>
          <div className={styles.sectionHeader}>
            <h2>Members</h2>
            <AddMemberDialog
              onAdd={onAddMember}
              adding={addingMember}
              error={memberError}
            />
          </div>
          {isLoading && members.length === 0 ? (
            <p className={shared.emptyRow}>Loading...</p>
          ) : rows.length === 0 ? (
            <EmptyState icon={Users} message="No members yet." />
          ) : (
            <ul className={shared.teamList}>
              {rows.map((row) => (
                <li key={row.userId}>
                  <div className={shared.teamRow}>
                    <UserAvatar
                      seed={row.userId}
                      name={row.name}
                      className={shared.teamRowIcon}
                    />
                    <span className={shared.teamRowText}>
                      <span className={shared.teamRowName}>{row.name}</span>
                      <span className={shared.teamRowMeta}>
                        {row.lastSeen
                          ? `Last seen ${relativeTime(row.lastSeen)}`
                          : "No activity yet"}
                      </span>
                    </span>
                    <EditMemberDialog
                      triggerClassName={shared.teamRowEdit}
                      name={row.name ?? row.email}
                      email={row.email}
                      keys={row.keys}
                      onRename={(name) => onRenameMember(row.userId, name)}
                      renaming={renamingMember}
                      onMintKey={() => onMintKey(row.userId)}
                      mintingKey={mintingKey}
                      onRevokeKey={onRevokeKey}
                      revokingKey={revokingKey}
                      mintedKey={
                        mintedKey?.userId === row.userId ? mintedKey.key : null
                      }
                    />
                  </div>
                  {newPassword?.userId === row.userId && (
                    <div className={styles.secretSlot}>
                      <CopyBox label="Password" secret={newPassword.password} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className={styles.teamsSide}>
          <section className={styles.filesystem}>
            <h2 className={styles.teamsActivityTitle}>Filesystem</h2>
            <ul className={styles.fsStatList}>
              {storageStats.map((stat) => (
                <li key={stat.label} className={styles.fsStatRow}>
                  <span className={styles.fsStatIcon}>
                    <stat.icon size={16} aria-hidden="true" />
                  </span>
                  <span className={styles.fsStatLabel}>{stat.label}</span>
                  <span className={styles.fsStatValue}>{isLoading ? "—" : stat.value}</span>
                </li>
              ))}
            </ul>
          </section>

          <aside className={styles.teamsActivity}>
            <h2 className={styles.teamsActivityTitle}>Activity</h2>
            <ActivityFeed
              events={data?.activity ?? []}
              users={data?.users ?? []}
              loading={isLoading}
              empty="No activity yet."
            />
          </aside>
        </div>
      </div>
    </section>
  );
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
