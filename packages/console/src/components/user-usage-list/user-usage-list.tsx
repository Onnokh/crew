import type { UserUsageItem } from "../telemetry/telemetry-data";
import shared from "../../styles/dashboard.module.scss";
import styles from "./user-usage-list.module.scss";

/** The busiest users, each with their posts/searches split and a combined total. */
export function UserUsageList({
  users,
  loading,
  empty = "No activity yet.",
  limit = 8,
}: {
  users: UserUsageItem[];
  loading?: boolean;
  empty?: string;
  limit?: number;
}) {
  if (loading) return <p className={shared.emptyRow}>Loading...</p>;
  if (users.length === 0) return <p className={shared.emptyRow}>{empty}</p>;
  return (
    <ul className={styles.userUsageList}>
      {users.slice(0, limit).map((user) => {
        const name = user.name ?? "Unknown user";
        return (
          <li key={user.userId} className={styles.userUsageRow}>
            <span className={styles.userUsageAvatar}>{initials(name)}</span>
            <span className={styles.userUsageText}>
              <span className={styles.userUsageName}>{name}</span>
              <span className={styles.userUsageMeta}>
                {user.posts} {user.posts === 1 ? "post" : "posts"} · {user.searches}{" "}
                {user.searches === 1 ? "search" : "searches"}
              </span>
            </span>
            <span className={styles.userUsageTotal}>{user.total}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Up to two uppercase initials for an avatar bubble. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters =
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "");
  return letters.toUpperCase() || "?";
}
