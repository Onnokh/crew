import { customAlphabet } from "nanoid";
import type { Auth } from "./better-auth.js";

/** Safe key metadata as the listing returns it (never the hashed secret). */
export type ApiKeyRow = {
  id: string;
  name: string | null;
  start: string | null;
  enabled: boolean;
  createdAt: string | null;
  lastRequest: string | null;
};

/** The api-key columns we read; the rest (incl. the hash) is ignored. */
type RawApiKey = {
  id: string;
  name?: string | null;
  start?: string | null;
  enabled?: boolean | null;
  createdAt?: Date | string | number | null;
  lastRequest?: Date | string | number | null;
};

/**
 * Seam over better-auth's storage adapter for the `apikey` model. Keyed by
 * `referenceId` (the owning User), so both the admin surface (acting on any
 * User) and the self-service `/api/me` surface (acting on the caller) share one
 * code path. The hashed `key` column is never selected.
 */
export async function keyAdapter(auth: Auth) {
  const { adapter } = await auth.$context;
  return {
    list: async (referenceId: string): Promise<ApiKeyRow[]> => {
      const rows = await adapter.findMany<RawApiKey>({
        model: "apikey",
        where: [{ field: "referenceId", value: referenceId }],
      });
      return rows
        .map((k) => ({
          id: k.id,
          name: k.name ?? null,
          start: k.start ?? null,
          enabled: k.enabled ?? true,
          createdAt: toIso(k.createdAt),
          lastRequest: toIso(k.lastRequest),
        }))
        // Newest first; a never-used key (no createdAt) sorts last.
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    },
    deleteById: (id: string) =>
      adapter.delete({ model: "apikey", where: [{ field: "id", value: id }] }),
    deleteAllFor: (referenceId: string) =>
      adapter.deleteMany({
        model: "apikey",
        where: [{ field: "referenceId", value: referenceId }],
      }),
  };
}

/** Normalize a better-auth date column (Date | epoch | ISO string) to an ISO string. */
export function toIso(
  value: Date | string | number | null | undefined,
): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** A URL-safe one-time password — long enough that it need never be memorised. */
export const generatePassword = customAlphabet(
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789",
  20,
);

/** A short suffix to keep minted key names distinct in better-auth's listing. */
export const shortId = customAlphabet(
  "abcdefghijklmnopqrstuvwxyz0123456789",
  6,
);
