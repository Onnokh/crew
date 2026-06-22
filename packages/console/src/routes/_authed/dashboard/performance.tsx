import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../../auth/require-admin";
import { AdminRoutePage } from "../-dashboard-layout";

export const Route = createFileRoute("/_authed/dashboard/performance")({
  beforeLoad: requireAdmin,
  component: PerformanceDashboardPage,
});

function PerformanceDashboardPage() {
  return <AdminRoutePage fixedSection="usage" />;
}
