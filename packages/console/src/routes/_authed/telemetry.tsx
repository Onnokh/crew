import { createFileRoute, redirect } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { authClient } from "../../auth/client";
import { ConversionPanel } from "../../components/telemetry/conversion-panel";
import { QueryVolumePanel } from "../../components/telemetry/query-volume-panel";
import { RecentRetrievalsPanel } from "../../components/telemetry/recent-retrievals-panel";
import { ZeroResultRatePanel } from "../../components/telemetry/zero-result-rate-panel";
import styles from "../../components/telemetry/telemetry.module.scss";

/**
 * Retrieval-telemetry dashboard, backed by the role-gated `/api/telemetry/*`
 * API. Admin-only — gated like `admin.tsx` (the server gates the API regardless).
 */
export const Route = createFileRoute("/_authed/telemetry")({
  beforeLoad: async () => {
    const { data } = await authClient.getSession();
    // `role` is omitted from the inferred session type; read it through a narrow
    // local shape. The server gates the API regardless.
    const role = (data?.user as { role?: string | null } | undefined)?.role;
    if (role !== "admin") {
      throw redirect({ to: "/" });
    }
  },
  component: TelemetryPage,
});

/**
 * One dashboard panel: a title, a one-line description, and a self-contained
 * component that fetches and renders its own data. Later slices ship their panel
 * as a component plus ONE entry in {@link PANELS} below — no layout change here.
 */
type Panel = {
  id: string;
  title: string;
  description: string;
  render: () => ReactNode;
};

// The panel registry — the dashboard's single extension point. To add a panel
// (PLO-49 conversion rate, PLO-50 zero-result rate + query volume, PLO-51 grows
// the recent-Retrievals panel into a tuning view), add its component under
// components/telemetry and append ONE entry here. The shell does the rest.
const PANELS: Panel[] = [
  {
    id: "recent-retrievals",
    title: "Recent retrievals",
    description: "The latest agent queries, with how many Posts each returned.",
    render: () => <RecentRetrievalsPanel />,
  },
  {
    id: "conversion-rate",
    title: "Query→Confirm conversion",
    description:
      "Of retrievals that returned results, the fraction whose querier later confirmed a returned Post — with a per-day trend.",
    render: () => <ConversionPanel />,
  },
  {
    id: "zero-result-rate",
    title: "Zero-result rate",
    description:
      "Of all retrievals, the fraction that returned nothing — the coverage gap — with a per-day trend.",
    render: () => <ZeroResultRatePanel />,
  },
  {
    id: "query-volume",
    title: "Query volume",
    description:
      "How many retrievals ran over the range, with a per-day trend of the overall volume.",
    render: () => <QueryVolumePanel />,
  },
];

function TelemetryPage() {
  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Retrieval telemetry</p>
        <h1 className={styles.heading}>Dashboard</h1>
        <p className={styles.subtitle}>
          What agents are searching for, what comes back, and how the retrieval
          pipeline is performing.
        </p>
      </header>

      <div className={styles.panels}>
        {PANELS.map((panel) => (
          <article key={panel.id} className={styles.panel}>
            <h2 className={styles.panelTitle}>{panel.title}</h2>
            <p className={styles.panelDescription}>{panel.description}</p>
            {panel.render()}
          </article>
        ))}
      </div>
    </section>
  );
}
