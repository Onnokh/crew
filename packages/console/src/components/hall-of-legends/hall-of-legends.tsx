import { Trophy } from "lucide-react";
import type { UserUsageItem } from "../telemetry/telemetry-data";
import { EmptyState } from "../ui/empty-state/empty-state";
import { UserAvatar } from "../ui/user-avatar/user-avatar";
import shared from "../../styles/dashboard.module.scss";
import styles from "./hall-of-legends.module.scss";

/**
 * The busiest users, celebrated: the top three on a gold/silver/bronze podium
 * (rank + total score on each step), with the remaining ranks as a slim list
 * below. Drives the "Hall of Legends" panel on the overview dashboard.
 */
export function HallOfLegends({
  users,
  loading,
  empty = "No legends yet.",
  limit = 8,
}: {
  users: UserUsageItem[];
  loading?: boolean;
  empty?: string;
  limit?: number;
}) {
  if (loading) return <p className={shared.emptyRow}>Loading...</p>;
  if (users.length === 0) return <EmptyState icon={Trophy} message={empty} />;

  const ranked = users.toSorted((a, b) => b.total - a.total).slice(0, limit);
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  // Visual order on the podium: 2nd, 1st, 3rd — so 1st stands tallest in the middle.
  const order = [top[1], top[0], top[2]].filter(Boolean) as UserUsageItem[];

  return (
    <div className={styles.podiumWrap}>
      <div className={styles.podium}>
        {order.map((u) => {
          const place = ranked.indexOf(u) + 1;
          return (
            <div
              key={u.userId}
              className={`${styles.podiumCol} ${styles[`place${place}`]}`}
            >
              <UserAvatar
                seed={u.userId}
                name={u.name}
                className={styles.podiumAvatar}
              />
              <span className={styles.podiumName}>{u.name ?? "Unknown"}</span>
              <div className={styles.podiumStep}>
                <span className={styles.podiumRank}>{place}</span>
                <span className={styles.podiumTotal}>{u.total}</span>
              </div>
            </div>
          );
        })}
      </div>
      {rest.length > 0 && (
        <ol className={styles.podiumRest} start={4}>
          {rest.map((u, i) => (
            <li key={u.userId} className={styles.podiumRestRow}>
              <span className={styles.podiumRestRank}>{i + 4}</span>
              <UserAvatar
                seed={u.userId}
                name={u.name}
                className={styles.restAvatar}
              />
              <span className={styles.restName}>{u.name ?? "Unknown"}</span>
              <span className={styles.restTotal}>{u.total}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
