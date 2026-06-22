import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2, ChevronRight } from "lucide-react";
import { apiFetch } from "../../../api/client";
import { type TeamOverviewItem } from "../../telemetry/telemetry-data";
import { CreateTeamDialog } from "../../dialogs/create-team-dialog/create-team-dialog";
import { PageHeading } from "../../ui/page-heading/page-heading";
import { AvatarStack, type StackMember } from "../../ui/avatar-stack/avatar-stack";
import shared from "../../../styles/dashboard.module.scss";
import styles from "./teams-dashboard.module.scss";

type TeamRow = { id: string; name: string };
type UserRow = { id: string; name: string | null; teamId: string | null };

/** Server payload for the org-wide Teams overview. */
type TeamsOverview = { teams: TeamOverviewItem[] };

/**
 * The Teams dashboard (`/dashboard/teams`): a bold page heading and an overview
 * list of every Team (post total + member count, each linking to its workspace).
 * Member counts come from the control-plane user list; post totals from
 * `/api/admin/teams/overview`.
 */
export function TeamsDashboard({
  teams,
  users,
  onCreateTeam,
  creatingTeam,
  error,
}: {
  teams: TeamRow[];
  users: UserRow[];
  onCreateTeam: (name: string) => void;
  creatingTeam: boolean;
  error: string | null;
}) {
  const { data } = useQuery({
    queryKey: ["admin", "teams", "overview"],
    queryFn: () => apiFetch<TeamsOverview>("/api/admin/teams/overview"),
  });

  const postsByTeam = new Map((data?.teams ?? []).map((t) => [t.id, t.posts]));
  const membersByTeam = new Map<string, StackMember[]>();
  for (const user of users) {
    if (user.teamId) {
      const list = membersByTeam.get(user.teamId) ?? [];
      list.push({ id: user.id, name: user.name });
      membersByTeam.set(user.teamId, list);
    }
  }

  return (
    <section className={shared.usagePage}>
      <PageHeading
        title="Teams"
        subtitle="See how active each team is and jump into its workspace."
        action={
          <CreateTeamDialog
            onCreate={onCreateTeam}
            creating={creatingTeam}
            error={error}
          />
        }
      />

      <section className={shared.usageSection}>
        <h2>All teams</h2>
        <ul className={shared.teamList}>
          {teams.map((team) => (
            <li key={team.id}>
              <Link
                to="/dashboard/teams/$teamId"
                params={{ teamId: team.id }}
                className={shared.teamRow}
              >
                <span className={shared.teamRowIcon}>
                  <Building2 size={16} aria-hidden="true" />
                </span>
                <span className={shared.teamRowText}>
                  <span className={shared.teamRowName}>{team.name}</span>
                  <span className={shared.teamRowMeta}>
                    {plural(postsByTeam.get(team.id), "post")} ·{" "}
                    {plural(membersByTeam.get(team.id)?.length ?? 0, "user")}
                  </span>
                </span>
                <AvatarStack members={membersByTeam.get(team.id) ?? []} />
                <ChevronRight
                  size={18}
                  aria-hidden="true"
                  className={styles.teamRowChevron}
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

/** "12 posts" / "1 user"; an ellipsis while the count is still loading. */
function plural(count: number | undefined, noun: string): string {
  if (count === undefined) return `… ${noun}s`;
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}
