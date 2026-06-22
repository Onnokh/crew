import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, apiFetch } from "../api/client";

/** Safe api-key metadata as the listing returns it (never the secret itself). */
export type ApiKey = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  createdAt: string | null;
  lastRequest: string | null;
};

/** A User row as the listing endpoint returns it. */
export type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  /** The Team this User belongs to (its single Membership), or null if unbound. */
  teamId: string | null;
  teamName: string | null;
  keys: ApiKey[];
};

/** A Team row as the listing endpoint returns it. */
export type TeamRow = {
  id: string;
  name: string;
  createdAt: number;
};

export type AdminActions = {
  createUser: (vars: { name: string; email: string; teamId: string }) => void;
  renameUser: (vars: { id: string; name: string }) => void;
  mintKey: (user: UserRow) => void;
  revokeKey: (key: ApiKey) => void;
  createTeam: (name: string) => void;
  renameTeam: (vars: { id: string; name: string }) => void;
};

export type AdminMutationState = {
  creatingUser: boolean;
  renamingUser: boolean;
  mintingKey: boolean;
  revokingKey: boolean;
  creatingTeam: boolean;
  renamingTeam: boolean;
};

export type AdminSecrets = {
  newPassword: { userId: string; email: string; password: string } | null;
  mintedKey: { userId: string; key: string } | null;
};

/** The full admin data layer: lists, mutation actions, pending flags, secrets. */
export type AdminData = {
  users: UserRow[];
  teams: TeamRow[];
  error: string | null;
  teamError: string | null;
  actions: AdminActions;
  pending: AdminMutationState;
  secrets: AdminSecrets;
};

/** Centralized query keys, reused by every mutation's invalidate. */
const adminKeys = {
  users: ["admin", "users"] as const,
  teams: ["admin", "teams"] as const,
};

/**
 * The admin console's data layer: fetches the user/team lists and exposes every
 * mutation (create/rename user, mint/revoke key, create/rename team) plus the
 * show-once secrets and a single aggregated error message per concern. Keeping
 * this in a hook lets the layout stay presentational.
 */
export function useAdminData(): AdminData {
  const queryClient = useQueryClient();

  const { data: usersData, error: usersError } = useQuery({
    queryKey: adminKeys.users,
    queryFn: () =>
      apiFetch<{ users: UserRow[] }>("/api/admin/users").then((r) => r.users),
  });
  const users = usersData ?? [];

  const { data: teamsData, error: teamsError } = useQuery({
    queryKey: adminKeys.teams,
    queryFn: () =>
      apiFetch<{ teams: TeamRow[] }>("/api/admin/teams").then((r) => r.teams),
  });
  const teams = teamsData ?? [];

  // Show-once secrets, keyed by User id. Set from a mutation result, never the
  // query cache — the server returns them exactly once.
  const [newPassword, setNewPassword] = useState<{
    userId: string;
    email: string;
    password: string;
  } | null>(null);
  const [mintedKey, setMintedKey] = useState<{
    userId: string;
    key: string;
  } | null>(null);

  const invalidateUsers = () =>
    queryClient.invalidateQueries({ queryKey: adminKeys.users });

  const createUser = useMutation({
    mutationFn: (vars: { name: string; email: string; teamId: string }) =>
      apiFetch<{ user: { id: string; email: string }; password: string }>(
        "/api/admin/users",
        {
          method: "POST",
          body: JSON.stringify({
            name: vars.name,
            email: vars.email,
            // Omit when empty so the server applies its default-Team fallback.
            ...(vars.teamId ? { teamId: vars.teamId } : {}),
          }),
        },
      ),
    onSuccess: async (created) => {
      setNewPassword({
        userId: created.user.id,
        email: created.user.email,
        password: created.password,
      });
      setMintedKey(null);
      await invalidateUsers();
    },
  });

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

  const revokeKey = useMutation({
    mutationFn: (key: ApiKey) =>
      apiFetch(`/api/admin/keys/${key.id}`, { method: "DELETE" }),
    onSuccess: () => invalidateUsers(),
  });

  const renameUser = useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      apiFetch(`/api/admin/users/${vars.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: vars.name }),
      }),
    onSuccess: () => invalidateUsers(),
  });

  const createTeam = useMutation({
    mutationFn: (newName: string) =>
      apiFetch<{ team: TeamRow }>("/api/admin/teams", {
        method: "POST",
        body: JSON.stringify({ name: newName }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: adminKeys.teams }),
  });

  const renameTeam = useMutation({
    mutationFn: (vars: { id: string; name: string }) =>
      apiFetch<{ team: TeamRow }>(`/api/admin/teams/${vars.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: vars.name }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminKeys.teams }),
        queryClient.invalidateQueries({ queryKey: adminKeys.users }),
      ]);
    },
  });

  // First failing operation, rendered as a single page-level message.
  const failure =
    usersError ??
    createUser.error ??
    renameUser.error ??
    mintKey.error ??
    revokeKey.error ??
    null;
  const error = failure ? describe(failure) : null;
  const teamFailure = teamsError ?? createTeam.error ?? renameTeam.error ?? null;
  const teamError = teamFailure ? describe(teamFailure) : null;

  return {
    users,
    teams,
    error,
    teamError,
    actions: {
      createUser: (vars) => createUser.mutate(vars),
      renameUser: (vars) => renameUser.mutate(vars),
      mintKey: (user) => mintKey.mutate(user),
      revokeKey: (key) => revokeKey.mutate(key),
      createTeam: (name) => createTeam.mutate(name),
      renameTeam: (vars) => renameTeam.mutate(vars),
    },
    pending: {
      creatingUser: createUser.isPending,
      renamingUser: renameUser.isPending,
      mintingKey: mintKey.isPending,
      revokingKey: revokeKey.isPending,
      creatingTeam: createTeam.isPending,
      renamingTeam: renameTeam.isPending,
    },
    secrets: { newPassword, mintedKey },
  };
}

/** Turn an {@link ApiError} (or anything thrown) into a one-line page message. */
function describe(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Admin role required.";
    return `Request failed (${err.status}).`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
