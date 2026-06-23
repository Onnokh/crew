import { createFileRoute, useParams } from "@tanstack/react-router";
import { requireAdmin } from "../../../auth/require-admin";
import { AdminRoutePage } from "../-dashboard-layout";

/**
 * Admin user page (`/dashboard/users/$userId`) — the full-page replacement for
 * the old Edit-member dialog. Admin-only, like its dashboard siblings.
 */
export const Route = createFileRoute("/_authed/dashboard/users/$userId")({
  beforeLoad: requireAdmin,
  component: UserDetailDashboardPage,
});

function UserDetailDashboardPage() {
  const { userId } = useParams({ from: "/_authed/dashboard/users/$userId" });
  return <AdminRoutePage fixedSection={`user:${userId}`} />;
}
