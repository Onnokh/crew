import * as AlertDialog from "@radix-ui/react-alert-dialog";
import styles from "./confirm-ban.module.scss";

/** Confirmation guard for the irreversible ban action; `children` is the trigger button. */
export function ConfirmBan({
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
            Ban {email}?
          </AlertDialog.Title>
          <AlertDialog.Description className={styles.description}>
            This blocks their sign-in and revokes every API key they hold, so any
            agent acting as them stops immediately. Their past Posts stay
            attributed. This cannot be undone here.
          </AlertDialog.Description>
          <div className={styles.actions}>
            <AlertDialog.Cancel className={styles.cancel}>
              Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action className={styles.confirm} onClick={onConfirm}>
              Ban User
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
