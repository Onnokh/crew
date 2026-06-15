import * as AlertDialog from "@radix-ui/react-alert-dialog";
import styles from "./ConfirmBan.module.scss";

/**
 * The destructive-action guard for banning a User (issue 0012). A ban kills the
 * User's login and revokes every api key they hold — irreversible from this
 * console — so a Radix `AlertDialog` interrupts with an explicit confirm before
 * `onConfirm` fires. The trigger is the page's own "Ban" button, passed in as
 * `children`; the dialog owns nothing but the confirmation.
 */
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
