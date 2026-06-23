import * as Dialog from "@radix-ui/react-dialog";
import { UserPlus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import base from "../dialog.module.scss";
import styles from "../dialog-form.module.scss";

/**
 * The "Add member" action next to the team-detail Members heading: a small button
 * that opens a Radix Dialog holding the add-member form (name + email).
 * Submitting calls {@link onAdd} and closes the dialog from the mutation's own
 * success callback; an error never fires it, so the dialog stays open to show the
 * message. Uses the shared dialog design system.
 */
export function AddMemberDialog({
  onAdd,
  adding,
  error,
}: {
  onAdd: (
    name: string,
    email: string,
    opts?: { onSuccess?: () => void },
  ) => void;
  adding: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail) return;
    onAdd(trimmedName, trimmedEmail, {
      onSuccess: () => {
        setOpen(false);
        setName("");
        setEmail("");
      },
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={base.trigger}>
        <UserPlus size={16} aria-hidden="true" />
        Add member
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={base.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <div className={styles.headerText}>
              <Dialog.Title className={styles.title}>Add a member</Dialog.Title>
              <Dialog.Description className={styles.subtitle}>
                Invite a user to this team by name and email. They'll be
                provisioned in this team's workspace.
              </Dialog.Description>
            </div>
            <Dialog.Close className={styles.close} aria-label="Close">
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </div>

          {error && (
            <p className={styles.errorBanner} role="alert">
              {error}
            </p>
          )}

          <form className={styles.body} onSubmit={onSubmit}>
            <div className={styles.fields}>
              <div>
                <label className={styles.label} htmlFor="member-name">
                  Full name
                </label>
                <input
                  id="member-name"
                  className={styles.input}
                  type="text"
                  placeholder="Ada Lovelace"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className={styles.label} htmlFor="member-email">
                  Email
                </label>
                <input
                  id="member-email"
                  className={styles.input}
                  type="email"
                  placeholder="new.user@team.local"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.actions}>
              <Dialog.Close className={`${styles.btn} ${styles.btnGhost}`} type="button">
                Cancel
              </Dialog.Close>
              <button
                className={`${styles.btn} ${styles.btnPrimary}`}
                type="submit"
                disabled={adding}
              >
                {adding ? "Adding…" : "Add member"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
