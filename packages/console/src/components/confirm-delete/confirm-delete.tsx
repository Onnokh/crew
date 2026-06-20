import * as AlertDialog from "@radix-ui/react-alert-dialog";
import styles from "./confirm-delete.module.scss";

/**
 * Confirmation guard for the irreversible delete-User action; `children` is the
 * trigger button. Deleting is the single off-switch: it revokes the User's login
 * and every key, removes the identity, and frees the email for reuse. Past Posts
 * stay in the corpus but render as an unknown author. This cannot be undone.
 */
export function ConfirmDelete({
  email,
  onConfirm,
  children,
}: {
  email: string;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{children}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={styles.overlay} />
        <AlertDialog.Content className={styles.content}>
          <AlertDialog.Title className={styles.title}>
            Delete {email}?
          </AlertDialog.Title>
          <AlertDialog.Description className={styles.description}>
            This revokes their sign-in and every API key they hold, so any agent
            acting as them stops immediately, and removes their identity. Their
            past Posts stay in the corpus but render as an unknown author. The
            email frees up for reuse. This is irreversible.
          </AlertDialog.Description>
          <div className={styles.actions}>
            <AlertDialog.Cancel className={styles.cancel}>
              Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action className={styles.confirm} onClick={onConfirm}>
              Delete User
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
