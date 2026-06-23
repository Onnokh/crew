import { createFileRoute } from "@tanstack/react-router";
import { AdminRoutePage } from "../-dashboard-layout";

export const Route = createFileRoute("/_authed/dashboard/performance/activity")({
  component: ActivityDashboardPage,
});

function ActivityDashboardPage() {
  return <AdminRoutePage fixedSection="activity" />;
}
