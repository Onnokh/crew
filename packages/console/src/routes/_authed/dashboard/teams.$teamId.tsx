import { createFileRoute, useParams } from "@tanstack/react-router";
import { requireAdmin } from "../../../auth/require-admin";
import { AdminRoutePage } from "../-dashboard-layout";

export const Route = createFileRoute("/_authed/dashboard/teams/$teamId")({
  beforeLoad: requireAdmin,
  component: TeamDetailDashboardPage,
});

function TeamDetailDashboardPage() {
  const { teamId } = useParams({ from: "/_authed/dashboard/teams/$teamId" });
  return <AdminRoutePage fixedSection={`team:${teamId}`} />;
}
