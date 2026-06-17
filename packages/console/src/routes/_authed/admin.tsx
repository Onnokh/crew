import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ApiError, apiFetch } from "../../api/client";
import { authClient } from "../../auth/client";
import { ConfirmBan } from "../../components/confirm-ban/confirm-ban";
import { CopyBox } from "../../components/ui/copy-box/copy-box";
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
 * password, shown in a {@link CopyBox}); list Users with role + their active api
 * keys (label, last-used, with a per-key Delete); add a key for a User (raw key
 * shown once) and ban a User behind a {@link ConfirmBan} dialog.
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
      throw redirect({ to: "/" });
    }
  },
  component: AdminPage,
});

/** Safe api-key metadata as the listing returns it (never the secret itself). */
type ApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  createdAt: string | null;
  lastRequest: string | null;
};

/** A User row as the listing endpoint returns it (the wire is the type boundary). */
type UserRow = {
  id: string;
  email: string;
  role: string | null;
  banned: boolean;
  keys: ApiKey[];
};

/** Centralized query key for the user list, reused by every mutation's invalidate. */
const adminKeys = {
  users: ["admin", "users"] as const,
};

function AdminPage() {
  const queryClient = useQueryClient();

  // The user list. Mutations invalidate this key on success to re-pull it.
  const { data: usersData, error: usersError } = useQuery({
    queryKey: adminKeys.users,
    queryFn: () =>
      apiFetch<{ users: UserRow[] }>("/api/admin/users").then((r) => r.users),
  });
  const users = usersData ?? [];

  // Show-once secrets, keyed by the User id they belong to so each renders
  // inline in that User's row (never refetchable — the server hands them back
  // exactly once, so this row is the one chance to copy them). Set from a
  // mutation's RESULT, never from the query cache.
  const [newPassword, setNewPassword] = useState<{
    userId: string;
    email: string;
    password: string;
  } | null>(null);
  const [mintedKey, setMintedKey] = useState<{
    userId: string;
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
      setNewPassword({
        userId: created.user.id,
        email: created.user.email,
        password: created.password,
      });
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
      setMintedKey({ userId: user.id, key });
      setNewPassword(null);
      await invalidateUsers();
    },
  });

  // Revoke a single key by id (the deleted row stops verifying immediately).
  const revokeKey = useMutation({
    mutationFn: (key: ApiKey) =>
      apiFetch(`/api/admin/keys/${key.id}`, { method: "DELETE" }),
    onSuccess: () => invalidateUsers(),
  });

  const banUser = useMutation({
    mutationFn: (user: UserRow) =>
      apiFetch(`/api/admin/users/${user.id}/ban`, { method: "POST" }),
    onSuccess: () => invalidateUsers(),
  });

  // First failing operation, run through the same one-line describe() as before.
  const failure =
    usersError ??
    createUser.error ??
    mintKey.error ??
    revokeKey.error ??
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
      <header className={styles.head}>
        <p className={styles.eyebrow}>User management</p>
        <h1 className={styles.heading}>Admin</h1>
        <p className={styles.subtitle}>
          Manage Users and the API keys their agents authenticate with.
        </p>
      </header>

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

      <p className={styles.listLabel}>Users</p>
      <ul className={styles.list}>
        {users.map((user) => (
          <li key={user.id} className={styles.row}>
            <div className={styles.rowMain}>
              <div className={styles.identity}>
                <span className={styles.email}>{user.email}</span>
                <span className={styles.role}>/ {user.role ?? "user"}</span>
                {user.banned && <span className={styles.banned}>banned</span>}
              </div>
              <span className={styles.keys}>
                {user.keys.length} {user.keys.length === 1 ? "key" : "keys"}
              </span>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => mintKey.mutate(user)}
                  disabled={user.banned || mintKey.isPending}
                >
                  Add key
                </button>
                {!user.banned && (
                  <ConfirmBan
                    email={user.email}
                    onConfirm={() => banUser.mutate(user)}
                  >
                    <button type="button" className={styles.actionDanger}>
                      Ban
                    </button>
                  </ConfirmBan>
                )}
              </div>
            </div>
            {newPassword?.userId === user.id && (
              <CopyBox label="Password" secret={newPassword.password} />
            )}
            {mintedKey?.userId === user.id && (
              <CopyBox label="API key" secret={mintedKey.key} />
            )}
            {user.keys.length > 0 && (
              <ul className={styles.keyList}>
                {user.keys.map((key) => (
                  <li key={key.id} className={styles.keyRow}>
                    <code className={styles.keyName}>
                      {key.name ?? "key"}
                      {key.start && (
                        <span className={styles.keyStart}>{key.start}…</span>
                      )}
                    </code>
                    <span className={styles.keyUsage}>{lastUsed(key.lastRequest)}</span>
                    <button
                      type="button"
                      className={styles.actionDanger}
                      onClick={() => revokeKey.mutate(key)}
                      disabled={revokeKey.isPending}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A short "last used" phrase for a key's `lastRequest` (null = never verified). */
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

/** Turn an {@link ApiError} (or anything thrown) into a one-line page message. */
function describe(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Admin role required.";
    return `Request failed (${err.status}).`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
