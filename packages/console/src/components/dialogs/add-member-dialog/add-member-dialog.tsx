import * as Dialog from "@radix-ui/react-dialog";
import { UserPlus, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import styles from "../dialog.module.scss";
import admin from "../../../styles/dashboard.module.scss";

/**
 * The "Add member" action next to the team-detail Members heading: a small button
 * that opens a Radix Dialog holding the add-member form (name + email).
 * Submitting calls {@link onAdd} and closes once the mutation stops pending; an
 * error keeps it open so the message shows. Shares the create-team dialog styling.
 */
export function AddMemberDialog({
  onAdd,
  adding,
  error,
}: {
  onAdd: (name: string, email: string) => void;
  adding: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Track the in-flight submit so we close only after an add that succeeded
  // (adding went true → false with no error), not on the initial idle state.
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (submitted && !adding) {
      if (!error) {
        setOpen(false);
        setName("");
        setEmail("");
      }
      setSubmitted(false);
    }
  }, [submitted, adding, error]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail) return;
    onAdd(trimmedName, trimmedEmail);
    setSubmitted(true);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={styles.trigger}>
        <UserPlus size={16} aria-hidden="true" />
        Add member
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>Add a member</Dialog.Title>
            <Dialog.Close className={styles.close} aria-label="Close">
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className={styles.description}>
            Invite a user to this team by name and email. They'll be provisioned
            in this team's workspace.
          </Dialog.Description>
          {error && (
            <p className={admin.error} role="alert">
              {error}
            </p>
          )}
          <form className={styles.form} onSubmit={onSubmit}>
            <input
              className={admin.input}
              type="text"
              placeholder="Full name"
              aria-label="New member name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className={admin.input}
              type="email"
              placeholder="new.user@team.local"
              aria-label="New member email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className={styles.actions}>
              <Dialog.Close className={admin.secondary} type="button">
                Cancel
              </Dialog.Close>
              <button className={admin.primary} type="submit" disabled={adding}>
                {adding ? "Adding…" : "Add member"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
