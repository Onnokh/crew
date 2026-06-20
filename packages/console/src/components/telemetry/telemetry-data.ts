/** Shared shapes and query keys for the retrieval-telemetry dashboard. */

/** Query keys for the telemetry reads. */
export const telemetryKeys = {
  recent: ["telemetry", "recent"] as const,
};

/** Mirrors the server's `RetrievalRow` (api/telemetry.ts). */
export type RetrievalRow = {
  id: string;
  situation: string;
  repo: string | null;
  resultCount: number;
  createdAt: number;
};
