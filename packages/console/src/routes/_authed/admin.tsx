import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "../../api/client";
import { authClient } from "../../auth/client";
import { ConfirmBan } from "../../components/ConfirmBan";
import { CopyBox } from "../../components/CopyBox";
import styles from "./admin.module.scss";

/**
 * The admin user-management page (issue 0012), backed by the role-gated
 * `/api/admin/*` JSON API. The signed-in guard already runs in the parent
 * `_authed` layout; this route adds the stricter ADMIN-role check in
 * `beforeLoad`, reading `role` off the better-auth session and bouncing any
 * non-admin to `/review` (the server gates the API too — this is just so a
 * non-admin never sees the page chrome).
 *
 * Capabilities: create a User from an email (server returns a one-time
 * password, shown in a {@link CopyBox}); list Users with role + api-key count;
 * mint a key for a User (raw key shown once) and revoke an individual key; ban a
 * User behind a {@link ConfirmBan} dialog. Show-once secrets live only in this
 * component's state — they are never refetched.
 */
export const Route = createFileRoute("/_authed/admin")({
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    // `role` is the admin plugin's field on the User (see ADR 0003). The shared
    // `authClient` is built without the admin *client* plugin, so the inferred
    // session type omits it; we read it through a narrow local shape rather than
    // widening the shared client (which other pages depend on). The server gates
    // the API regardless — this bounce is only so a non-admin never sees the page.
    const role = (data?.user as { role?: string | null } | undefined)?.role;
    if (role !== "admin") {
      throw redirect({ to: "/review" });
    }
  },
  component: AdminPage,
});

/** A User row as the listing endpoint returns it (the wire is the type boundary). */
type UserRow = {
  id: string;
  email: string;
  role: string | null;
  banned: boolean;
  keyCount: number;
};

function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Show-once secrets, keyed by what they belong to. Cleared by the admin once
  // captured; never refetchable.
  const [newPassword, setNewPassword] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [mintedKey, setMintedKey] = useState<{
    email: string;
    key: string;
  } | null>(null);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { users } = await apiFetch<{ users: UserRow[] }>("/api/admin/users");
      setUsers(users);
    } catch (err) {
      setError(describe(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await apiFetch<{
        user: { id: string; email: string };
        password: string;
      }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setNewPassword({ email: created.user.email, password: created.password });
      setMintedKey(null);
      setEmail("");
      await refresh();
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  async function onMintKey(user: UserRow) {
    setError(null);
    try {
      const { key } = await apiFetch<{ id: string; key: string }>(
        `/api/admin/users/${user.id}/keys`,
        { method: "POST" },
      );
      setMintedKey({ email: user.email, key });
      setNewPassword(null);
      await refresh();
    } catch (err) {
      setError(describe(err));
    }
  }

  async function onBan(user: UserRow) {
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${user.id}/ban`, { method: "POST" });
      await refresh();
    } catch (err) {
      setError(describe(err));
    }
  }

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>Admin</h1>
      <p className={styles.subtitle}>
        Manage Users and the API keys their agents authenticate with.
      </p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <form className={styles.create} onSubmit={onCreate}>
        <input
          className={styles.input}
          type="email"
          placeholder="new.user@team.local"
          aria-label="New User email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className={styles.primary} type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create User"}
        </button>
      </form>

      {newPassword && (
        <CopyBox
          label={`Password for ${newPassword.email}`}
          secret={newPassword.password}
        />
      )}
      {mintedKey && (
        <CopyBox label={`API key for ${mintedKey.email}`} secret={mintedKey.key} />
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th className={styles.numeric}>API keys</th>
            <th className={styles.actionsCol}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                {user.email}
                {user.banned && <span className={styles.banned}>banned</span>}
              </td>
              <td>{user.role ?? "user"}</td>
              <td className={styles.numeric}>{user.keyCount}</td>
              <td className={styles.actionsCol}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => onMintKey(user)}
                  disabled={user.banned}
                >
                  Mint key
                </button>
                {!user.banned && (
                  <ConfirmBan email={user.email} onConfirm={() => onBan(user)}>
                    <button type="button" className={styles.danger}>
                      Ban
                    </button>
                  </ConfirmBan>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Turn an {@link ApiError} (or anything thrown) into a one-line page message. */
function describe(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Admin role required.";
    return `Request failed (${err.status}).`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
