import type { LucideIcon } from "lucide-react";
import styles from "./empty-state.module.scss";

/**
 * A centered empty-state placeholder: a tinted icon above a muted message,
 * centered both axes within its container. Used wherever a dashboard panel,
 * list, or chart has no data yet (Members, Activity, the usage charts).
 */
export function EmptyState({
  icon: Icon,
  message,
}: {
  icon: LucideIcon;
  message: string;
}) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <p className={styles.emptyMessage}>{message}</p>
    </div>
  );
}
