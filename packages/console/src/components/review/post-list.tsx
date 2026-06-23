import { ScrollText } from "lucide-react";
import { EmptyState } from "../ui/empty-state/empty-state";
import { PostCard } from "./post-card";
import type { ReviewRow } from "./review-data";
import styles from "./review.module.scss";

/** One tab's list of Post cards, or a loading / empty-state line. */
export function PostList({
  rows,
  empty,
  busyId,
  currentUserId,
  isAdmin,
  onDelete,
}: {
  rows: ReviewRow[] | undefined;
  empty: string;
  busyId: string | null;
  /** Signed-in User's id, or null when signed out. */
  currentUserId: string | null;
  /** Admins may delete any Post; everyone else only their own. */
  isAdmin: boolean;
  onDelete: (row: ReviewRow) => void;
}) {
  if (rows === undefined) return <p className={styles.muted}>Loading…</p>;
  if (rows.length === 0) return <EmptyState icon={ScrollText} message={empty} />;
  return (
    <ul className={styles.cards}>
      {rows.map((row) => (
        <PostCard
          key={row.id}
          row={row}
          busy={busyId === row.id}
          canDelete={isAdmin || row.createdBy === currentUserId}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}
