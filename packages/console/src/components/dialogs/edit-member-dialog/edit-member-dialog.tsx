import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, Plus, Settings, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import form from "../dialog-form.module.scss";
import dialog from "../dialog.module.scss";
import styles from "./edit-member-dialog.module.scss";

/** Safe api-key metadata as the admin listing returns it (never the secret). */
export type ApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  createdAt: string | null;
  lastRequest: string | null;
};

/**
 * The "Edit" action on a team member's row: opens a Radix Dialog showing the
 * member's name, email, and last activity, plus an API-keys section that lists
 * their keys with delete and mint-a-new-key (the same management that used to
 * live in the footer). A freshly minted key is shown once, inline. Shares the
 * create-team dialog styling.
 */
export function EditMemberDialog({
  name,
  email,
  keys,
  onRename,
  renaming,
  onResetPassword,
  resettingPassword,
  resetPassword,
  onMintKey,
  mintingKey,
  onRevokeKey,
  revokingKey,
  mintedKey,
  triggerClassName,
}: {
  name: string;
  email: string;
  keys: ApiKey[];
  onRename: (name: string) => void;
  renaming: boolean;
  /** Reset this member's password. Pass a value to set it, or omit to generate. */
  onResetPassword: (password?: string) => void;
  resettingPassword: boolean;
  /** Show-once plaintext of a password just reset for this member, else null. */
  resetPassword: string | null;
  onMintKey: () => void;
  mintingKey: boolean;
  onRevokeKey: (key: ApiKey) => void;
  revokingKey: boolean;
  /** Show-once secret for a key just minted for this member, else null. */
  mintedKey: string | null;
  /** Extra class on the trigger, e.g. to reveal it only on row hover. */
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [passwordDraft, setPasswordDraft] = useState("");

  // The most recent request across the member's keys, our "last activity".
  const lastRequest = keys
    .map((k) => k.lastRequest)
    .filter((r): r is string => Boolean(r))
    .sort()
    .at(-1);

  function onOpenChange(next: boolean) {
    if (next) {
      setNameDraft(name);
      setPasswordDraft("");
    }
    setOpen(next);
  }

  function onRenameSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === name) return;
    onRename(trimmed);
  }

  // A typed password too short to be accepted (better-auth's floor is 8); empty
  // is fine — the server auto-generates a strong one in that case.
  const passwordTooShort =
    passwordDraft.trim().length > 0 && passwordDraft.trim().length < 8;

  function onResetSubmit(event: FormEvent) {
    event.preventDefault();
    if (passwordTooShort) return;
    const trimmed = passwordDraft.trim();
    onResetPassword(trimmed || undefined);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger
        className={`${styles.editTrigger}${triggerClassName ? ` ${triggerClassName}` : ""}`}
        aria-label={`Edit ${name}`}
      >
        <Settings size={16} aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={dialog.overlay} />
        <Dialog.Content className={styles.viewport}>
          <div className={styles.card}>
            <div className={form.header}>
              <div className={form.headerText}>
                <Dialog.Title className={form.title}>{name}</Dialog.Title>
                <Dialog.Description className={form.subtitle}>
                  Manage this member's details and API keys.
                </Dialog.Description>
              </div>
              <Dialog.Close className={form.close} aria-label="Close">
                <X size={18} aria-hidden="true" />
              </Dialog.Close>
            </div>

            <div className={form.body}>
              <form className={styles.nameRow} onSubmit={onRenameSubmit}>
                <div className={styles.nameField}>
                  <label className={form.label} htmlFor="member-name">
                    Name
                  </label>
                  <input
                    id="member-name"
                    className={form.input}
                    type="text"
                    required
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className={`${form.btn} ${form.btnPrimary}`}
                  disabled={
                    renaming || !nameDraft.trim() || nameDraft.trim() === name
                  }
                >
                  {renaming ? "Saving…" : "Save"}
                </button>
              </form>

              <form className={styles.nameRow} onSubmit={onResetSubmit}>
                <div className={styles.nameField}>
                  <label className={form.label} htmlFor="member-password">
                    Password
                  </label>
                  <input
                    id="member-password"
                    className={form.input}
                    type="text"
                    autoComplete="off"
                    placeholder="Leave blank to auto-generate"
                    value={passwordDraft}
                    onChange={(e) => setPasswordDraft(e.target.value)}
                    aria-invalid={passwordTooShort || undefined}
                  />
                </div>
                <button
                  type="submit"
                  className={`${form.btn} ${form.btnPrimary}`}
                  disabled={resettingPassword || passwordTooShort}
                >
                  {resettingPassword ? "Resetting…" : "Reset"}
                </button>
              </form>

              <dl className={styles.detailList}>
                <div>
                  <dt>Email</dt>
                  <dd>{email}</dd>
                </div>
                <div>
                  <dt>Last activity</dt>
                  <dd>{formatActivity(lastRequest)}</dd>
                </div>
              </dl>

              <section className={styles.keysSection}>
                <div className={styles.keysHeader}>
                  <p className={styles.keysLabel}>API keys</p>
                  <button
                    type="button"
                    className={styles.newKeyBtn}
                    onClick={onMintKey}
                    disabled={mintingKey}
                  >
                    <Plus size={16} aria-hidden="true" />
                    New key
                  </button>
                </div>
              {keys.length === 0 ? (
                <p className={styles.keysEmpty}>No API keys yet.</p>
              ) : (
                <ul className={styles.keyList}>
                  {keys.map((key) => (
                    <li key={key.id} className={styles.keyRow}>
                      <span className={styles.keyName}>{key.name ?? "key"}</span>
                      <span className={styles.keyUsage}>
                        {lastUsed(key.lastRequest)}
                      </span>
                      <button
                        type="button"
                        className={styles.keyDelete}
                        onClick={() => onRevokeKey(key)}
                        disabled={revokingKey}
                        aria-label="Delete key"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              </section>
            </div>
          </div>

          {resetPassword && (
            <SecretBox
              secret={resetPassword}
              ariaLabel="New password — shown once, copy it now"
              copyLabel="password"
            />
          )}
          {mintedKey && (
            <SecretBox
              secret={mintedKey}
              ariaLabel="New API key — shown once, copy it now"
              copyLabel="API key"
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * A show-once secret (a minted key or a freshly reset password): a clean white
 * element below the card with the value and a small copy-icon button.
 */
function SecretBox({
  secret,
  ariaLabel,
  copyLabel,
}: {
  secret: string;
  ariaLabel: string;
  copyLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={styles.minted} role="group" aria-label={ariaLabel}>
      <code className={styles.mintedValue}>{secret}</code>
      <button
        type="button"
        className={styles.mintedCopy}
        onClick={onCopy}
        aria-label={copied ? "Copied" : `Copy ${copyLabel}`}
      >
        {copied ? (
          <Check size={16} aria-hidden="true" />
        ) : (
          <Copy size={16} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/** An absolute "last activity" timestamp, or a fallback when never used. */
function formatActivity(iso: string | undefined): string {
  if (!iso) return "No activity yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No activity yet";
  return date.toLocaleString();
}

/** A short relative "last used" phrase for a key's `lastRequest`. */
function lastUsed(iso: string | null): string {
  if (!iso) return "never used";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never used";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "used just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `used ${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `used ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `used ${days}d ago`;
}
