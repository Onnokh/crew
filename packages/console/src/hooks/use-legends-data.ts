import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type {
  ProjectPostCount,
  UserUsageItem,
} from "../components/telemetry/telemetry-data";

/** Mirrors the server's `/api/community/legends` payload. */
export type LegendsData = {
  users: UserUsageItem[];
  projects: ProjectPostCount[];
};

/**
 * The member-facing Hall of Legends read: the caller's own Team's top users and
 * per-project post counts. Backed by `/api/community/legends` (session-gated,
 * any role — the user-facing counterpart to the admin telemetry API).
 */
export function useLegendsData() {
  return useQuery({
    queryKey: ["community", "legends"] as const,
    queryFn: () => apiFetch<LegendsData>("/api/community/legends"),
  });
}
