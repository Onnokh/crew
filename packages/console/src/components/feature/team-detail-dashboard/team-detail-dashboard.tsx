import { useQuery } from "@tanstack/react-query";
import { User } from "lucide-react";
import { apiFetch } from "../../../api/client";
import { CopyBox } from "../../ui/copy-box/copy-box";
import {
  type ActivityItem,
  type UserUsageItem,
} from "../../telemetry/telemetry-data";
import { ActivityFeed } from "../../activity-feed/activity-feed";
import { AddMemberDialog } from "../../dialogs/add-member-dialog/add-member-dialog";
import { EditMemberDialog, type ApiKey } from "../../dialogs/edit-member-dialog/edit-member-dialog";
import { PageHeading } from "../../ui/page-heading/page-heading";
import { TeamSettingsDialog } from "../../dialogs/team-settings-dialog/team-settings-dialog";
import shared from "../../../styles/dashboard.module.scss";
import styles from "./team-detail-dashboard.module.scss";

type Member = {
  id: string;
  email: string;
  name: string | null;
  keys: ApiKey[];
};

/** A member joined to their corpus usage, used for the Members list rows. */
type MemberRow = UserUsageItem & { email: string; keys: ApiKey[] };

/** Server payload for the single-Team overview. */
type TeamOverview = { users: UserUsageItem[]; activity: ActivityItem[] };

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

  // Every member, joined to their usage; members with no activity read 0/0.
  const usageById = new Map((data?.users ?? []).map((u) => [u.userId, u]));
  const rows: MemberRow[] = members
    .map((m) => {
      const u = usageById.get(m.id);
      return {
        userId: m.id,
        name: m.name ?? m.email,
        email: m.email,
        posts: u?.posts ?? 0,
        searches: u?.searches ?? 0,
        total: u?.total ?? 0,
        keys: m.keys,
      };
    })
    .sort((a, b) => b.total - a.total);

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
          />
        }
      />

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
            <p className={shared.emptyRow}>No members yet.</p>
          ) : (
            <ul className={shared.teamList}>
              {rows.map((row) => (
                <li key={row.userId}>
                  <div className={shared.teamRow}>
                    <span className={shared.teamRowIcon}>
                      <User size={16} aria-hidden="true" />
                    </span>
                    <span className={shared.teamRowText}>
                      <span className={shared.teamRowName}>{row.name}</span>
                      <span className={shared.teamRowMeta}>
                        {row.posts} {row.posts === 1 ? "post" : "posts"} ·{" "}
                        {row.searches}{" "}
                        {row.searches === 1 ? "search" : "searches"}
                      </span>
                    </span>
                    <EditMemberDialog
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

        <aside className={styles.teamsActivity}>
          <h2 className={styles.teamsActivityTitle}>Activity</h2>
          <ActivityFeed
            events={data?.activity ?? []}
            loading={isLoading}
            empty="No activity yet."
          />
        </aside>
      </div>
    </section>
  );
}
