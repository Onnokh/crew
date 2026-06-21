import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  Database,
  Home,
  KeyRound,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { ApiError, apiFetch } from "../../api/client";
import { authClient } from "../../auth/client";
import { ConfirmDelete } from "../../components/confirm-delete/confirm-delete";
import { ConversionPanel } from "../../components/telemetry/conversion-panel";
import { QueryVolumePanel } from "../../components/telemetry/query-volume-panel";
import { RecentRetrievalsPanel } from "../../components/telemetry/recent-retrievals-panel";
import { ZeroResultRatePanel } from "../../components/telemetry/zero-result-rate-panel";
import { CopyBox } from "../../components/ui/copy-box/copy-box";
import styles from "./admin.module.scss";

/** Admin user-management page, backed by the role-gated `/api/admin/*` API. */
export const Route = createFileRoute("/_authed/admin")({
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    // `role` is omitted from the inferred session type, so read it through a
    // narrow local shape. The server gates the API regardless.
    const role = (data?.user as { role?: string | null } | undefined)?.role;
    if (role !== "admin") {
      throw redirect({ to: "/" });
    }
  },
  component: AdminPage,
});

/** Safe api-key metadata as the listing returns it (never the secret itself). */
type ApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  createdAt: string | null;
  lastRequest: string | null;
};

/** A User row as the listing endpoint returns it. */
type UserRow = {
  id: string;
  email: string;
  role: string | null;
  /** The Team this User belongs to (its single Membership), or null if unbound. */
  teamId: string | null;
  teamName: string | null;
  keys: ApiKey[];
};

/** A Team row as the listing endpoint returns it. */
type TeamRow = {
  id: string;
  name: string;
  createdAt: number;
};

type AdminActions = {
  createUser: (vars: { email: string; teamId: string }) => void;
  mintKey: (user: UserRow) => void;
  revokeKey: (key: ApiKey) => void;
  deleteUser: (user: UserRow) => void;
  createTeam: (name: string) => void;
  renameTeam: (vars: { id: string; name: string }) => void;
};

type AdminMutationState = {
  creatingUser: boolean;
  mintingKey: boolean;
  revokingKey: boolean;
  deletingUser: boolean;
  creatingTeam: boolean;
  renamingTeam: boolean;
};

type AdminSecrets = {
  newPassword: { userId: string; email: string; password: string } | null;
  mintedKey: { userId: string; key: string } | null;
};

type AdminDashboardProps = {
  users: UserRow[];
  teams: TeamRow[];
  defaultTeamId: string;
  error: string | null;
  teamError: string | null;
  actions: AdminActions;
  pending: AdminMutationState;
  secrets: AdminSecrets;
};

/** Centralized query keys, reused by every mutation's invalidate. */
const adminKeys = {
  users: ["admin", "users"] as const,
  teams: ["admin", "teams"] as const,
};

function AdminPage() {
  const queryClient = useQueryClient();

  const { data: usersData, error: usersError } = useQuery({
    queryKey: adminKeys.users,
    queryFn: () =>
      apiFetch<{ users: UserRow[] }>("/api/admin/users").then((r) => r.users),
  });
  const users = usersData ?? [];

  const { data: teamsData, error: teamsError } = useQuery({
    queryKey: adminKeys.teams,
    queryFn: () =>
      apiFetch<{ teams: TeamRow[] }>("/api/admin/teams").then((r) => r.teams),
  });
  const teams = teamsData ?? [];
  // The default Team sorts last (earliest-created); pick it as the default option.
  const defaultTeamId = teams.length > 0 ? teams[teams.length - 1]!.id : "";

  // Show-once secrets, keyed by User id. Set from a mutation result, never the
  // query cache — the server returns them exactly once.
  const [newPassword, setNewPassword] = useState<{
    userId: string;
    email: string;
    password: string;
  } | null>(null);
  const [mintedKey, setMintedKey] = useState<{
    userId: string;
    key: string;
  } | null>(null);

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.users });

  const createUser = useMutation({
    mutationFn: (vars: { email: string; teamId: string }) =>
      apiFetch<{ user: { id: string; email: string }; password: string }>(
        "/api/admin/users",
        {
          method: "POST",
          body: JSON.stringify({
            email: vars.email,
            // Omit when empty so the server applies its default-Team fallback.
            ...(vars.teamId ? { teamId: vars.teamId } : {}),
          }),
        },
      ),
    onSuccess: async (created) => {
      setNewPassword({
        userId: created.user.id,
        email: created.user.email,
        password: created.password,
      });
      setMintedKey(null);
      await invalidateUsers();
    },
  });

  const mintKey = useMutation({
    mutationFn: (user: UserRow) =>
      apiFetch<{ id: string; key: string }>(`/api/admin/users/${user.id}/keys`, {
        method: "POST",
      }),
    onSuccess: async ({ key }, user) => {
      setMintedKey({ userId: user.id, key });
      setNewPassword(null);
      await invalidateUsers();
    },
  });

  const revokeKey = useMutation({
    mutationFn: (key: ApiKey) =>
      apiFetch(`/api/admin/keys/${key.id}`, { method: "DELETE" }),
    onSuccess: () => invalidateUsers(),
  });

  const deleteUser = useMutation({
    mutationFn: (user: UserRow) =>
      apiFetch(`/api/admin/users/${user.id}`, { method: "DELETE" }),
    onSuccess: () => invalidateUsers(),
  });

  const invalidateTeams = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.teams });

  const createTeam = useMutation({
    mutationFn: (newName: string) =>
      apiFetch<{ team: TeamRow }>("/api/admin/teams", {
        method: "POST",
        body: JSON.stringify({ name: newName }),
      }),
    onSuccess: () => invalidateTeams(),
  });

  const renameTeam = useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      apiFetch<{ team: TeamRow }>(`/api/admin/teams/${vars.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: vars.name }),
      }),
    onSuccess: () => invalidateTeams(),
  });

  // First failing operation, rendered as a single page-level message.
  const failure =
    usersError ??
    createUser.error ??
    mintKey.error ??
    revokeKey.error ??
    deleteUser.error ??
    null;
  const error = failure ? describe(failure) : null;
  const teamFailure = teamsError ?? createTeam.error ?? renameTeam.error ?? null;
  const teamError = teamFailure ? describe(teamFailure) : null;

  return (
    <AdminDashboard
      users={users}
      teams={teams}
      defaultTeamId={defaultTeamId}
      error={error}
      teamError={teamError}
      actions={{
        createUser: (vars) => {
          createUser.mutate(vars);
        },
        mintKey: (user) => mintKey.mutate(user),
        revokeKey: (key) => revokeKey.mutate(key),
        deleteUser: (user) => deleteUser.mutate(user),
        createTeam: (name) => createTeam.mutate(name),
        renameTeam: (vars) => renameTeam.mutate(vars),
      }}
      pending={{
        creatingUser: createUser.isPending,
        mintingKey: mintKey.isPending,
        revokingKey: revokeKey.isPending,
        deletingUser: deleteUser.isPending,
        creatingTeam: createTeam.isPending,
        renamingTeam: renameTeam.isPending,
      }}
      secrets={{ newPassword, mintedKey }}
    />
  );
}

function AdminDashboard(props: AdminDashboardProps) {
  const [section, setSection] = useState("dashboard");
  const selectedTeamId = section.startsWith("team:") ? section.slice(5) : null;
  const selectedTeam = props.teams.find((team) => team.id === selectedTeamId);
  const selectedTeamUsers = selectedTeam
    ? props.users.filter((user) => user.teamId === selectedTeam.id)
    : [];
  const currentTitle = selectedTeam?.name ?? titleForSection(section);
  const currentSubtitle = selectedTeam
    ? "Members, usage, and API keys for this Team."
    : subtitleForSection(section);

  return (
    <section className={styles.pageFull}>
      {props.error && (
        <p className={styles.error} role="alert">
          {props.error}
        </p>
      )}

      <div className={styles.adminShell}>
        <aside className={styles.appSidebar}>
          <div className={styles.appSidebarHeader}>
            <span className={styles.appMark}>Cr</span>
            <div>
              <strong>Crew Admin</strong>
              <small>Control plane</small>
            </div>
          </div>

          <nav className={styles.appNav} aria-label="Admin navigation">
            <Link to="/" className={styles.sidebarLink}>
              <span>
                <Home size={18} aria-hidden="true" />
                Home
              </span>
              <small>App</small>
            </Link>
            <SidebarButton
              active={section === "dashboard"}
              icon={LayoutDashboard}
              label="Dashboard"
              meta="Home"
              onClick={() => setSection("dashboard")}
            />
            <SidebarButton
              active={section === "usage"}
              icon={BarChart3}
              label="Usage"
              meta="Global"
              onClick={() => setSection("usage")}
            />

            <div className={styles.appNavGroup}>
              <button
              type="button"
              className={section === "teams" ? styles.appGroupActive : styles.appGroup}
              onClick={() => setSection("teams")}
            >
                <span>
                  <Building2 size={18} aria-hidden="true" />
                  Teams
                </span>
                <small>Create</small>
              </button>
              <div className={styles.teamTree}>
                {props.teams.map((team) => {
                  const members = props.users.filter((user) => user.teamId === team.id);
                  return (
                    <button
                      key={team.id}
                      type="button"
                      className={
                        selectedTeam?.id === team.id
                          ? styles.teamTreeItemActive
                          : styles.teamTreeItem
                      }
                      onClick={() => setSection(`team:${team.id}`)}
                    >
                      <span>{team.name}</span>
                      <small>{members.length}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <SidebarButton
              active={section === "users"}
              icon={Users}
              label="Users"
              meta={`${props.users.length}`}
              onClick={() => setSection("users")}
            />
            <SidebarButton
              active={section === "settings"}
              icon={Settings}
              label="Settings"
              meta="Org"
              onClick={() => setSection("settings")}
            />
          </nav>
        </aside>

        <main className={styles.appContent}>
          <header className={styles.contentHeader}>
            <div>
              <p className={styles.eyebrow}>Admin</p>
              <h1>{currentTitle}</h1>
              <p>{currentSubtitle}</p>
            </div>
            <span className={styles.datePill}>
              Today
              <CalendarDays size={18} aria-hidden="true" />
            </span>
          </header>
          {section === "dashboard" && <DashboardPanel {...props} />}
          {section === "usage" && (
            <UsagePanel users={props.users} teams={props.teams} />
          )}
          {section === "teams" && <TeamSection {...props} mode="wide" />}
          {section === "users" && <UserSection {...props} mode="dense" />}
          {section === "settings" && <SettingsPanel />}
          {selectedTeam && (
            <TeamDetailPanel
              {...props}
              team={selectedTeam}
              users={selectedTeamUsers}
            />
          )}
        </main>

        <ActivityRail users={props.users} teams={props.teams} />
      </div>
    </section>
  );
}

function DashboardPanel(props: AdminDashboardProps) {
  return (
    <section className={styles.dashboardPanel}>
      <div className={styles.dashboardMetrics}>
        <DashboardMetric
          icon={Building2}
          label="Teams"
          value={props.teams.length}
          note="Ready for events"
        />
        <DashboardMetric
          icon={Users}
          label="Users"
          value={props.users.length}
          note="Provisioned"
        />
        <DashboardMetric
          icon={KeyRound}
          label="API keys"
          value={keyCount(props.users)}
          note="Usage coming soon"
        />
      </div>

      <div className={styles.dashboardPlaceholders}>
        <section>
          <SectionHead label="Events" meta="Coming soon" />
          <p>Recent workspace events will appear here.</p>
        </section>
        <section>
          <SectionHead label="Usage" meta="Coming soon" />
          <p>Team and API key usage trends will appear here.</p>
        </section>
      </div>
    </section>
  );
}

function UsagePanel({ users, teams }: { users: UserRow[]; teams: TeamRow[] }) {
  return (
    <section className={styles.appPanel}>
      <div className={styles.metricGrid}>
        <Metric icon={Activity} label="Active Teams" value={teams.length} />
        <Metric icon={UserPlus} label="Provisioned Users" value={users.length} />
        <Metric icon={KeyRound} label="Minted Keys" value={keyCount(users)} />
      </div>
      <SectionHead label="Team usage" meta={`${teams.length} teams`} />
      <ul className={styles.sectionList}>
        {teams.map((team) => {
          const members = users.filter((user) => user.teamId === team.id);
          return (
            <li key={team.id} className={styles.entityRow}>
              <EntityLabel title={team.name} detail={`${members.length} members`} />
              <span className={styles.keys}>
                {keyCount(members)} {keyCount(members) === 1 ? "key" : "keys"}
              </span>
            </li>
          );
        })}
      </ul>

      <SectionHead label="Retrieval usage" meta="Current Team" />
      <div className={styles.usageTelemetryGrid}>
        <TelemetryCard title="Query volume">
          <QueryVolumePanel />
        </TelemetryCard>
        <TelemetryCard title="Zero-result rate">
          <ZeroResultRatePanel />
        </TelemetryCard>
        <TelemetryCard title="Query→Confirm">
          <ConversionPanel />
        </TelemetryCard>
        <TelemetryCard title="Recent retrievals" wide>
          <RecentRetrievalsPanel />
        </TelemetryCard>
      </div>
    </section>
  );
}

function TelemetryCard({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <section
      className={
        wide ? styles.usageTelemetryCardWide : styles.usageTelemetryCard
      }
    >
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function TeamDetailPanel(
  props: AdminDashboardProps & { team: TeamRow; users: UserRow[] },
) {
  return (
    <section className={styles.appPanel}>
      <div className={styles.metricGrid}>
        <Metric icon={Users} label="Members" value={props.users.length} />
        <Metric icon={KeyRound} label="API keys" value={keyCount(props.users)} />
        <Metric icon={BarChart3} label="Usage" value="Global" />
      </div>
      <UserSection
        {...props}
        defaultTeamId={props.team.id}
        users={props.users}
        mode="dense"
      />
      <KeySection
        users={props.users}
        actions={props.actions}
        pending={props.pending}
      />
    </section>
  );
}

function SettingsPanel() {
  return (
    <section className={styles.appPanel}>
      <SectionHead label="Settings" meta="Org" />
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
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
}) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricIcon}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function DashboardMetric({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  note: string;
}) {
  return (
    <div className={styles.dashboardMetric}>
      <span className={styles.dashboardMetricIcon}>
        <Icon size={22} aria-hidden="true" />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </div>
  );
}

function SidebarButton({
  active,
  icon: Icon,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? styles.sidebarButtonActive : styles.sidebarButton}
      onClick={onClick}
    >
      <span>
        <Icon size={18} aria-hidden="true" />
        {label}
      </span>
      <small>{meta}</small>
    </button>
  );
}

function TeamSection(props: AdminDashboardProps & { mode: "wide" }) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    props.actions.createTeam(name);
    setName("");
  }

  function onRename(event: FormEvent) {
    event.preventDefault();
    if (!editing?.name.trim()) return;
    props.actions.renameTeam(editing);
    setEditing(null);
  }

  return (
    <section className={sectionClass(props.mode)}>
      <SectionHead
        label="Teams"
        meta={`${props.teams.length} ${props.teams.length === 1 ? "team" : "teams"}`}
      />
      {props.teamError && (
        <p className={styles.error} role="alert">
          {props.teamError}
        </p>
      )}
      <form className={styles.inlineForm} onSubmit={onCreate}>
        <input
          className={styles.input}
          type="text"
          placeholder="New team name"
          aria-label="New team name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className={styles.primary}
          type="submit"
          disabled={props.pending.creatingTeam}
        >
          {props.pending.creatingTeam ? "Creating…" : "Create"}
        </button>
      </form>
      <ul className={styles.sectionList}>
        {props.teams.map((team) => (
          <li key={team.id} className={styles.entityRow}>
            {editing?.id === team.id ? (
              <form className={styles.renameForm} onSubmit={onRename}>
                <input
                  className={styles.input}
                  type="text"
                  aria-label={`Rename ${team.name}`}
                  required
                  autoFocus
                  value={editing.name}
                  onChange={(e) => setEditing({ id: team.id, name: e.target.value })}
                />
                <button
                  className={styles.action}
                  type="submit"
                  disabled={props.pending.renamingTeam}
                >
                  Save
                </button>
                <button
                  className={styles.action}
                  type="button"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <EntityLabel title={team.name} detail={team.id} />
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => setEditing({ id: team.id, name: team.name })}
                >
                  Rename
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function UserSection(props: AdminDashboardProps & { mode: "wide" | "dense" }) {
  const [email, setEmail] = useState("");
  const [teamId, setTeamId] = useState("");

  function onCreate(event: FormEvent) {
    event.preventDefault();
    props.actions.createUser({ email, teamId });
    setEmail("");
    setTeamId("");
  }

  return (
    <section className={sectionClass(props.mode)}>
      <SectionHead
        label="Users"
        meta={`${props.users.length} ${props.users.length === 1 ? "user" : "users"}`}
      />
      <form className={styles.inlineForm} onSubmit={onCreate}>
        <input
          className={styles.input}
          type="email"
          placeholder="new.user@team.local"
          aria-label="New User email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          className={styles.input}
          aria-label="Team"
          value={teamId || props.defaultTeamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {props.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        <button
          className={styles.primary}
          type="submit"
          disabled={props.pending.creatingUser}
        >
          {props.pending.creatingUser ? "Creating…" : "Create"}
        </button>
      </form>
      <ul className={styles.sectionList}>
        {props.users.map((user) => (
          <li key={user.id} className={styles.entityRow}>
            <EntityLabel
              title={user.email}
              detail={`${user.role ?? "user"} · ${user.teamName ?? "No Team"}`}
            />
            <span className={styles.keys}>
              {user.keys.length} {user.keys.length === 1 ? "key" : "keys"}
            </span>
            <button
              type="button"
              className={styles.action}
              onClick={() => props.actions.mintKey(user)}
              disabled={props.pending.mintingKey}
            >
              Add key
            </button>
            <ConfirmDelete
              email={user.email}
              onConfirm={() => props.actions.deleteUser(user)}
            >
              <button
                type="button"
                className={styles.actionDanger}
                disabled={props.pending.deletingUser}
              >
                Delete
              </button>
            </ConfirmDelete>
            {props.secrets.newPassword?.userId === user.id && (
              <div className={styles.secretSlot}>
                <CopyBox label="Password" secret={props.secrets.newPassword.password} />
              </div>
            )}
            {props.secrets.mintedKey?.userId === user.id && (
              <div className={styles.secretSlot}>
                <CopyBox label="API key" secret={props.secrets.mintedKey.key} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function KeySection({
  users,
  actions,
  pending,
}: {
  users: UserRow[];
  actions: AdminActions;
  pending: AdminMutationState;
}) {
  const keys = users.flatMap((user) =>
    user.keys.map((key) => ({ ...key, userEmail: user.email, teamName: user.teamName })),
  );
  return (
    <section className={styles.adminSection}>
      <SectionHead
        label="API keys"
        meta={`${keys.length} ${keys.length === 1 ? "key" : "keys"}`}
      />
      <ul className={styles.sectionList}>
        {keys.length === 0 ? (
          <li className={styles.emptyRow}>No API keys have been minted.</li>
        ) : (
          keys.map((key) => (
            <li key={key.id} className={styles.entityRow}>
              <EntityLabel
                title={key.name ?? "key"}
                detail={`${key.userEmail} · ${key.teamName ?? "No Team"}`}
              />
              {key.start && <code className={styles.keyStart}>{key.start}…</code>}
              <span className={styles.keyUsage}>{lastUsed(key.lastRequest)}</span>
              <button
                type="button"
                className={styles.actionDanger}
                onClick={() => actions.revokeKey(key)}
                disabled={pending.revokingKey}
              >
                Delete
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function SectionHead({ label, meta }: { label: string; meta: string }) {
  return (
    <div className={styles.sectionHead}>
      <p className={styles.listLabel}>{label}</p>
      <span className={styles.sectionMeta}>{meta}</span>
    </div>
  );
}

function EntityLabel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className={styles.identity}>
      <span className={styles.email}>{title}</span>
      <span className={styles.role}>/ {detail}</span>
    </div>
  );
}

function ActivityRail({ users, teams }: { users: UserRow[]; teams: TeamRow[] }) {
  const latestUsers = users.slice(0, 3);
  const latestTeams = teams.slice(0, 3);
  return (
    <aside className={styles.activityRail}>
      <section className={styles.profileCard}>
        <span className={styles.profileAvatar}>Cr</span>
        <strong>Crew workspace</strong>
        <span>{teams.length} teams managed</span>
        <div className={styles.profileActions}>
          <span>
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          <span>
            <Database size={18} aria-hidden="true" />
          </span>
          <span>
            <KeyRound size={18} aria-hidden="true" />
          </span>
        </div>
      </section>

      <section className={styles.railSection}>
        <SectionHead label="Activity" meta="Live" />
        <ul className={styles.activityList}>
          {latestUsers.map((user) => (
            <li key={user.id}>
              <span className={styles.activityAvatar}>{initials(user.email)}</span>
              <div>
                <strong>{user.email}</strong>
                <span>
                  {user.keys.length} {user.keys.length === 1 ? "key" : "keys"} in{" "}
                  {user.teamName ?? "No Team"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.railSection}>
        <SectionHead label="Teams" meta={`${teams.length}`} />
        <ul className={styles.teamSummaryList}>
          {latestTeams.map((team) => {
            const members = users.filter((user) => user.teamId === team.id);
            return (
              <li key={team.id}>
                <span>{team.name}</span>
                <strong>{members.length}</strong>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}

function sectionClass(mode: "wide" | "dense"): string {
  const section = styles.adminSection!;
  return mode === "dense"
    ? `${section} ${styles.denseSection!}`
    : section;
}

function keyCount(users: UserRow[]): number {
  return users.reduce((sum, user) => sum + user.keys.length, 0);
}

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

function titleForSection(section: string): string {
  switch (section) {
    case "usage":
      return "Usage";
    case "teams":
      return "Teams";
    case "users":
      return "Users";
    case "settings":
      return "Settings";
    default:
      return "Crew control";
  }
}

function subtitleForSection(section: string): string {
  switch (section) {
    case "usage":
      return "Global usage signals across teams, users, and API keys.";
    case "teams":
      return "Create teams and keep each team’s corpus isolated.";
    case "users":
      return "Provision users and mint API keys for their agents.";
    case "settings":
      return "Operational defaults for authentication and data routing.";
    default:
      return "Manage teams, users, and API keys from one workspace.";
  }
}

/** A short "last used" phrase for a key's `lastRequest` (null = never verified). */
function lastUsed(iso: string | null): string {
  if (!iso) return "never used";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never used";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "used just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `used ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `used ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `used ${days}d ago`;
}

/** Turn an {@link ApiError} (or anything thrown) into a one-line page message. */
function describe(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Admin role required.";
    return `Request failed (${err.status}).`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
