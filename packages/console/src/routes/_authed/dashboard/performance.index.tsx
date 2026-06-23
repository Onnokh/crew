import { createFileRoute } from "@tanstack/react-router";
import { AdminRoutePage } from "../-dashboard-layout";

export const Route = createFileRoute("/_authed/dashboard/performance/")({
  component: PerformanceOverviewPage,
});

function PerformanceOverviewPage() {
  return <AdminRoutePage fixedSection="usage" />;
}
