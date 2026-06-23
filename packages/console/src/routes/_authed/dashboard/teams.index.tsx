import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../../auth/require-admin";
import { AdminRoutePage } from "../-dashboard-layout";

export const Route = createFileRoute("/_authed/dashboard/teams/")({
  beforeLoad: requireAdmin,
  component: TeamsDashboardPage,
});

function TeamsDashboardPage() {
  return <AdminRoutePage fixedSection="teams" />;
}
