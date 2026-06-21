import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../../auth/require-admin";
import { AdminRoutePage } from "../admin";

export const Route = createFileRoute("/_authed/dashboard/performance")({
  beforeLoad: requireAdmin,
  component: PerformanceDashboardPage,
});

function PerformanceDashboardPage() {
  return <AdminRoutePage fixedSection="usage" />;
}
