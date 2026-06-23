import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../../auth/require-admin";
import { AdminRoutePage } from "../-dashboard-layout";

export const Route = createFileRoute("/_authed/dashboard/")({
  beforeLoad: requireAdmin,
  component: DashboardPage,
});

function DashboardPage() {
  return <AdminRoutePage fixedSection="dashboard" />;
}
