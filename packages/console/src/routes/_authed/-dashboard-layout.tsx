import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Sidebar } from "../../components/sidebar/sidebar";
import { OverviewDashboard } from "../../components/feature/overview-dashboard/overview-dashboard";
import { PageHeading } from "../../components/ui/page-heading/page-heading";
import { TeamsDashboard } from "../../components/feature/teams-dashboard/teams-dashboard";
import { TeamDetailDashboard } from "../../components/feature/team-detail-dashboard/team-detail-dashboard";
import { UserDetailDashboard } from "../../components/feature/user-detail-dashboard/user-detail-dashboard";
import { useAdminData, type AdminData } from "../../hooks/use-admin-data";
import shared from "../../styles/dashboard.module.scss";
import styles from "./-dashboard-layout.module.scss";

const UsagePanel = lazy(
  () => import("../../components/feature/usage-dashboard/usage-dashboard"),
);
const ActivityPanel = lazy(
  () => import("../../components/feature/activity-dashboard/activity-dashboard"),
);
const RetrievalsPanel = lazy(
  () =>
    import("../../components/feature/retrievals-dashboard/retrievals-dashboard"),
);

/**
 * Route entry for the admin dashboard. Wires the data layer ({@link useAdminData})
 * to the presentational {@link AdminDashboard} layout; `fixedSection` picks which
 * section the current route renders.
 */
export function AdminRoutePage({ fixedSection }: { fixedSection?: string }) {
  const data = useAdminData();
  return <AdminDashboard fixedSection={fixedSection} {...data} />;
}

type AdminDashboardProps = AdminData & { fixedSection?: string };

/** The dashboard chrome: sidebar + the section the active route selected. */
function AdminDashboard(props: AdminDashboardProps) {
  const navigate = useNavigate();
  const section = props.fixedSection ?? "dashboard";
  const selectedTeamId = section.startsWith("team:") ? section.slice(5) : null;
  const selectedTeam = props.teams.find((team) => team.id === selectedTeamId);
  const selectedUserId = section.startsWith("user:") ? section.slice(5) : null;
  const selectedUser = props.users.find((user) => user.id === selectedUserId);
  const selectedTeamUsers = selectedTeam
    ? props.users.filter((user) => user.teamId === selectedTeam.id)
    : [];

  // A team is deletable only when it's neither the default (earliest) team nor
  // has any members — mirrors the server's guards (ADR 0008) so the UI explains
  // up front why the action is unavailable rather than surfacing a 4xx.
  const defaultTeamId = props.teams.reduce<{ id: string; at: number } | null>(
    (min, t) => (min === null || t.createdAt < min.at ? { id: t.id, at: t.createdAt } : min),
    null,
  )?.id;
  const isDefaultTeam = selectedTeam?.id === defaultTeamId;
  const canDeleteTeam = !!selectedTeam && !isDefaultTeam && selectedTeamUsers.length === 0;
  const deleteDisabledReason = isDefaultTeam
    ? "The default team cannot be deleted."
    : selectedTeamUsers.length > 0
      ? "Remove or reassign this team's members before deleting it."
      : null;

  return (
    <section className={styles.pageFull}>
      {props.error && (
        <p className={shared.error} role="alert">
          {props.error}
        </p>
      )}

      <div className={`${styles.adminShell} ${styles.adminShellNoRail}`}>
        <Sidebar section={section} teams={props.teams} users={props.users} />

        <main className={styles.appContent}>
          {section === "dashboard" && (
            <OverviewDashboard usersCount={props.users.length} />
          )}
          {section === "usage" && (
            <Suspense fallback={<p className={shared.emptyRow}>Loading...</p>}>
              <UsagePanel />
            </Suspense>
          )}
          {section === "activity" && (
            <Suspense fallback={<p className={shared.emptyRow}>Loading...</p>}>
              <ActivityPanel />
            </Suspense>
          )}
          {section === "retrievals" && (
            <Suspense fallback={<p className={shared.emptyRow}>Loading...</p>}>
              <RetrievalsPanel />
            </Suspense>
          )}
          {section === "teams" && (
            <TeamsDashboard
              teams={props.teams}
              users={props.users}
              onCreateTeam={props.actions.createTeam}
              creatingTeam={props.pending.creatingTeam}
              error={props.teamError}
            />
          )}
          {section === "settings" && <SettingsPanel />}
          {selectedTeam && (
            <TeamDetailDashboard
              key={selectedTeam.id}
              teamId={selectedTeam.id}
              teamName={selectedTeam.name}
              members={selectedTeamUsers.map((u) => ({
                id: u.id,
                email: u.email,
                name: u.name,
                keys: u.keys,
              }))}
              onRename={(name, opts) =>
                props.actions.renameTeam({ id: selectedTeam.id, name }, opts)
              }
              renaming={props.pending.renamingTeam}
              error={props.teamError}
              intakeDomains={selectedTeam.intakeDomains}
              onSaveDomains={(domains) =>
                props.actions.setTeamDomains({
                  id: selectedTeam.id,
                  intakeDomains: domains,
                })
              }
              savingDomains={props.pending.savingTeamDomains}
              onDelete={() =>
                props.actions.deleteTeam(
                  { id: selectedTeam.id },
                  { onSuccess: () => navigate({ to: "/dashboard/teams" }) },
                )
              }
              deleting={props.pending.deletingTeam}
              canDelete={canDeleteTeam}
              deleteDisabledReason={deleteDisabledReason}
              onAddMember={(name, email, opts) =>
                props.actions.createUser(
                  { name, email, teamId: selectedTeam.id },
                  opts,
                )
              }
              addingMember={props.pending.creatingUser}
              memberError={props.error}
              newPassword={props.secrets.newPassword}
            />
          )}
          {selectedUser && (
            <UserDetailDashboard
              key={selectedUser.id}
              name={selectedUser.name ?? selectedUser.email}
              email={selectedUser.email}
              teamName={selectedUser.teamName}
              keys={selectedUser.keys}
              onRename={(name) =>
                props.actions.renameUser({ id: selectedUser.id, name })
              }
              renaming={props.pending.renamingUser}
              onResetPassword={(password) =>
                props.actions.resetPassword({
                  id: selectedUser.id,
                  email: selectedUser.email,
                  password,
                })
              }
              resettingPassword={props.pending.resettingPassword}
              resetPassword={
                props.secrets.newPassword?.userId === selectedUser.id
                  ? props.secrets.newPassword.password
                  : null
              }
              onMintKey={() => props.actions.mintKey(selectedUser)}
              mintingKey={props.pending.mintingKey}
              mintedKey={
                props.secrets.mintedKey?.userId === selectedUser.id
                  ? props.secrets.mintedKey.key
                  : null
              }
              onRevokeKey={(key) => props.actions.revokeKey(key)}
              revokingKey={props.pending.revokingKey}
              onDelete={() =>
                props.actions.deleteUser(
                  { id: selectedUser.id },
                  { onSuccess: () => navigate({ to: "/dashboard/teams" }) },
                )
              }
              deleting={props.pending.deletingUser}
            />
          )}
        </main>
      </div>
    </section>
  );
}

function SettingsPanel() {
  return (
    <section className={shared.usagePage}>
      <PageHeading
        title="Settings"
        subtitle="Operational defaults for authentication and data routing."
      />
      <section className={shared.usageSection}>
        <div className={styles.settingsList}>
          <div>
            <strong>Authentication</strong>
            <span>Email/password sessions and API keys</span>
          </div>
          <div>
            <strong>Default Team</strong>
            <span>Fallback for newly provisioned users</span>
          </div>
          <div>
            <strong>Data Routing</strong>
            <span>Each team routes to an isolated corpus database</span>
          </div>
        </div>
      </section>
    </section>
  );
}
