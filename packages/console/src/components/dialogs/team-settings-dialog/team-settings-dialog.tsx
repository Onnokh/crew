import * as Dialog from "@radix-ui/react-dialog";
import { Settings, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import styles from "../dialog.module.scss";
import admin from "../../../styles/dashboard.module.scss";

/**
 * The "Settings" action in the team-detail heading: a small button that opens a
 * Radix Dialog holding this team's global settings. For now that's just the team
 * name, prefilled and editable. Saving calls {@link onRename} and closes once the
 * mutation stops pending; an error keeps it open so the message shows. The field
 * resets to {@link teamName} whenever the dialog (re)opens.
 */
export function TeamSettingsDialog({
  teamName,
  onRename,
  renaming,
  error,
}: {
  teamName: string;
  onRename: (name: string) => void;
  renaming: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(teamName);
  // Track the in-flight save so we close only after a rename that succeeded
  // (renaming went true → false with no error), not on the initial idle state.
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (submitted && !renaming) {
      if (!error) setOpen(false);
      setSubmitted(false);
    }
  }, [submitted, renaming, error]);

  function onOpenChange(next: boolean) {
    if (next) setName(teamName);
    setOpen(next);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === teamName) return;
    onRename(trimmed);
    setSubmitted(true);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger className={styles.trigger}>
        <Settings size={16} aria-hidden="true" />
        Settings
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>Team settings</Dialog.Title>
            <Dialog.Close className={styles.close} aria-label="Close">
              <X size={18} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className={styles.description}>
            Manage this team's global settings. Renaming affects everyone on the
            team.
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
              placeholder="Team name"
              aria-label="Team name"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className={styles.actions}>
              <Dialog.Close className={admin.secondary} type="button">
                Cancel
              </Dialog.Close>
              <button
                className={admin.primary}
                type="submit"
                disabled={renaming || name.trim() === teamName}
              >
                {renaming ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
