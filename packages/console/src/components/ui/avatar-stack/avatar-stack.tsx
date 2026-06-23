import { UserAvatar } from "../user-avatar/user-avatar";
import styles from "./avatar-stack.module.scss";

export type StackMember = { id: string; name?: string | null };

/**
 * An overlapping row of member avatars with a "+N" counter for the rest.
 * Avatars are deterministic DiceBear thumbs (via {@link UserAvatar}); the stack
 * stays vertically centred within its row.
 */
export function AvatarStack({
  members,
  max = 8,
}: {
  members: StackMember[];
  max?: number;
}) {
  if (members.length === 0) return null;
  const shown = members.slice(0, max);
  const overflow = members.length - shown.length;
  return (
    <span
      className={styles.stack}
      aria-label={`${members.length} ${members.length === 1 ? "member" : "members"}`}
    >
      {shown.map((member) => (
        <UserAvatar
          key={member.id}
          seed={member.id}
          name={member.name}
          className={styles.avatar}
        />
      ))}
      {overflow > 0 && (
        <span className={`${styles.avatar} ${styles.counter}`}>+{overflow}</span>
      )}
    </span>
  );
}
