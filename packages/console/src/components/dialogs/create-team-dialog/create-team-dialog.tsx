import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import styles from "../dialog.module.scss";
import admin from "../../../styles/dashboard.module.scss";

/**
 * The "Create team" action in the Teams heading: a small primary button that
 * opens a Radix Dialog holding the create-team form. Submitting calls
 * {@link onCreate} and closes the dialog once the mutation stops pending; an
 * error keeps it open so the message shows.
 */
export function CreateTeamDialog({
  onCreate,
  creating,
  error,
}: {
  onCreate: (name: string) => void;
  creating: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  // Track the in-flight submit so we close only after a create that succeeded
  // (creating went true → false with no error), not on the initial idle state.
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (submitted && !creating) {
      if (!error) {
        setOpen(false);
        setName("");
      }
      setSubmitted(false);
    }
  }, [submitted, creating, error]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim());
    setSubmitted(true);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={styles.trigger}>
        <Plus size={16} aria-hidden="true" />
        Create team
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>Create a team</Dialog.Title>
            <Dialog.Close className={styles.close} aria-label="Close">
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className={styles.description}>
            You are creating a new team. Each team has their own members and
            posts in an isolated database.
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
              placeholder="New team name"
              aria-label="New team name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className={admin.primary} type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create team"}
            </button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
