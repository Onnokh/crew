import { useState, type FormEvent } from "react";
import { ApiKeysSection, type ApiKey } from "../../account/api-keys-section";
import { CopyBox } from "../../ui/copy-box/copy-box";
import { PageHeading } from "../../ui/page-heading/page-heading";
import shared from "../../../styles/dashboard.module.scss";
import account from "../../account/account.module.scss";

/**
 * The admin user page (`/dashboard/users/$userId`), the full-page replacement
 * for the old Edit-member dialog. An admin renames the User, resets their
 * password (generate or set, shown once), manages their API keys, and — in a
 * danger zone — deletes the User (the single off-switch; CONTEXT.md / ADR 0008).
 * Purely presentational: every action and secret is handed in by the layout.
 */
export function UserDetailDashboard({
  name,
  email,
  teamName,
  keys,
  onRename,
  renaming,
  onResetPassword,
  resettingPassword,
  resetPassword,
  onMintKey,
  mintingKey,
  mintedKey,
  onRevokeKey,
  revokingKey,
  onDelete,
  deleting,
}: {
  name: string;
  email: string;
  teamName: string | null;
  keys: ApiKey[];
  onRename: (name: string) => void;
  renaming: boolean;
  /** Reset this User's password. Pass a value to set it, or omit to generate. */
  onResetPassword: (password?: string) => void;
  resettingPassword: boolean;
  /** Show-once plaintext of a password just reset for this User, else null. */
  resetPassword: string | null;
  onMintKey: () => void;
  mintingKey: boolean;
  /** Show-once secret for a key just minted for this User, else null. */
  mintedKey: string | null;
  onRevokeKey: (key: ApiKey) => void;
  revokingKey: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [nameDraft, setNameDraft] = useState(name);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const passwordTooShort =
    passwordDraft.trim().length > 0 && passwordDraft.trim().length < 8;

  function onRenameSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === name) return;
    onRename(trimmed);
  }

  function onResetSubmit(event: FormEvent) {
    event.preventDefault();
    if (passwordTooShort) return;
    onResetPassword(passwordDraft.trim() || undefined);
  }

  return (
    <section className={shared.usagePage}>
      <PageHeading title={name} subtitle="Manage this member's account and API keys." />

      <section className={shared.usageSection}>
        <dl className={account.detailList}>
          <dt>Email</dt>
          <dd>{email}</dd>
          <dt>Team</dt>
          <dd>{teamName ?? "—"}</dd>
        </dl>
      </section>

      <section className={shared.usageSection}>
        <h2>Name</h2>
        <form className={account.form} onSubmit={onRenameSubmit}>
          <div className={account.field}>
            <label className={account.label} htmlFor="user-name">
              Display name
            </label>
            <input
              id="user-name"
              className={account.input}
              type="text"
              required
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className={`${account.btn} ${account.btnPrimary}`}
            disabled={renaming || !nameDraft.trim() || nameDraft.trim() === name}
          >
            {renaming ? "Saving…" : "Save"}
          </button>
        </form>
      </section>

      <section className={shared.usageSection}>
        <h2>Password</h2>
        <form className={account.form} onSubmit={onResetSubmit}>
          <div className={account.field}>
            <label className={account.label} htmlFor="user-password">
              Reset password
            </label>
            <input
              id="user-password"
              className={account.input}
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
            className={`${account.btn} ${account.btnPrimary}`}
            disabled={resettingPassword || passwordTooShort}
          >
            {resettingPassword ? "Resetting…" : "Reset"}
          </button>
        </form>
        {resetPassword && (
          <div className={account.secretSlot}>
            <CopyBox label="New password" secret={resetPassword} />
          </div>
        )}
      </section>

      <section className={shared.usageSection}>
        <ApiKeysSection
          keys={keys}
          onMint={onMintKey}
          minting={mintingKey}
          onRevoke={onRevokeKey}
          revoking={revokingKey}
          mintedKey={mintedKey}
        />
      </section>

      <section className={shared.usageSection}>
        <h2>Danger zone</h2>
        <div className={account.dangerZone}>
          <span className={account.dangerText}>
            <strong>Delete this user</strong>
            <span>
              Revokes their login and API keys. Past Posts and votes stay in the
              corpus but render as an unknown author. This cannot be undone.
            </span>
          </span>
          {confirmingDelete ? (
            <span style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className={account.btn}
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${account.btn} ${account.btnDanger}`}
                onClick={onDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Confirm delete"}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className={`${account.btn} ${account.btnDanger}`}
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          )}
        </div>
      </section>
    </section>
  );
}
