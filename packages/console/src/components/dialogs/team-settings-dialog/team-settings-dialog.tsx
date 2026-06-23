import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  ChevronDown,
  Plus,
  Settings,
  Trash2,
  X,
} from "lucide-react";
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
  intakeDomains,
  onSaveDomains,
  savingDomains,
  onDelete,
  deleting,
  canDelete,
  deleteDisabledReason,
}: {
  teamName: string;
  onRename: (name: string, opts?: { onSuccess?: () => void }) => void;
  renaming: boolean;
  error: string | null;
  /** The git hosts this team accepts Posts from; empty means accept all. */
  intakeDomains: string[];
  /** Persist a new allowlist. The dialog stays open so edits read as a draft. */
  onSaveDomains: (domains: string[]) => void;
  savingDomains: boolean;
  onDelete: () => void;
  deleting: boolean;
  canDelete: boolean;
  /** Why deletion is unavailable, shown when {@link canDelete} is false. */
  deleteDisabledReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(teamName);
  // A working copy of the allowlist plus the add-input draft, both reset on open.
  const [domains, setDomains] = useState(intakeDomains);
  const [domainDraft, setDomainDraft] = useState("");
  // The danger disclosure and its two-step confirm, both reset when reopened.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function onOpenChange(next: boolean) {
    if (next) {
      setName(teamName);
      setDomains(intakeDomains);
      setDomainDraft("");
    } else {
      setDrawerOpen(false);
      setConfirming(false);
    }
    setOpen(next);
  }

  function addDomain() {
    const entry = domainDraft.trim().toLowerCase();
    if (!entry || domains.includes(entry)) {
      setDomainDraft("");
      return;
    }
    setDomains([...domains, entry]);
    setDomainDraft("");
  }

  function removeDomain(entry: string) {
    setDomains(domains.filter((d) => d !== entry));
  }

  // Order-insensitive comparison so re-saving the same set reads as clean.
  const domainsDirty =
    domains.length !== intakeDomains.length ||
    domains.some((d) => !intakeDomains.includes(d));

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

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Intake domains</h3>
              <p className={styles.heroHint}>
                Only Posts from these git hosts are accepted into the team's
                knowledge — anything else (e.g. personal projects) is rejected at
                intake. Leave empty to accept all.
              </p>

              {domains.length > 0 && (
                <div className={styles.chips}>
                  {domains.map((domain) => (
                    <span key={domain} className={styles.chip}>
                      {domain}
                      <button
                        type="button"
                        className={styles.chipRemove}
                        onClick={() => removeDomain(domain)}
                        aria-label={`Remove ${domain}`}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className={styles.domainRow}>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="git.indicia.nl"
                  value={domainDraft}
                  onChange={(e) => setDomainDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDomain();
                    }
                  }}
                />
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={addDomain}
                  disabled={!domainDraft.trim()}
                >
                  <Plus size={15} aria-hidden="true" /> Add
                </button>
              </div>

              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`}
                style={{ marginTop: "0.75rem" }}
                onClick={() => onSaveDomains(domains)}
                disabled={!domainsDirty || savingDomains}
              >
                {savingDomains ? "Saving…" : "Save intake domains"}
              </button>
            </section>

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
