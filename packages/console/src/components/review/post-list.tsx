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
  canModerate,
  onSetRetired,
}: {
  rows: ReviewRow[] | undefined;
  empty: string;
  busyId: string | null;
  canModerate: boolean;
  onSetRetired: (row: ReviewRow, retired: boolean) => void;
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
          canModerate={canModerate}
          onSetRetired={onSetRetired}
        />
      ))}
    </ul>
  );
}
