import { createFileRoute } from "@tanstack/react-router";
import { AdminRoutePage } from "../-dashboard-layout";

export const Route = createFileRoute(
  "/_authed/dashboard/performance/retrievals",
)({
  component: RetrievalsDashboardPage,
});

function RetrievalsDashboardPage() {
  return <AdminRoutePage fixedSection="retrievals" />;
}
