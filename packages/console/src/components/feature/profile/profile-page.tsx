import { useState, type FormEvent } from "react";
import { ApiKeysSection } from "../../account/api-keys-section";
import { avatarUrl } from "../../ui/user-avatar/user-avatar";
import { useProfileData } from "../../../hooks/use-profile-data";
import shared from "../../../styles/dashboard.module.scss";
import account from "../../account/account.module.scss";

/**
 * The self-service profile page (`/profile`), reachable by any signed-in User.
 * Shows identity read-only (name is admin-controlled; ADR 0010), lets the User
 * change their own password (current + new), and manage their own API keys.
 */
export function ProfilePage() {
  const { profile, loading, error, passwordChanged, mintedKey, actions, pending } =
    useProfileData();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  // better-auth's floor is 8; empty/short new password can't be submitted.
  const tooShort = next.trim().length > 0 && next.trim().length < 8;
  const canSubmit = current.length > 0 && next.trim().length >= 8;

  function onChangePassword(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    actions.changePassword(
      { currentPassword: current, newPassword: next.trim() },
      {
        onSuccess: () => {
          setCurrent("");
          setNext("");
        },
      },
    );
  }

  return (
    <section className={shared.usagePage}>
      {error && (
        <p className={shared.error} role="alert">
          {error}
        </p>
      )}

      <section className={shared.usageSection}>
        <div className={account.profileCard}>
          <img
            className={account.profileAvatar}
            src={avatarUrl(profile?.id ?? profile?.email ?? "profile")}
            alt=""
            width={72}
            height={72}
          />
          <p className={account.profileName}>{loading ? "—" : (profile?.name ?? "—")}</p>
          <p className={account.profileEmail}>{loading ? "—" : (profile?.email ?? "—")}</p>
          <p className={account.profileTeam}>{loading ? "—" : (profile?.teamName ?? "—")}</p>
        </div>
      </section>

      <section className={shared.usageSection}>
        <h2>Password</h2>
        <form className={account.form} onSubmit={onChangePassword}>
          <div className={account.field}>
            <label className={account.label} htmlFor="current-password">
              Current password
            </label>
            <input
              id="current-password"
              className={account.input}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className={account.field}>
            <label className={account.label} htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              className={account.input}
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-invalid={tooShort || undefined}
            />
          </div>
          <button
            type="submit"
            className={`${account.btn} ${account.btnPrimary}`}
            disabled={pending.changingPassword || !canSubmit}
          >
            {pending.changingPassword ? "Saving…" : "Change"}
          </button>
        </form>
        {passwordChanged && (
          <p className={account.keysEmpty}>Password changed.</p>
        )}
      </section>

      <section className={shared.usageSection}>
        <ApiKeysSection
          keys={profile?.keys ?? []}
          onMint={actions.mintKey}
          minting={pending.mintingKey}
          onRevoke={actions.revokeKey}
          revoking={pending.revokingKey}
          mintedKey={mintedKey}
        />
      </section>
    </section>
  );
}
