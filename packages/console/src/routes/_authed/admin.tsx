import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
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
 * mint a key for a User (raw key shown once) and ban a User behind a
 * {@link ConfirmBan} dialog. There is no per-key revoke UI today.
 *
 * The user list is a `useQuery`; create/mint/ban are `useMutation`s that each
 * invalidate the list query on success (`apiFetch` stays the transport). The
 * show-once secrets (`newPassword`, `mintedKey`) deliberately stay in local
 * component state — set from each mutation's RESULT, never put in the query
 * cache and never refetchable (you only get them back from the server once).
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

/** Centralized query key for the user list, reused by every mutation's invalidate. */
const adminKeys = {
  users: ["admin", "users"] as const,
};

function AdminPage() {
  const queryClient = useQueryClient();

  // The user list. Mutations invalidate this key on success to re-pull it.
  const usersQuery = useQuery({
    queryKey: adminKeys.users,
    queryFn: () =>
      apiFetch<{ users: UserRow[] }>("/api/admin/users").then((r) => r.users),
  });
  const users = usersQuery.data ?? [];

  // Show-once secrets, keyed by what they belong to. Set from a mutation's
  // RESULT (never the query cache); cleared by the admin once captured; never
  // refetchable — the server only ever hands these back once.
  const [newPassword, setNewPassword] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [mintedKey, setMintedKey] = useState<{
    email: string;
    key: string;
  } | null>(null);

  const [email, setEmail] = useState("");

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.users });

  // Create a User. The server returns a one-time password; capture it into local
  // state from the mutation result, then refresh the list.
  const createUser = useMutation({
    mutationFn: (newEmail: string) =>
      apiFetch<{ user: { id: string; email: string }; password: string }>(
        "/api/admin/users",
        { method: "POST", body: JSON.stringify({ email: newEmail }) },
      ),
    onSuccess: async (created) => {
      setNewPassword({ email: created.user.email, password: created.password });
      setMintedKey(null);
      setEmail("");
      await invalidateUsers();
    },
  });

  // Mint a key for a User. The raw key comes back once — capture it locally.
  const mintKey = useMutation({
    mutationFn: (user: UserRow) =>
      apiFetch<{ id: string; key: string }>(`/api/admin/users/${user.id}/keys`, {
        method: "POST",
      }),
    onSuccess: async ({ key }, user) => {
      setMintedKey({ email: user.email, key });
      setNewPassword(null);
      await invalidateUsers();
    },
  });

  const banUser = useMutation({
    mutationFn: (user: UserRow) =>
      apiFetch(`/api/admin/users/${user.id}/ban`, { method: "POST" }),
    onSuccess: () => invalidateUsers(),
  });

  // First failing operation, run through the same one-line describe() as before.
  const failure =
    usersQuery.error ??
    createUser.error ??
    mintKey.error ??
    banUser.error ??
    null;
  const error = failure ? describe(failure) : null;

  const busy = createUser.isPending;

  function onCreate(event: FormEvent) {
    event.preventDefault();
    createUser.mutate(email);
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
                  onClick={() => mintKey.mutate(user)}
                  disabled={user.banned}
                >
                  Mint key
                </button>
                {!user.banned && (
                  <ConfirmBan
                    email={user.email}
                    onConfirm={() => banUser.mutate(user)}
                  >
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
