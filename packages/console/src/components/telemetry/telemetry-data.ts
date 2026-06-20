/** Shared shapes and query keys for the retrieval-telemetry dashboard. */

/** Query keys for the telemetry reads. */
export const telemetryKeys = {
  recent: ["telemetry", "recent"] as const,
  conversion: ["telemetry", "conversion"] as const,
  coverage: ["telemetry", "coverage"] as const,
};

/** Mirrors the server's `RetrievalRow` (api/telemetry.ts). */
export type RetrievalRow = {
  id: string;
  situation: string;
  repo: string | null;
  resultCount: number;
  createdAt: number;
};

/** Mirrors the server's `ConversionPoint` (api/telemetry.ts) — one day's counts. */
export type ConversionPoint = {
  from: number;
  to: number;
  withResults: number;
  converted: number;
};

/** Mirrors the server's `ConversionPanelData` (api/telemetry.ts). */
export type ConversionPanelData = {
  from: number;
  to: number;
  windowMs: number;
  withResults: number;
  converted: number;
  trend: ConversionPoint[];
};

/** Mirrors the server's `CoveragePoint` (api/telemetry.ts) — one day's counts. */
export type CoveragePoint = {
  from: number;
  to: number;
  total: number;
  zeroResults: number;
};

/** Mirrors the server's `CoveragePanelData` (api/telemetry.ts). */
export type CoveragePanelData = {
  from: number;
  to: number;
  total: number;
  zeroResults: number;
  trend: CoveragePoint[];
};
