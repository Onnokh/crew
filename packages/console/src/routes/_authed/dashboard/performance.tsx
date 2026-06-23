import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAdmin } from "../../../auth/require-admin";

// Layout route for the Performance area. The Overview (`performance.index`) and
// Activity (`performance.activity`) sub-pages render through this Outlet; the
// admin gate lives here so it covers every sub-page.
export const Route = createFileRoute("/_authed/dashboard/performance")({
  beforeLoad: requireAdmin,
  component: Outlet,
});
