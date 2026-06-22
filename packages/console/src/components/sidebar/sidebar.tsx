import * as Avatar from "@radix-ui/react-avatar";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Link, useRouter } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  ChevronsUpDown,
  Home,
  LogOut,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { authClient, useSession } from "../../auth/client";
import crewProfile from "../../assets/crew-profile.png";
import type { TeamRow, UserRow } from "../../hooks/use-admin-data";
import { avatarUrl } from "../ui/user-avatar/user-avatar";
import styles from "./sidebar.module.scss";

/**
 * The admin dashboard's left navigation: workspace header, the section links
 * (Home / Performance / Teams + per-team tree / Settings), and the signed-in
 * user card. `section` is the active route key (e.g. "teams" or "team:<id>").
 */
export function Sidebar({
  section,
  teams,
  users,
}: {
  section: string;
  teams: TeamRow[];
  users: UserRow[];
}) {
  const selectedTeamId = section.startsWith("team:") ? section.slice(5) : null;

  return (
    <aside className={styles.appSidebar}>
      <Link to="/" className={styles.appSidebarHeader}>
        <img className={styles.appMark} src={crewProfile} alt="" />
        <div>
          <strong>Crew</strong>
          <small>Dashboard</small>
        </div>
      </Link>

      <nav className={styles.appNav} aria-label="Admin navigation">
        <SidebarLink
          active={section === "dashboard"}
          icon={Home}
          label="Home"
          to="/dashboard"
        />
        <SidebarLink
          active={section === "usage"}
          icon={BarChart3}
          label="Performance"
          to="/dashboard/performance"
        />

        <div className={styles.appNavGroup}>
          <Link
            to="/dashboard/teams"
            className={
              section === "teams" ? styles.sidebarButtonActive : styles.sidebarLink
            }
          >
            <span>
              <Building2 size={18} aria-hidden="true" />
              Teams
            </span>
          </Link>
          <div className={styles.teamTree}>
            {teams.map((team) => {
              const members = users.filter((user) => user.teamId === team.id);
              return (
                <Link
                  key={team.id}
                  to="/dashboard/teams/$teamId"
                  params={{ teamId: team.id }}
                  className={
                    selectedTeamId === team.id
                      ? styles.teamTreeItemActive
                      : styles.teamTreeItem
                  }
                >
                  <span>{team.name}</span>
                  <small>{members.length}</small>
                </Link>
              );
            })}
          </div>
        </div>

        <SidebarLink
          active={section === "settings"}
          icon={Settings}
          label="Settings"
          to="/dashboard/settings"
        />
      </nav>

      <SidebarUser />
    </aside>
  );
}

function SidebarLink({
  active,
  icon: Icon,
  label,
  meta,
  to,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  meta?: string;
  to: "/dashboard" | "/dashboard/performance" | "/dashboard/settings";
}) {
  return (
    <Link
      to={to}
      className={active ? styles.sidebarButtonActive : styles.sidebarButton}
    >
      <span>
        <Icon size={18} aria-hidden="true" />
        {label}
      </span>
      {meta && <small>{meta}</small>}
    </Link>
  );
}

/** Signed-in user card pinned to the sidebar foot, with a sign-out menu. */
function SidebarUser() {
  const router = useRouter();
  const { data } = useSession();
  const user = data?.user;
  if (!user) return null;

  const label = user.name ?? user.email ?? "Account";
  const secondary = user.name && user.email ? user.email : "Crew workspace";

  async function onSignOut() {
    await authClient.signOut();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.sidebarUser}>
        <Avatar.Root className={styles.sidebarUserAvatar}>
          <Avatar.Image
            className={styles.sidebarUserAvatarImage}
            src={avatarUrl(user.id ?? user.email)}
            alt=""
          />
          <Avatar.Fallback>{initials(label)}</Avatar.Fallback>
        </Avatar.Root>
        <span className={styles.sidebarUserText}>
          <strong>{label}</strong>
          <small>{secondary}</small>
        </span>
        <ChevronsUpDown size={16} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.sidebarUserMenu}
          side="top"
          align="start"
          sideOffset={8}
        >
          <div className={styles.sidebarUserMenuHeader}>
            <strong>{label}</strong>
            <small>{user.email}</small>
          </div>
          <DropdownMenu.Separator className={styles.sidebarUserMenuSep} />
          <DropdownMenu.Item
            className={styles.sidebarUserMenuItem}
            onSelect={onSignOut}
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}
