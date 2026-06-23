import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, ChevronDown, Settings, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import base from "../dialog.module.scss";
import styles from "../dialog-form.module.scss";

/**
 * The "Settings" action in the team-detail heading: a Radix Dialog with one
 * prominent rename form and the destructive delete tucked behind a "Danger zone"
 * disclosure, so renaming reads as the primary action and deleting is something
 * you have to reach for.
 *
 * Saving calls {@link onRename} and closes the dialog from the mutation's own
 * success callback; an error never fires it, so the dialog stays open to show the
 * message. The field resets to {@link teamName} whenever the dialog (re)opens.
 * Deletion is two-step (a confirm row guards the
 * click) and only offered when {@link canDelete}; otherwise the reason is shown.
 * On a successful delete the page navigates away, so the dialog need not close.
 */
export function TeamSettingsDialog({
  teamName,
  onRename,
  renaming,
  error,
  onDelete,
  deleting,
  canDelete,
  deleteDisabledReason,
}: {
  teamName: string;
  onRename: (name: string, opts?: { onSuccess?: () => void }) => void;
  renaming: boolean;
  error: string | null;
  onDelete: () => void;
  deleting: boolean;
  canDelete: boolean;
  /** Why deletion is unavailable, shown when {@link canDelete} is false. */
  deleteDisabledReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(teamName);
  // The danger disclosure and its two-step confirm, both reset when reopened.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) {
      setName(teamName);
    } else {
      setDrawerOpen(false);
      setConfirming(false);
    }
    setOpen(next);
  }

  const dirty = name.trim() !== "" && name.trim() !== teamName;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dirty) return;
    onRename(name.trim(), { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger className={base.trigger}>
        <Settings size={16} aria-hidden="true" />
        Settings
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={base.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <div className={styles.headerText}>
              <Dialog.Title className={styles.title}>Team settings</Dialog.Title>
              <Dialog.Description className={styles.subtitle}>
                Renaming affects everyone on the team.
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

          <div className={styles.body}>
            <form className={styles.hero} onSubmit={onSubmit}>
              <div>
                <label className={styles.label} htmlFor="team-name">
                  Team name
                </label>
                <input
                  id="team-name"
                  className={styles.input}
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <p className={styles.heroHint}>
                This is how the team appears across the console.
              </p>
              <button
                type="submit"
                className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`}
                disabled={!dirty || renaming}
              >
                {renaming ? "Saving…" : "Save changes"}
              </button>
            </form>

            <div className={styles.disclosure}>
              <button
                type="button"
                className={styles.disclosureToggle}
                onClick={() => setDrawerOpen((v) => !v)}
                aria-expanded={drawerOpen}
              >
                <span>Danger zone</span>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={`${styles.chevron} ${drawerOpen ? styles.chevronOpen : ""}`}
                />
              </button>
              {drawerOpen && (
                <div className={styles.drawer}>
                  <p className={styles.drawerHint}>
                    Permanently deletes this team and its corpus database. This
                    cannot be undone.
                  </p>
                  {!canDelete ? (
                    <span className={styles.disabledHint}>
                      <AlertTriangle size={14} aria-hidden="true" />
                      {deleteDisabledReason ?? "This team cannot be deleted."}
                    </span>
                  ) : confirming ? (
                    <div className={styles.confirmRow}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnGhost}`}
                        onClick={() => setConfirming(false)}
                        disabled={deleting}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnDangerSolid}`}
                        onClick={onDelete}
                        disabled={deleting}
                      >
                        {deleting ? "Deleting…" : "Yes, delete this team"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnDanger}`}
                      onClick={() => setConfirming(true)}
                    >
                      <Trash2 size={15} aria-hidden="true" /> Delete team
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
