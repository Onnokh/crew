import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "../../../auth/require-admin";
import { AdminRoutePage } from "../-dashboard-layout";

export const Route = createFileRoute("/_authed/dashboard/settings")({
  beforeLoad: requireAdmin,
  component: SettingsDashboardPage,
});

function SettingsDashboardPage() {
  return <AdminRoutePage fixedSection="settings" />;
}
