import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, apiFetch } from "../api/client";
import type { ApiKey } from "../components/account/api-keys-section";

/** The signed-in User's own profile, as `/api/me` returns it. */
export type Profile = {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  teamId: string | null;
  teamName: string | null;
  keys: ApiKey[];
};

export type ProfileData = {
  profile: Profile | undefined;
  loading: boolean;
  error: string | null;
  /** Set after a successful password change so the form can confirm + reset. */
  passwordChanged: boolean;
  /** Show-once secret for a key the User just minted for themselves, else null. */
  mintedKey: string | null;
  actions: {
    changePassword: (
      vars: { currentPassword: string; newPassword: string },
      opts?: { onSuccess?: () => void },
    ) => void;
    mintKey: () => void;
    revokeKey: (key: ApiKey) => void;
  };
  pending: {
    changingPassword: boolean;
    mintingKey: boolean;
    revokingKey: boolean;
  };
};

const meKey = ["me"] as const;

/**
 * The self-service data layer for `/profile`: fetches the caller's own account
 * from `/api/me` and exposes the three things a User may do to themselves —
 * change their password (current + new), mint a key, revoke a key. Mirrors the
 * shape of {@link useAdminData} so the page can stay presentational.
 */
export function useProfileData(): ProfileData {
  const queryClient = useQueryClient();

  const { data, error, isLoading } = useQuery({
    queryKey: meKey,
    queryFn: () => apiFetch<Profile>("/api/me"),
  });

  const [passwordChanged, setPasswordChanged] = useState(false);
  const [mintedKey, setMintedKey] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: meKey });

  const changePassword = useMutation({
    mutationFn: (vars: { currentPassword: string; newPassword: string }) =>
      apiFetch("/api/me/password", {
        method: "POST",
        body: JSON.stringify(vars),
      }),
    onSuccess: () => setPasswordChanged(true),
  });

  const mintKey = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string; key: string }>("/api/me/keys", { method: "POST" }),
    onSuccess: async ({ key }) => {
      setMintedKey(key);
      await invalidate();
    },
  });

  const revokeKey = useMutation({
    mutationFn: (key: ApiKey) =>
      apiFetch(`/api/me/keys/${key.id}`, { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });

  const failure =
    error ?? changePassword.error ?? mintKey.error ?? revokeKey.error ?? null;

  return {
    profile: data,
    loading: isLoading,
    error: failure ? describe(failure) : null,
    passwordChanged,
    mintedKey,
    actions: {
      changePassword: (vars, opts) => {
        setPasswordChanged(false);
        changePassword.mutate(vars, opts);
      },
      mintKey: () => mintKey.mutate(),
      revokeKey: (key) => revokeKey.mutate(key),
    },
    pending: {
      changingPassword: changePassword.isPending,
      mintingKey: mintKey.isPending,
      revokingKey: revokeKey.isPending,
    },
  };
}

/** Turn an {@link ApiError} (or anything thrown) into a one-line page message. */
function describe(err: unknown): string {
  if (err instanceof ApiError) {
    try {
      const message = (JSON.parse(err.body) as { error?: unknown }).error;
      if (typeof message === "string" && message) return message;
    } catch {
      // Non-JSON body — fall through to the generic message.
    }
    return `Request failed (${err.status}).`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}
